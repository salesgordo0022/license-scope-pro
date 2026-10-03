import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Plus,
  Search,
  Key,
  Calendar,
  MoreHorizontal,
  Edit,
  Trash2,
  Users,
  Check,
  X,
  Loader2,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Wallet,
  Monitor,
} from '@/components/icons';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';
import { cn, dataLocalIso } from '@/lib/utils';
import { useAbrirNovo } from '@/hooks/use-abrir-novo';

type StatusType = Database['public']['Enums']['status_type'];
type Cliente = Database['public']['Tables']['clientes']['Row'];

interface Licenca {
  id: string;
  empresa_id: string | null;
  cliente_id: string;
  tipo: string;
  quantidade: number | null;
  validade: string | null;
  status: StatusType | null;
  created_at: string | null;
  data_inicio: string | null;
  dia_vencimento: number | null;
  valor_custo: number | null;
  valor_venda: number | null;
  data_pagamento_sistema: string | null;
  modelo_cobranca: string | null;
  clientes?: { nome_empresa: string } | null;
}

/**
 * Cada sistema tem um jeito de controlar a licença:
 * - Pontotel: por **vidas** (quantidade de funcionários no ponto) → campo `quantidade`;
 * - DigiSat: por **data** de validade da licença → campo `validade`;
 * - demais (AgroNota, ImperMEI...): mensalidade simples.
 * O tipo da licença guarda o nome do sistema (às vezes com espaço sobrando).
 */
type Controle = 'vidas' | 'data' | 'mensal';

function controleDoSistema(tipo: string | null | undefined): Controle {
  const nome = (tipo || '').trim().toUpperCase();
  if (nome.includes('PONTOTEL')) return 'vidas';
  if (nome.includes('DIGISAT')) return 'data';
  return 'mensal';
}

const ABAS: { valor: Controle; titulo: string; descricao: string; icone: typeof Users }[] = [
  { valor: 'vidas', titulo: 'Pontotel', descricao: 'Controle por vidas', icone: Users },
  { valor: 'data', titulo: 'DigiSat', descricao: 'Controle por validade', icone: Calendar },
  { valor: 'mensal', titulo: 'Outros sistemas', descricao: 'Mensalidade simples', icone: Monitor },
];

const formatarData = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR') : '—');

const moeda = (v: number | null) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

/** Dias entre hoje e a data (negativo = já passou). */
function diasAte(iso: string) {
  const hoje = new Date(`${dataLocalIso()}T00:00:00`).getTime();
  const alvo = new Date(`${iso.slice(0, 10)}T00:00:00`).getTime();
  return Math.round((alvo - hoje) / 86_400_000);
}

/** Soma meses a uma data AAAA-MM-DD sem pular para o mês seguinte em dias 29–31. */
function somarMeses(iso: string, meses: number) {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimoDia));
  return dataLocalIso(alvo);
}

const formVazio = () => ({
  cliente_id: '',
  tipo: '',
  quantidade: 1,
  validade: '',
  status: 'ativo' as StatusType,
  data_inicio: dataLocalIso(),
  dia_vencimento: 10,
  valor_custo: 0,
  valor_venda: 0,
  data_pagamento_sistema: '',
  modelo_cobranca: 'saas_full',
});

/**
 * Controle de licenças por cliente, separado pelo jeito que cada sistema é
 * cobrado: vidas (Pontotel), validade (DigiSat) e mensalidade (demais).
 */
