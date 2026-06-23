// Geocode clientes usando Places API (New) searchText via gateway Google Maps
// Pesquisa por nome da empresa + endereço, retornando coordenadas precisas.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_maps';

type Item = {
  id: string;
  nome?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
};

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const lovableKey = Deno.env.get('LOVABLE_API_KEY');
    const gmapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!lovableKey || !gmapsKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Credenciais Google Maps ausentes' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { items } = (await req.json()) as { items: Item[] };
    if (!Array.isArray(items) || items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, results: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limita a 50 por chamada para não estourar
    const slice = items.slice(0, 50);
    const results = [];
    for (const item of slice) {
      const r = await searchOne(item, lovableKey, gmapsKey);
      results.push(r);
      await new Promise((res) => setTimeout(res, 50));
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: String(e?.message || e) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
