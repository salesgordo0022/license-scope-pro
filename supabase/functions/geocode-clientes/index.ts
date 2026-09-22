// Geocode clientes usando Places API (New) searchText via gateway Google Maps
// Pesquisa por nome da empresa + endereço, retornando coordenadas precisas.

import { autenticar, json, respostaPreflight } from '../_shared/auth.ts';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';

/** Teto de itens por chamada — cada item vira até 4 buscas pagas na Places API. */
const MAX_ITENS_POR_CHAMADA = 50;

type Item = {
  id: string;
  nome?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
};

/**
 * Resolve as coordenadas de um cliente tentando consultas cada vez mais amplas:
 * nome + endereço completo, depois nome + cidade, depois só o endereço e, por
 * último, só a cidade. Para na primeira que devolver uma localização.
 */
async function searchOne(item: Item, lovableKey: string, gmapsKey: string) {
  const tentativas: string[] = [];
  const base = [item.endereco, item.cidade, item.estado, 'Brasil'].filter(Boolean).join(', ');
  if (item.nome && base) tentativas.push(`${item.nome}, ${base}`);
  if (item.nome && item.cidade) tentativas.push(`${item.nome}, ${item.cidade}, ${item.estado ?? ''}, Brasil`);
  if (base) tentativas.push(base);
  if (item.cidade) tentativas.push([item.cidade, item.estado, 'Brasil'].filter(Boolean).join(', '));

  for (const q of tentativas) {
    try {
      const r = await fetch(`${GATEWAY_URL}/places/v1/places:searchText`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableKey}`,
          'X-Connection-Api-Key': gmapsKey,
          'Content-Type': 'application/json',
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location',
        },
        body: JSON.stringify({ textQuery: q, regionCode: 'BR', maxResultCount: 1 }),
      });
      if (!r.ok) continue;
      const data = await r.json();
      const p = data.places?.[0];
      if (p?.location?.latitude && p?.location?.longitude) {
        return {
          id: item.id,
          lat: p.location.latitude,
          lng: p.location.longitude,
          matched: p.formattedAddress || p.displayName?.text || q,
          query: q,
        };
      }
    } catch {
      // tenta próxima
    }
  }
  return { id: item.id, lat: null, lng: null, matched: null, query: null };
}

/**
 * Geocodifica uma lista de clientes para o mapa da tela "Rotas & GPS".
 *
 * Exige usuário autenticado: cada item consumido aqui vira chamada paga na
 * Places API do Google. Sem a verificação — como estava antes — qualquer pessoa
 * podia disparar a function em loop e gerar fatura no projeto do dono.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return respostaPreflight(req);

  try {
    const { erro } = await autenticar(req);
    if (erro) return erro;

    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const gmapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!lovableKey || !gmapsKey) {
      return json(req, { success: false, error: 'Credenciais Google Maps ausentes' }, 503);
    }

    const { items } = (await req.json()) as { items: Item[] };
    if (!Array.isArray(items) || items.length === 0) {
      return json(req, { success: true, results: [] });
    }

    // Processa em série, com uma pausa entre itens, para respeitar o rate
    // limit do gateway. O corte em MAX_ITENS_POR_CHAMADA limita o custo de
    // uma única requisição.
    const results = [];
    for (const item of items.slice(0, MAX_ITENS_POR_CHAMADA)) {
      results.push(await searchOne(item, lovableKey, gmapsKey));
      await new Promise((res) => setTimeout(res, 50));
    }

    return json(req, { success: true, results });
  } catch (e) {
    console.error('[geocode-clientes] erro:', e);
    return json(req, { success: false, error: 'Falha ao geocodificar' }, 500);
  }
});