export default function Licencas() {
  const [licencas, setLicencas] = useState<Licenca[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [sistemas, setSistemas] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [aba, setAba] = useState<Controle>('vidas');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ativo');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLicenca, setEditingLicenca] = useState<Licenca | null>(null);
  const [formData, setFormData] = useState(formVazio);

  // Edição rápida na tabela (vidas ou validade).
  const [edicao, setEdicao] = useState<{ id: string; valor: string } | null>(null);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  /** Carrega licenças, clientes ativos (seletor do formulário) e sistemas. */
  const fetchData = async () => {
    try {
      const [licencasRes, clientesRes, sistemasRes] = await Promise.all([
        supabase.from('licencas').select('*, clientes(nome_empresa)').order('created_at', { ascending: false }),
        supabase.from('clientes').select('*').eq('status', 'ativo').order('nome_empresa'),
        supabase.from('sistemas').select('nome').eq('ativo', true).order('nome'),
      ]);

      if (licencasRes.error) throw licencasRes.error;
      if (clientesRes.error) throw clientesRes.error;

      setLicencas((licencasRes.data || []) as unknown as Licenca[]);
      setClientes(clientesRes.data || []);
      setSistemas((sistemasRes.data || []).map((s) => s.nome));
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const gerarPagamentoMensal = async (licenca: {
    cliente_id: string;
    empresa_id: string | null;
    valor_venda: number;
    dia_vencimento: number;
  }) => {
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1;
    const anoAtual = hoje.getFullYear();
    const diaVenc = licenca.dia_vencimento;

    // Gerar vencimento para o mês atual
    const dataVencimento = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-${String(diaVenc).padStart(2, '0')}`;

    const { error } = await supabase.from('pagamentos').insert({
      cliente_id: licenca.cliente_id,
      empresa_id: licenca.empresa_id,
      tipo: 'mensalidade',
      valor: licenca.valor_venda,
      desconto: 0,
      valor_final: licenca.valor_venda,
      data_vencimento: dataVencimento,
      status: 'pendente',
      referencia_mes: mesAtual,
      referencia_ano: anoAtual,
    });

    if (error) {
      console.error('Erro ao gerar pagamento:', error);
      toast.error('Licença criada, mas houve erro ao gerar pagamento');
    } else {
      toast.success('Pagamento mensal gerado automaticamente!');
    }
  };

  const controleForm = controleDoSistema(formData.tipo);

  /** Salva o formulário: cria um registro novo ou atualiza o que está em edição. */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.cliente_id || !formData.tipo) {
      toast.error('Selecione o cliente e o sistema');
      return;
    }
    if (controleForm === 'vidas' && (!formData.quantidade || formData.quantidade < 1)) {
      toast.error('Informe a quantidade de vidas');
      return;
    }
    if (controleForm === 'data' && !formData.validade) {
      toast.error('Informe a data de validade da licença DigiSat');
      return;
    }

    const dados = {
      cliente_id: formData.cliente_id,
      tipo: formData.tipo,
      // Só o Pontotel conta vidas; os demais ficam com 1 licença.
      quantidade: controleForm === 'vidas' ? formData.quantidade : 1,
      validade: formData.validade || null,
      status: formData.status,
      data_inicio: formData.data_inicio || null,
      dia_vencimento: formData.dia_vencimento,
      valor_custo: formData.valor_custo,
      valor_venda: formData.valor_venda,
      data_pagamento_sistema: formData.data_pagamento_sistema || null,
      modelo_cobranca: formData.modelo_cobranca,
    };

    try {
      if (editingLicenca) {
        const { error } = await supabase.from('licencas').update(dados).eq('id', editingLicenca.id);
        if (error) throw error;
        toast.success('Licença atualizada com sucesso!');
      } else {
        const { data: profile } = await supabase.from('usuario_perfil').select('empresa_id').single();
        const { data: cliente } = await supabase.from('clientes').select('empresa_id').eq('id', formData.cliente_id).single();
        const empresaId = cliente?.empresa_id || profile?.empresa_id || null;

        const { error } = await supabase.from('licencas').insert({ ...dados, empresa_id: empresaId });
        if (error) throw error;
        toast.success('Licença criada com sucesso!');

        // Gerar pagamento automaticamente com valor de venda
        if (formData.valor_venda > 0) {
          await gerarPagamentoMensal({
            cliente_id: formData.cliente_id,
            empresa_id: empresaId,
            valor_venda: formData.valor_venda,
            dia_vencimento: formData.dia_vencimento,
          });
        }
      }

      setDialogOpen(false);
      setEditingLicenca(null);
      setFormData(formVazio());
      fetchData();
    } catch (error) {
      console.error('Error saving licenca:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao salvar licença');
    }
  };

  const abrirNova = () => {
    setEditingLicenca(null);
    const form = formVazio();
    // Já sugere um sistema da aba aberta.
    const sugestao = sistemas.find((s) => controleDoSistema(s) === aba);
    if (sugestao) form.tipo = sugestao;
    setFormData(form);
    setDialogOpen(true);
  };

  useAbrirNovo(() => abrirNova(), !loading);

  /** Preenche o formulário com o registro escolhido e abre o diálogo de edição. */
  const handleEdit = (licenca: Licenca) => {
    setEditingLicenca(licenca);
    setFormData({
      cliente_id: licenca.cliente_id,
      tipo: licenca.tipo,
      quantidade: licenca.quantidade || 1,
      validade: licenca.validade || '',
      status: licenca.status || 'ativo',
      data_inicio: licenca.data_inicio || '',
      dia_vencimento: licenca.dia_vencimento || 10,
      valor_custo: licenca.valor_custo || 0,
      valor_venda: licenca.valor_venda || 0,
      data_pagamento_sistema: licenca.data_pagamento_sistema || '',
      modelo_cobranca: licenca.modelo_cobranca || 'saas_full',
    });
    setDialogOpen(true);
  };

  /** Exclui o registro após confirmação do usuário. */
  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta licença?')) return;

    try {
      const { error } = await supabase.from('licencas').delete().eq('id', id);
      if (error) throw error;
      toast.success('Licença excluída com sucesso!');
      fetchData();
    } catch (error) {
      console.error('Error deleting licenca:', error);
      toast.error('Erro ao excluir licença');
    }
  };

  /** Atualiza um campo de uma licença e reflete na lista sem recarregar tudo. */
  const atualizarCampo = async (licenca: Licenca, campos: Partial<Pick<Licenca, 'quantidade' | 'validade'>>, mensagem: string) => {
    setSalvandoEdicao(true);
    const { error } = await supabase.from('licencas').update(campos).eq('id', licenca.id);
    setSalvandoEdicao(false);
    if (error) {
      toast.error('Erro ao salvar', { description: error.message });
      return false;
    }
    setLicencas((lista) => lista.map((l) => (l.id === licenca.id ? { ...l, ...campos } : l)));
    toast.success(mensagem);
    return true;
  };

  const salvarEdicao = async (licenca: Licenca) => {
    if (!edicao || salvandoEdicao) return;
    if (controleDoSistema(licenca.tipo) === 'vidas') {
      const vidas = parseInt(edicao.valor, 10);
      if (!vidas || vidas < 1) {
        toast.error('A quantidade de vidas precisa ser 1 ou mais');
        return;
      }
      if (vidas === licenca.quantidade) return setEdicao(null);
      if (await atualizarCampo(licenca, { quantidade: vidas }, `${vidas} vida${vidas > 1 ? 's' : ''} registrada${vidas > 1 ? 's' : ''}`)) setEdicao(null);
    } else {
      const validade = edicao.valor || null;
      if (validade === licenca.validade) return setEdicao(null);
      if (await atualizarCampo(licenca, { validade }, validade ? `Validade: ${formatarData(validade)}` : 'Validade removida')) setEdicao(null);
    }
  };

  /** Renova a licença DigiSat a partir da validade atual (ou de hoje, se já venceu ou não tem). */
  const renovar = (licenca: Licenca, meses: number) => {
    const base = licenca.validade && diasAte(licenca.validade) >= 0 ? licenca.validade : dataLocalIso();
    const nova = somarMeses(base, meses);
    atualizarCampo(licenca, { validade: nova }, `Licença renovada até ${formatarData(nova)}`);
  };

  /** Licenças da aba aberta, depois da busca e do filtro de status. */
  const daAba = useMemo(() => licencas.filter((l) => controleDoSistema(l.tipo) === aba), [licencas, aba]);
  const filteredLicencas = daAba.filter((licenca) => {
    const termo = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !termo || licenca.clientes?.nome_empresa?.toLowerCase().includes(termo) || licenca.tipo.toLowerCase().includes(termo);
    const matchesStatus = filterStatus === 'all' || licenca.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const contagemAba = (c: Controle) => licencas.filter((l) => controleDoSistema(l.tipo) === c && l.status === 'ativo').length;

  // Indicadores do topo, conforme a aba.
  const ativasDaAba = daAba.filter((l) => l.status === 'ativo');
  const receitaAba = ativasDaAba.reduce((s, l) => s + (l.valor_venda || 0), 0);
  const indicadores =
    aba === 'vidas'
      ? [
          { titulo: 'Vidas ativas', valor: ativasDaAba.reduce((s, l) => s + (l.quantidade || 0), 0).toString(), icone: Users, cor: 'bg-blue-50 text-blue-600' },
          { titulo: 'Clientes Pontotel', valor: new Set(ativasDaAba.map((l) => l.cliente_id)).size.toString(), icone: CheckCircle, cor: 'bg-emerald-50 text-emerald-600' },
          { titulo: 'Receita mensal', valor: moeda(receitaAba), icone: Wallet, cor: 'bg-violet-50 text-violet-600' },
        ]
      : aba === 'data'
        ? [
            { titulo: 'Vencidas', valor: ativasDaAba.filter((l) => l.validade && diasAte(l.validade) < 0).length.toString(), icone: AlertTriangle, cor: 'bg-red-50 text-red-500' },
            {
              titulo: 'Vencem em 30 dias',
              valor: ativasDaAba.filter((l) => l.validade && diasAte(l.validade) >= 0 && diasAte(l.validade) <= 30).length.toString(),
              icone: Calendar,
              cor: 'bg-amber-50 text-amber-500',
            },
            { titulo: 'Sem data definida', valor: ativasDaAba.filter((l) => !l.validade).length.toString(), icone: Key, cor: 'bg-slate-100 text-slate-500' },
          ]
        : [
            { titulo: 'Licenças ativas', valor: ativasDaAba.length.toString(), icone: Key, cor: 'bg-blue-50 text-blue-600' },
            { titulo: 'Sistemas', valor: new Set(ativasDaAba.map((l) => l.tipo.trim())).size.toString(), icone: Monitor, cor: 'bg-emerald-50 text-emerald-600' },
            { titulo: 'Receita mensal', valor: moeda(receitaAba), icone: Wallet, cor: 'bg-violet-50 text-violet-600' },
          ];

  /** Selo de status; para DigiSat considera a validade. */
  const getStatusBadge = (licenca: Licenca) => {
    if (licenca.status === 'ativo' && licenca.validade && diasAte(licenca.validade) < 0) {
      return <span className="status-badge status-vencido">vencido</span>;
    }
    const statusConfig: Record<string, string> = {
      ativo: 'status-ativo',
      inativo: 'status-inativo',
      pendente: 'status-pendente',
      vencido: 'status-vencido',
    };
    return <span className={`status-badge ${statusConfig[licenca.status || 'ativo']}`}>{licenca.status || 'ativo'}</span>;
  };

  /** Texto e cor da situação da validade (DigiSat). */
  const situacaoValidade = (validade: string | null) => {
    if (!validade) return { texto: 'Definir data', classe: 'bg-slate-100 text-slate-600' };
    const dias = diasAte(validade);
    if (dias < 0) return { texto: `Venceu há ${-dias} dia${dias === -1 ? '' : 's'}`, classe: 'bg-red-50 text-red-600' };
    if (dias === 0) return { texto: 'Vence hoje', classe: 'bg-red-50 text-red-600' };
    if (dias <= 30) return { texto: `Vence em ${dias} dia${dias === 1 ? '' : 's'}`, classe: 'bg-amber-50 text-amber-700' };
    return { texto: `${dias} dias restantes`, classe: 'bg-emerald-50 text-emerald-700' };
  };

  const colunas = 8;

  /** Campo editável (vidas ou validade) com salvar/cancelar. É função, não
   *  componente: um componente declarado aqui seria recriado a cada tecla e o
   *  input perderia o foco. */
  const campoEditavel = (licenca: Licenca) => {
    const tipoCampo = controleDoSistema(licenca.tipo) === 'vidas' ? 'number' : 'date';
    return (
      <div className="flex items-center gap-1">
        <Input
          autoFocus
          type={tipoCampo}
          min={tipoCampo === 'number' ? 1 : undefined}
          value={edicao?.valor ?? ''}
          disabled={salvandoEdicao}
          onChange={(e) => setEdicao({ id: licenca.id, valor: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') salvarEdicao(licenca);
            if (e.key === 'Escape') setEdicao(null);
          }}
          className={cn('h-8 text-sm', tipoCampo === 'number' ? 'w-20' : 'w-36')}
        />
        <button
          type="button"
          onClick={() => salvarEdicao(licenca)}
          disabled={salvandoEdicao}
          title="Salvar (Enter)"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {salvandoEdicao ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setEdicao(null)}
          title="Cancelar (Esc)"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="page-header mb-0">
          <h1 className="page-title">Licenças</h1>
          <p className="page-description">Pontotel por vidas, DigiSat por validade e os demais sistemas por mensalidade</p>
        </div>
        <Button onClick={abrirNova}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Licença
        </Button>
      </motion.div>

      {/* Abas por tipo de controle */}
      <div className="grid gap-3 sm:grid-cols-3">
        {ABAS.map((a) => (
          <button
            key={a.valor}
            type="button"
            onClick={() => {
              setAba(a.valor);
              setEdicao(null);
            }}
            className={cn(
              'flex items-center gap-3 rounded-2xl border p-4 text-left transition',
              aba === a.valor
                ? 'border-primary bg-primary text-white shadow-[0_10px_24px_-12px_rgba(37,99,235,0.8)]'
                : 'border-border/70 bg-card hover:border-primary/40 hover:bg-primary/5'
            )}
          >
            <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', aba === a.valor ? 'bg-white/15' : 'bg-primary/10 text-primary')}>
              <a.icone className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{a.titulo}</span>
              <span className={cn('block text-xs', aba === a.valor ? 'text-white/80' : 'text-muted-foreground')}>{a.descricao}</span>
            </span>
            <span className={cn('rounded-full px-2.5 py-0.5 text-sm font-semibold', aba === a.valor ? 'bg-white/20' : 'bg-muted text-foreground')}>
              {contagemAba(a.valor)}
            </span>
          </button>
        ))}
      </div>

      {/* Indicadores da aba */}
      <div className="grid gap-3 sm:grid-cols-3">
        {indicadores.map((ind) => (
          <Card key={ind.titulo}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', ind.cor)}>
                <ind.icone className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">{ind.titulo}</p>
                <p className="text-xl font-bold">{loading ? '—' : ind.valor}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por cliente ou sistema..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ativo">Ativo</SelectItem>
                <SelectItem value="inativo">Inativo</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="vencido">Vencido</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="sticky left-0 z-20 bg-card shadow-[6px_0_8px_-6px_rgba(15,27,61,0.18)]">Cliente</th>
                  <th>Sistema</th>
                  {aba === 'vidas' && <th>Vidas</th>}
                  {aba === 'data' && <th>Validade da licença</th>}
                  {aba === 'mensal' && <th>Início</th>}
                  <th>Dia Venc.</th>
                  <th>Valor Custo</th>
                  <th>Valor Venda</th>
                  <th>Status</th>
                  <th className="w-[50px]"></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={colunas} className="py-8 text-center text-muted-foreground">
                      Carregando...
                    </td>
                  </tr>
                ) : filteredLicencas.length === 0 ? (
                  <tr>
                    <td colSpan={colunas} className="py-8 text-center text-muted-foreground">
                      Nenhuma licença nesta aba
                    </td>
                  </tr>
                ) : (
                  filteredLicencas.map((licenca) => {
                    const editando = edicao?.id === licenca.id;
                    const situacao = situacaoValidade(licenca.validade);
                    const vidas = licenca.quantidade || 0;
                    return (
                      <tr key={licenca.id} className="group">
                        <td className="sticky left-0 z-10 min-w-[150px] max-w-[260px] bg-card font-medium shadow-[6px_0_8px_-6px_rgba(15,27,61,0.18)] group-hover:bg-muted">
                          <span className="block truncate" title={licenca.clientes?.nome_empresa}>
                            {licenca.clientes?.nome_empresa || '-'}
                          </span>
                        </td>
                        <td>
                          <Badge variant="outline" className="whitespace-nowrap uppercase">
                            {licenca.tipo.trim()}
                          </Badge>
                        </td>

                        {aba === 'vidas' && (
                          <td>
                            {editando ? (
                              campoEditavel(licenca)
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEdicao({ id: licenca.id, valor: String(vidas || 1) })}
                                title="Clique para alterar as vidas"
                                className="group/v inline-flex items-center gap-2 rounded-lg bg-blue-50 px-2.5 py-1 font-semibold text-blue-700 hover:bg-blue-100"
                              >
                                <Users className="h-4 w-4" />
                                {vidas} vida{vidas === 1 ? '' : 's'}
                                <Edit className="h-3.5 w-3.5 opacity-0 transition group-hover/v:opacity-100" />
                              </button>
                            )}
                            {!editando && vidas > 0 && (licenca.valor_venda || 0) > 0 && (
                              <span className="mt-1 block text-[11px] text-muted-foreground">{moeda((licenca.valor_venda || 0) / vidas)} por vida</span>
                            )}
                          </td>
                        )}

                        {aba === 'data' && (
                          <td>
                            {editando ? (
                              campoEditavel(licenca)
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEdicao({ id: licenca.id, valor: licenca.validade || '' })}
                                title="Clique para alterar a validade"
                                className="group/v flex items-center gap-2 text-left"
                              >
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                <span className="whitespace-nowrap font-medium tabular-nums">{licenca.validade ? formatarData(licenca.validade) : '—'}</span>
                                <span className={cn('whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium', situacao.classe)}>{situacao.texto}</span>
                                <Edit className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition group-hover/v:opacity-100" />
                              </button>
                            )}
                          </td>
                        )}

                        {aba === 'mensal' && <td className="whitespace-nowrap">{formatarData(licenca.data_inicio)}</td>}

                        <td>
                          <Badge variant="secondary" className="whitespace-nowrap">
                            Dia {licenca.dia_vencimento || 10}
                          </Badge>
                        </td>
                        <td className="whitespace-nowrap font-medium">{moeda(licenca.valor_custo)}</td>
                        <td className="whitespace-nowrap font-medium text-emerald-600">{moeda(licenca.valor_venda)}</td>
                        <td>{getStatusBadge(licenca)}</td>
                        <td>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {aba === 'data' && (
                                <>
                                  <DropdownMenuItem onClick={() => renovar(licenca, 1)}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Renovar +1 mês
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => renovar(licenca, 12)}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Renovar +1 ano
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                </>
                              )}
                              <DropdownMenuItem onClick={() => handleEdit(licenca)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDelete(licenca.id)} className="text-destructive">
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {!loading && filteredLicencas.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/50 font-semibold">
                    <td className="sticky left-0 z-10 bg-muted">Total ({filteredLicencas.length})</td>
                    <td></td>
                    <td className="whitespace-nowrap">
                      {aba === 'vidas' ? `${filteredLicencas.reduce((acc, l) => acc + (l.quantidade || 0), 0)} vidas` : ''}
                    </td>
                    <td></td>
                    <td className="whitespace-nowrap">{moeda(filteredLicencas.reduce((acc, l) => acc + (l.valor_custo || 0), 0))}</td>
                    <td className="whitespace-nowrap">{moeda(filteredLicencas.reduce((acc, l) => acc + (l.valor_venda || 0), 0))}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Formulário */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLicenca ? 'Editar Licença' : 'Nova Licença'}</DialogTitle>
            <DialogDescription>
              {editingLicenca ? 'Atualize as informações da licença' : 'Crie uma nova licença para um cliente. Um pagamento será gerado automaticamente.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cliente">Cliente *</Label>
              <Select value={formData.cliente_id} onValueChange={(value) => setFormData({ ...formData, cliente_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((cliente) => (
                    <SelectItem key={cliente.id} value={cliente.id}>
                      {cliente.nome_empresa}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo">Sistema *</Label>
              <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o sistema" />
                </SelectTrigger>
                <SelectContent>
                  {/* Mantém o valor atual mesmo que o sistema tenha sido desativado. */}
                  {Array.from(new Set([...sistemas, ...(formData.tipo ? [formData.tipo] : [])])).map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.trim()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.tipo && (
                <p className="text-xs text-muted-foreground">
                  {controleForm === 'vidas'
                    ? 'Pontotel: controle por quantidade de vidas.'
                    : controleForm === 'data'
                      ? 'DigiSat: controle pela data de validade da licença.'
                      : 'Controle por mensalidade.'}
                </p>
              )}
            </div>

            {controleForm === 'vidas' && (
              <div className="space-y-2">
                <Label htmlFor="quantidade">Quantidade de vidas *</Label>
                <Input
                  id="quantidade"
                  type="number"
                  min={1}
                  value={formData.quantidade}
                  onChange={(e) => setFormData({ ...formData, quantidade: parseInt(e.target.value) || 0 })}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="data_inicio">Data Início *</Label>
                <Input
                  id="data_inicio"
                  type="date"
                  value={formData.data_inicio}
                  onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                  required
                />
              </div>
              {controleForm === 'data' ? (
                <div className="space-y-2">
                  <Label htmlFor="validade">Validade da licença *</Label>
                  <Input id="validade" type="date" value={formData.validade} onChange={(e) => setFormData({ ...formData, validade: e.target.value })} />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="dia_vencimento">Dia Vencimento (mês)</Label>
                  <Input
                    id="dia_vencimento"
                    type="number"
                    min={1}
                    max={28}
                    value={formData.dia_vencimento}
                    onChange={(e) => setFormData({ ...formData, dia_vencimento: parseInt(e.target.value) || 10 })}
                  />
                </div>
              )}
            </div>

            {controleForm === 'data' && (
              <div className="space-y-2">
                <Label htmlFor="dia_vencimento">Dia Vencimento da mensalidade</Label>
                <Input
                  id="dia_vencimento"
                  type="number"
                  min={1}
                  max={28}
                  value={formData.dia_vencimento}
                  onChange={(e) => setFormData({ ...formData, dia_vencimento: parseInt(e.target.value) || 10 })}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valor_custo">Valor Custo (R$)</Label>
                <Input
                  id="valor_custo"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.valor_custo}
                  onChange={(e) => setFormData({ ...formData, valor_custo: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="valor_venda">Valor Venda (R$)</Label>
                <Input
                  id="valor_venda"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.valor_venda}
                  onChange={(e) => setFormData({ ...formData, valor_venda: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            {controleForm === 'vidas' && formData.quantidade > 0 && formData.valor_venda > 0 && (
              <p className="-mt-2 text-xs text-muted-foreground">{moeda(formData.valor_venda / formData.quantidade)} por vida</p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="modelo_cobranca">Modelo de Cobrança *</Label>
                <Select value={formData.modelo_cobranca} onValueChange={(value) => setFormData({ ...formData, modelo_cobranca: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre_pago">Pré-pago</SelectItem>
                    <SelectItem value="saas_full">SaaS Full</SelectItem>
                    {formData.modelo_cobranca !== 'pre_pago' && formData.modelo_cobranca !== 'saas_full' && (
                      <SelectItem value={formData.modelo_cobranca}>{formData.modelo_cobranca}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="data_pagamento_sistema">Data de Pagamento do Sistema</Label>
                <Input
                  id="data_pagamento_sistema"
                  type="date"
                  value={formData.data_pagamento_sistema}
                  onChange={(e) => setFormData({ ...formData, data_pagamento_sistema: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as StatusType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">{editingLicenca ? 'Salvar' : 'Criar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
