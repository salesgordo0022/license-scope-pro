import { supabase } from '@/integrations/supabase/client';

/**
 * Regras do funil de vendas com prospectos.
 *
 * Empresa em negociação é PROSPECTO (tabela prospectos), não cliente: não
 * aparece na aba Clientes, nos contratos, nas licenças etc. Ela só vira
 * cliente quando a venda chega em "fechado" — a função SQL
 * prospecto_converter cria o cliente e liga a venda a ele numa transação.
 */
export interface DadosProspecto {
  nome_empresa: string;
  cnpj?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string | null;
  cidade?: string | null;
  estado?: string | null;
  cep?: string | null;
  segmento?: string | null;
  regime_tributario?: string | null;
  nome_contato?: string | null;
  observacoes?: string | null;
  origem?: string;
}

/** Pipeline ativo da empresa (cria o "Padrão" se não houver nenhum). */
export async function garantirPipeline(): Promise<string> {
  const { data: existente } = await supabase.from('pipelines_vendas').select('id').eq('ativo', true).order('ordem').order('created_at').limit(1).maybeSingle();
  if (existente?.id) return existente.id;
  const { data: perfil } = await supabase.from('usuario_perfil').select('empresa_id').maybeSingle();
  const { data, error } = await supabase.from('pipelines_vendas').insert({ nome: 'Padrão', empresa_id: perfil?.empresa_id || null }).select('id').single();
  if (error || !data) throw new Error('Não foi possível criar o pipeline de vendas');
  return data.id;
}

const soDigitos = (s: string | null | undefined) => (s || '').replace(/\D/g, '');

/** Cria o prospecto (ou reaproveita o que já existe com o mesmo CNPJ). */
export async function criarProspecto(dados: DadosProspecto): Promise<string> {
  const cnpj = soDigitos(dados.cnpj);
  if (cnpj) {
    const { data: jaCliente } = await supabase.from('clientes').select('id, nome_empresa, cnpj').not('cnpj', 'is', null);
    if ((jaCliente || []).some((c) => soDigitos(c.cnpj) === cnpj)) throw new Error('Esta empresa já é cliente');
    const { data: jaProspecto } = await supabase.from('prospectos').select('id, cnpj').is('cliente_id', null).not('cnpj', 'is', null);
    const igual = (jaProspecto || []).find((p) => soDigitos(p.cnpj) === cnpj);
    if (igual) return igual.id;
  }
  const { data: perfil } = await supabase.from('usuario_perfil').select('empresa_id').maybeSingle();
  const { data, error } = await supabase
    .from('prospectos')
    .insert({ ...dados, cnpj: dados.cnpj || null, empresa_id: perfil?.empresa_id ?? null })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message || 'Não foi possível criar o prospecto');
  return data.id;
}

/** Põe o prospecto no funil como lead (se ainda não tiver venda em aberto). */
export async function enviarAoFunil(dados: DadosProspecto, extras: { sistema?: string | null; origem?: string } = {}) {
  const prospectoId = await criarProspecto(dados);
  const { data: emAberto } = await supabase
    .from('revendas')
    .select('id')
    .eq('prospecto_id', prospectoId)
    .not('status_venda', 'in', '(fechado,perdido)')
    .limit(1)
    .maybeSingle();
  if (emAberto) return { prospectoId, revendaId: emAberto.id, jaEstava: true };

  const pipelineId = await garantirPipeline();
  const { data: perfil } = await supabase.from('usuario_perfil').select('id, empresa_id').maybeSingle();
  const { data, error } = await supabase
    .from('revendas')
    .insert({
      prospecto_id: prospectoId,
      cliente_id: null,
      status_venda: 'lead',
      temperatura: 'morno',
      sistema: extras.sistema ?? null,
      origem: extras.origem ?? dados.origem ?? null,
      pipeline_id: pipelineId,
      empresa_id: perfil?.empresa_id ?? null,
      revendedor_id: perfil?.id ?? null,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message || 'Não foi possível criar o lead');
  return { prospectoId, revendaId: data.id, jaEstava: false };
}

/** Venda fechada de prospecto → vira cliente. Devolve o id do cliente. */
export async function converterProspectoDaVenda(revendaId: string): Promise<string> {
  const { data, error } = await supabase.rpc('prospecto_converter', { p_revenda_id: revendaId });
  if (error) throw new Error(error.message);
  return data as string;
}
