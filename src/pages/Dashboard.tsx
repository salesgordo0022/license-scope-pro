import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Users,
  KeyRound,
  ShieldAlert,
  CircleDollarSign,
  CreditCard,
  ChevronRight,
  ChevronLeft,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  Monitor,
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  UserRound,
  CircleCheck,
  Receipt,
  Settings,
  Store,
  Search,
  Filter,
  Plus,
  Phone,
  MoreHorizontal,
  Pencil,
  Wallet,
  MessageCircle,
} from '@/components/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ImperTechLogo } from '@/components/brand/ImperTechLogo';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn, dataLocalIso } from '@/lib/utils';

interface ClienteLinha {
  id: string;
  nome_empresa: string;
  segmento: string | null;
  grupo_id: string | null;
  telefone: string | null;
  email: string | null;
  cnpj: string | null;
  data_entrada: string | null;
  valor_mensalidade: number | null;
  valor_implantacao: number | null;
  status: string | null;
  created_at: string | null;
}

/** Linhas com o nome do cliente vindo do join (`clientes(...)` ou `cliente:clientes(...)`). */
interface ComCliente {
  clientes?: { nome_empresa: string } | null;
  cliente?: { nome_empresa: string } | null;
}

interface LicencaLinha extends ComCliente {
  id: string;
  cliente_id: string;
  tipo: string;
  status: string | null;
  validade: string | null;
  created_at: string | null;
}

interface RevendaLinha extends ComCliente {
  id: string;
  sistema: string | null;
  created_at: string | null;
}

interface Grupo {
  id: string;
  nome: string;
  cor: string | null;
}

interface Atividade {
  id: string;
  tipo: 'cliente' | 'licenca' | 'boleto' | 'pagamento' | 'implantacao' | 'revenda';
  titulo: string;
  detalhe: string;
  quando: string;
}

interface Indicador {
  atual: number;
  anterior: number;
}

const CORES_SEGMENTO = ['#2563EB', '#16A34A', '#F59E0B', '#3B5BDB', '#C026D3', '#22B8E6', '#1E3A8A', '#F97316', '#EF4444', '#14B8A6', '#8B5CF6', '#64748B'];

const ESTILO_ATIVIDADE: Record<Atividade['tipo'], { icone: typeof UserRound; classe: string }> = {
  cliente: { icone: UserRound, classe: 'bg-blue-50 text-blue-600' },
  licenca: { icone: CircleCheck, classe: 'bg-emerald-50 text-emerald-600' },
  boleto: { icone: CreditCard, classe: 'bg-indigo-50 text-indigo-600' },
  pagamento: { icone: Receipt, classe: 'bg-emerald-50 text-emerald-600' },
  implantacao: { icone: Settings, classe: 'bg-violet-50 text-violet-600' },
  revenda: { icone: Store, classe: 'bg-green-50 text-green-600' },
};

const ESTILO_STATUS: Record<string, string> = {
  ativo: 'bg-emerald-50 text-emerald-700',
  inativo: 'bg-slate-100 text-slate-600',
  pendente: 'bg-amber-50 text-amber-700',
  vencido: 'bg-red-50 text-red-700',
};

/** Linhas da tabela de clientes em telas estreitas (uma coluna só). */
const POR_PAGINA_PADRAO = 5;
/** Altura aproximada de uma linha da tabela, usada para calcular quantas cabem. */
const ALTURA_LINHA = 64;

const moeda = (v: number | null) =>
  (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const dataCurta = (iso: string | null) => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('pt-BR') : '—');

const dataHora = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return iso.length === 10 ? d.toLocaleDateString('pt-BR') : `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const capitalizar = (s: string) => s.replace(/(^|\s)(\p{L})/gu, (m) => m.toUpperCase()).replace(/ De /g, ' de ');

/** Variação percentual em relação ao mês anterior, como o card exibe. */
function variacao({ atual, anterior }: Indicador) {
  if (anterior === 0) return atual === 0 ? 0 : 100;
  return Math.round(((atual - anterior) / anterior) * 100);
}

/**
 * Painel inicial: indicadores da empresa (clientes, licenças, revendas e
 * boletos com comparação ao mês anterior), distribuição por segmento,
 * sistemas mais vendidos, últimos clientes e atividades recentes.
 *
 * Todas as consultas passam pelo RLS, então os números já vêm restritos ao
 * tenant de quem está logado; não há filtro de empresa no código da tela.
 */
export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<ClienteLinha[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [sistemasPorCliente, setSistemasPorCliente] = useState<Record<string, string[]>>({});
  const [indicadores, setIndicadores] = useState<Record<'clientes' | 'licencas' | 'vencendo' | 'revendas' | 'boletos', Indicador>>({
    clientes: { atual: 0, anterior: 0 },
    licencas: { atual: 0, anterior: 0 },
    vencendo: { atual: 0, anterior: 0 },
    revendas: { atual: 0, anterior: 0 },
    boletos: { atual: 0, anterior: 0 },
  });
  const [sistemaData, setSistemaData] = useState<{ name: string; count: number }[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [financeiro, setFinanceiro] = useState({
    recebidoMes: 0,
    emAtraso: 0,
    qtdAtraso: 0,
    proximos: [] as { id: string; cliente: string; valor: number; vencimento: string }[],
  });
  const [verTodasAtividades, setVerTodasAtividades] = useState(false);

  // Filtros da tabela de clientes
  const [busca, setBusca] = useState('');
  const [filtroSegmento, setFiltroSegmento] = useState('all');
  const [filtroGrupo, setFiltroGrupo] = useState('all');
  const [filtroStatus, setFiltroStatus] = useState('ativo');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(POR_PAGINA_PADRAO);

  // Em tela larga a tabela divide a altura com a coluna da direita. Em vez de
  // esticar o card (o que deixava um bloco vazio), calcula quantas linhas cabem
  // na altura natural da coluna lateral; a sobra (menor que uma linha) é
  // distribuída entre as linhas pela própria tabela.
  const refLateral = useRef<HTMLDivElement>(null);
  const refGraficos = useRef<HTMLDivElement>(null);
  const refSecaoTabela = useRef<HTMLElement>(null);
  const refFiltros = useRef<HTMLDivElement>(null);
  const refRodape = useRef<HTMLDivElement>(null);
  const refTabela = useRef<HTMLTableElement>(null);
  useEffect(() => {
    const recalcular = () => {
      const lateral = refLateral.current;
      if (!lateral || window.innerWidth < 1280) return setPorPagina(POR_PAGINA_PADRAO);
      const gap = 24;
      const filhos = Array.from(lateral.children) as HTMLElement[];
      const alturaLateral = filhos.reduce((s, el) => s + el.offsetHeight, 0) + gap * Math.max(0, filhos.length - 1);
      const graficos = refGraficos.current?.offsetHeight ?? 0;
      const cabecalho = refTabela.current?.tHead?.offsetHeight ?? 44;
      const fixo = (refFiltros.current?.offsetHeight ?? 0) + (refRodape.current?.offsetHeight ?? 0) + cabecalho + 40 /* padding */ + 16 /* margem */ + 2;
      const linhas = Math.floor((alturaLateral - graficos - gap - fixo) / ALTURA_LINHA);
      setPorPagina(Math.min(15, Math.max(POR_PAGINA_PADRAO, linhas)));
    };
    recalcular();
    const obs = new ResizeObserver(recalcular);
    if (refLateral.current) Array.from(refLateral.current.children).forEach((el) => obs.observe(el));
    if (refGraficos.current) obs.observe(refGraficos.current);
    window.addEventListener('resize', recalcular);
    return () => {
      obs.disconnect();
      window.removeEventListener('resize', recalcular);
    };
  }, [loading]);

  useEffect(() => {
    const carregar = async () => {
      try {
        const agora = new Date();
        const fimMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 1);
        const iso = dataLocalIso;
        const em30 = new Date(agora);
        em30.setDate(em30.getDate() + 30);
        const ha30 = new Date(agora);
        ha30.setDate(ha30.getDate() - 30);

        const inicioMes = dataLocalIso(new Date(agora.getFullYear(), agora.getMonth(), 1));
        const [cli, lic, rev, grp, bolAbertos, bolAnteriores, pagRecentes, pagRecebidos, impl, recebidosMes, abertos] = await Promise.all([
          supabase
            .from('clientes')
            .select('id, nome_empresa, segmento, grupo_id, telefone, email, cnpj, data_entrada, valor_mensalidade, valor_implantacao, status, created_at')
            .order('created_at', { ascending: false }),
          supabase.from('licencas').select('id, cliente_id, tipo, status, validade, created_at, clientes(nome_empresa)').order('created_at', { ascending: false }),
          supabase.from('revendas').select('id, sistema, created_at, clientes(nome_empresa)').order('created_at', { ascending: false }),
          supabase.from('grupos_clientes').select('id, nome, cor').order('nome'),
          supabase.from('pagamentos').select('*', { count: 'exact', head: true }).in('status', ['pendente', 'atrasado']),
          supabase
            .from('pagamentos')
            .select('*', { count: 'exact', head: true })
            .in('status', ['pendente', 'atrasado'])
            .lt('created_at', fimMesAnterior.toISOString()),
          supabase.from('pagamentos').select('id, created_at, clientes(nome_empresa)').order('created_at', { ascending: false }).limit(15),
          supabase
            .from('pagamentos')
            .select('id, data_pagamento, valor_final, clientes(nome_empresa)')
            .eq('status', 'pago')
            .not('data_pagamento', 'is', null)
            .order('data_pagamento', { ascending: false })
            .limit(15),
          supabase
            .from('implantacoes')
            .select('id, titulo, updated_at, cliente:clientes(nome_empresa)')
            .eq('status', 'concluido')
            .order('updated_at', { ascending: false })
            .limit(15),
          supabase.from('pagamentos').select('valor_final').eq('status', 'pago').gte('data_pagamento', inicioMes),
          supabase
            .from('pagamentos')
            .select('id, valor_final, data_vencimento, clientes(nome_empresa)')
            .in('status', ['pendente', 'atrasado'])
            .order('data_vencimento')
            .limit(500),
        ]);

        // Financeiro do mês: recebido, em atraso e os próximos vencimentos.
        const hojeIso = dataLocalIso(agora);
        const listaAbertos = (abertos.data || []) as unknown as (ComCliente & { id: string; valor_final: number; data_vencimento: string })[];
        const vencidos = listaAbertos.filter((p) => p.data_vencimento < hojeIso);
        setFinanceiro({
          recebidoMes: ((recebidosMes.data || []) as { valor_final: number }[]).reduce((s, p) => s + (Number(p.valor_final) || 0), 0),
          emAtraso: vencidos.reduce((s, p) => s + (Number(p.valor_final) || 0), 0),
          qtdAtraso: vencidos.length,
          proximos: listaAbertos
            .filter((p) => p.data_vencimento >= hojeIso)
            .slice(0, 4)
            .map((p) => ({ id: p.id, cliente: p.clientes?.nome_empresa || '—', valor: Number(p.valor_final) || 0, vencimento: p.data_vencimento })),
        });

        const listaClientes = (cli.data || []) as ClienteLinha[];
        const licencas = (lic.data || []) as unknown as LicencaLinha[];
        const revendas = (rev.data || []) as unknown as RevendaLinha[];
        const antesDoMes = (d: string | null) => !!d && new Date(d) < fimMesAnterior;

        setClientes(listaClientes);
        setGrupos((grp.data || []) as Grupo[]);

        const mapa: Record<string, string[]> = {};
        licencas
          .filter((l) => l.status === 'ativo' && l.tipo)
          .forEach((l) => {
            mapa[l.cliente_id] = mapa[l.cliente_id] || [];
            if (!mapa[l.cliente_id].includes(l.tipo)) mapa[l.cliente_id].push(l.tipo);
          });
        setSistemasPorCliente(mapa);

        const ativas = licencas.filter((l) => l.status === 'ativo');
        setIndicadores({
          clientes: { atual: listaClientes.length, anterior: listaClientes.filter((c) => antesDoMes(c.created_at)).length },
          licencas: { atual: ativas.length, anterior: ativas.filter((l) => antesDoMes(l.created_at)).length },
          // "Vencendo" compara a janela dos próximos 30 dias com a dos 30 dias anteriores.
          vencendo: {
            atual: ativas.filter((l) => l.validade && l.validade <= iso(em30)).length,
            anterior: ativas.filter((l) => l.validade && l.validade > iso(ha30) && l.validade <= iso(agora)).length,
          },
          revendas: { atual: revendas.length, anterior: revendas.filter((r) => antesDoMes(r.created_at)).length },
          boletos: { atual: bolAbertos.count || 0, anterior: bolAnteriores.count || 0 },
        });

        const contagemSistemas = revendas.reduce((acc: Record<string, number>, r) => {
          const nome = r.sistema || 'Não definido';
          acc[nome] = (acc[nome] || 0) + 1;
          return acc;
        }, {});
        setSistemaData(
          Object.entries(contagemSistemas)
            .map(([name, count]) => ({ name, count: count as number }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6)
        );

        const nomeCliente = (x: ComCliente) => x.clientes?.nome_empresa || x.cliente?.nome_empresa || '';
        const todas: Atividade[] = [
          ...listaClientes
            .filter((c) => c.created_at)
            .slice(0, 15)
            .map((c) => ({ id: `c-${c.id}`, tipo: 'cliente' as const, titulo: 'Novo cliente cadastrado', detalhe: c.nome_empresa, quando: c.created_at! })),
          ...licencas
            .filter((l) => l.created_at)
            .slice(0, 15)
            .map((l) => ({ id: `l-${l.id}`, tipo: 'licenca' as const, titulo: `Licença ${l.tipo} ativada`, detalhe: nomeCliente(l), quando: l.created_at! })),
          ...((pagRecentes.data || []) as unknown as (ComCliente & { id: string; created_at: string | null })[])
            .filter((p) => p.created_at)
            .map((p) => ({ id: `b-${p.id}`, tipo: 'boleto' as const, titulo: 'Boleto gerado', detalhe: nomeCliente(p), quando: p.created_at! })),
          ...((pagRecebidos.data || []) as unknown as (ComCliente & { id: string; data_pagamento: string; valor_final: number })[]).map((p) => ({
            id: `p-${p.id}`,
            tipo: 'pagamento' as const,
            titulo: `Pagamento recebido · ${moeda(p.valor_final)}`,
            detalhe: nomeCliente(p),
            quando: p.data_pagamento,
          })),
          ...((impl.data || []) as unknown as (ComCliente & { id: string; titulo: string; updated_at: string })[]).map((i) => ({
            id: `i-${i.id}`,
            tipo: 'implantacao' as const,
            titulo: 'Implantação concluída',
            detalhe: nomeCliente(i) || i.titulo,
            quando: i.updated_at,
          })),
          ...revendas
            .filter((r) => r.created_at)
            .slice(0, 15)
            .map((r) => ({ id: `r-${r.id}`, tipo: 'revenda' as const, titulo: 'Nova revenda cadastrada', detalhe: nomeCliente(r), quando: r.created_at! })),
        ];
        // Datas sem hora (AAAA-MM-DD) entram como meio-dia para não "pularem" à frente das que têm hora.
        const chave = (q: string) => new Date(q.length === 10 ? `${q}T12:00:00` : q).getTime();
        setAtividades(todas.sort((a, b) => chave(b.quando) - chave(a.quando)).slice(0, 30));
      } catch (error) {
        console.error('Erro ao carregar o dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    carregar();
  }, []);

  const segmentData = useMemo(() => {
    const contagem = clientes.reduce((acc: Record<string, number>, c) => {
      const seg = c.segmento || 'Não definido';
      acc[seg] = (acc[seg] || 0) + 1;
      return acc;
    }, {});
    return Object.entries(contagem)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [clientes]);

  const segmentosDisponiveis = useMemo(
    () => Array.from(new Set(clientes.map((c) => c.segmento).filter(Boolean) as string[])).sort(),
    [clientes]
  );

  const grupoPorId = useMemo(() => Object.fromEntries(grupos.map((g) => [g.id, g])), [grupos]);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return clientes.filter((c) => {
      const casaBusca =
        !termo ||
        c.nome_empresa.toLowerCase().includes(termo) ||
        c.email?.toLowerCase().includes(termo) ||
        c.cnpj?.replace(/\D/g, '').includes(termo.replace(/\D/g, '') || '\u0000');
      const casaSegmento = filtroSegmento === 'all' || (filtroSegmento === 'none' ? !c.segmento : c.segmento === filtroSegmento);
      const casaGrupo = filtroGrupo === 'all' || (filtroGrupo === 'none' ? !c.grupo_id : c.grupo_id === filtroGrupo);
      const casaStatus = filtroStatus === 'all' || c.status === filtroStatus;
      return casaBusca && casaSegmento && casaGrupo && casaStatus;
    });
  }, [clientes, busca, filtroSegmento, filtroGrupo, filtroStatus]);

  useEffect(() => setPagina(1), [busca, filtroSegmento, filtroGrupo, filtroStatus]);

  const totalPaginas = Math.max(1, Math.ceil(clientesFiltrados.length / porPagina));
  const clientesPagina = clientesFiltrados.slice((pagina - 1) * porPagina, pagina * porPagina);
  // Se a quantidade por página mudar, não deixa a página atual "passar do fim".
  useEffect(() => setPagina((p) => Math.min(p, totalPaginas)), [totalPaginas]);

  const cards = [
    { titulo: 'Total de Clientes', ind: indicadores.clientes, icone: Users, cor: 'bg-blue-50 text-blue-600', rota: '/clientes', subirEhBom: true },
    { titulo: 'Licenças Ativas', ind: indicadores.licencas, icone: KeyRound, cor: 'bg-emerald-50 text-emerald-600', rota: '/licencas', subirEhBom: true },
    { titulo: 'Licenças Vencendo', ind: indicadores.vencendo, icone: ShieldAlert, cor: 'bg-amber-50 text-amber-500', rota: '/licencas', subirEhBom: false },
    { titulo: 'Total de Revendas', ind: indicadores.revendas, icone: CircleDollarSign, cor: 'bg-violet-50 text-violet-600', rota: '/revendas', subirEhBom: true },
    { titulo: 'Boletos em Aberto', ind: indicadores.boletos, icone: CreditCard, cor: 'bg-red-50 text-red-500', rota: '/pagamentos', subirEhBom: false },
  ];

  const hoje = capitalizar(format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }));
  const totalSegmentos = segmentData.reduce((s, x) => s + x.value, 0);

  const abrirWhatsapp = (telefone: string) => {
    let digitos = telefone.replace(/\D/g, '');
    if (digitos.length <= 11) digitos = `55${digitos}`;
    window.open(`https://wa.me/${digitos}`, '_blank', 'noopener');
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      {/* Boas-vindas */}
      <motion.section
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl"
      >
        <div className="pointer-events-none absolute -right-10 -top-24 h-64 w-[520px] rotate-[-18deg] bg-gradient-to-l from-primary/10 to-transparent" />
        <div className="relative flex flex-col gap-6 py-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xl font-semibold text-foreground">Bem-vindo de volta,</p>
            <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-[34px]">{profile?.nome || 'Usuário'}!</h1>
            <p className="mt-2 max-w-md text-[15px] text-muted-foreground">
              Aqui está o resumo do seu CRM. Acompanhe os principais indicadores e mantenha tudo sob controle.
            </p>
          </div>
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3">
              <CalendarDays className="h-6 w-6 text-foreground" />
              <div>
                <p className="text-sm font-semibold">Hoje</p>
                <p className="text-sm text-muted-foreground">{hoje}</p>
              </div>
            </div>
            <div className="hidden h-20 w-px bg-border xl:block" />
            <ImperTechLogo className="hidden xl:flex" tamanho="h-16 w-16" textoClassName="text-[40px]" />
          </div>
        </div>
      </motion.section>

      {/* Indicadores */}
      {/* 5 indicadores sem sobrar buraco: 2 colunas no tablet, 3+2 no notebook, 5 na tela larga. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 xl:grid-cols-5">
        {cards.map((card, i) => {
          const pct = variacao(card.ind);
          const subiu = pct > 0;
          const bom = pct === 0 ? null : subiu === card.subirEhBom;
          return (
            <motion.button
              key={card.titulo}
              type="button"
              onClick={() => navigate(card.rota)}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              className={cn(
                'group flex items-center rounded-2xl border border-border/70 bg-card p-5 text-left shadow-[0_2px_12px_-4px_rgba(15,27,61,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-10px_rgba(15,27,61,0.25)]',
                i < 3 ? 'lg:col-span-2 xl:col-span-1' : 'lg:col-span-3 xl:col-span-1',
                i === 4 && 'sm:col-span-2 lg:col-span-3'
              )}
            >
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', card.cor)}>
                    <card.icone className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-medium text-foreground/80">{card.titulo}</span>
                </div>
                <p className="mt-3 pl-1 text-[32px] font-bold leading-none text-foreground">{loading ? '—' : card.ind.atual}</p>
                <div className="mt-3 pl-1">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 text-sm font-semibold',
                      bom === null ? 'text-muted-foreground' : bom ? 'text-emerald-600' : 'text-red-500'
                    )}
                  >
                    {pct === 0 ? <ChevronDown className="h-4 w-4" /> : subiu ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                    {pct > 0 ? '+' : ''}
                    {pct}%
                  </span>
                  <p className="text-[11px] text-muted-foreground">vs. mês anterior</p>
                </div>
              </div>
              <ChevronRight
                className={cn('h-5 w-5 transition group-hover:translate-x-0.5', card.rota === '/pagamentos' ? 'text-red-500' : 'text-blue-600')}
              />
            </motion.button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Coluna principal */}
        <div className="flex min-w-0 flex-col gap-6">
          <div ref={refGraficos} className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            {/* Clientes por segmento */}
            <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[0_2px_12px_-4px_rgba(15,27,61,0.08)]">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Users className="h-5 w-5" /> Clientes por Segmento
              </h2>
              {segmentData.length > 0 ? (
                <div className="mt-4 flex flex-col items-center gap-6 sm:flex-row">
                  <div className="relative h-[190px] w-[190px] shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={segmentData} dataKey="value" innerRadius={58} outerRadius={92} paddingAngle={2} stroke="none" startAngle={90} endAngle={-270}>
                          {segmentData.map((_, i) => (
                            <Cell key={i} fill={CORES_SEGMENTO[i % CORES_SEGMENTO.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number, n: string) => [`${v} clientes`, n]} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-foreground">{totalSegmentos}</span>
                      <span className="text-sm text-muted-foreground">clientes</span>
                    </div>
                  </div>
                  <ul className="max-h-[220px] w-full space-y-1 overflow-y-auto pr-1">
                    {segmentData.map((s, i) => (
                      <li key={s.name}>
                        <button
                          type="button"
                          onClick={() => {
                            setFiltroSegmento(s.name === 'Não definido' ? 'none' : s.name);
                            setFiltroStatus('all');
                            document.getElementById('tabela-clientes')?.scrollIntoView({ behavior: 'smooth' });
                          }}
                          className="grid w-full grid-cols-[1fr_auto_56px] items-center gap-3 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-muted"
                          title="Filtrar a tabela por este segmento"
                        >
                          <span className="flex items-center gap-2.5 truncate">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CORES_SEGMENTO[i % CORES_SEGMENTO.length] }} />
                            <span className="truncate">{s.name}</span>
                          </span>
                          <span className="font-semibold">{s.value}</span>
                          <span className="text-right text-muted-foreground">{((s.value / totalSegmentos) * 100).toFixed(1).replace('.', ',')}%</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">{loading ? 'Carregando...' : 'Nenhum dado disponível'}</div>
              )}
            </section>

            {/* Sistemas mais vendidos */}
            <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-[0_2px_12px_-4px_rgba(15,27,61,0.08)]">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Monitor className="h-5 w-5" /> Sistemas Mais Vendidos
              </h2>
              {sistemaData.length > 0 ? (
                <div className="mt-4 h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sistemaData} layout="vertical" margin={{ left: 0, right: 28, top: 4, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                      <YAxis dataKey="name" type="category" width={96} tick={{ fontSize: 12, fill: '#334155' }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} formatter={(v: number) => [`${v} vendas`, 'Total']} />
                      <Bar dataKey="count" fill="#2563EB" radius={[0, 4, 4, 0]} maxBarSize={56}>
                        <LabelList dataKey="count" position="right" style={{ fontSize: 12, fontWeight: 600, fill: '#2563EB' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">{loading ? 'Carregando...' : 'Nenhum dado disponível'}</div>
              )}
            </section>
          </div>

          {/* Tabela de clientes */}
          <section ref={refSecaoTabela} id="tabela-clientes" className="flex flex-1 flex-col rounded-2xl border border-border/70 bg-card p-5 shadow-[0_2px_12px_-4px_rgba(15,27,61,0.08)]">
            <div ref={refFiltros} className="flex flex-wrap items-center gap-3">
              <h2 className="mr-2 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Users className="h-5 w-5" /> Clientes
              </h2>
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome, e-mail ou CNPJ..."
                  className="h-10 w-full rounded-lg border border-input bg-muted/50 pl-9 pr-3 text-sm outline-none focus:border-primary/50 focus:bg-background"
                />
              </div>
              <Select value={filtroSegmento} onValueChange={setFiltroSegmento}>
                <SelectTrigger className="h-10 w-[170px] text-sm">
                  <Filter className="mr-1 h-3.5 w-3.5 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos segmentos</SelectItem>
                  <SelectItem value="none">Não definido</SelectItem>
                  {segmentosDisponiveis.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
                <SelectTrigger className="h-10 w-[150px] text-sm">
                  <Filter className="mr-1 h-3.5 w-3.5 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos grupos</SelectItem>
                  <SelectItem value="none">Sem grupo</SelectItem>
                  {grupos.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="h-10 w-[120px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() => navigate('/clientes?novo=1')}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-sm transition hover:bg-primary/90"
              >
                <Plus className="h-4 w-4" /> Novo Cliente
              </button>
            </div>

            <div className="mt-4 flex-1 overflow-x-auto rounded-xl border border-border/60">
              <table ref={refTabela} className={cn('w-full min-w-[920px] text-[13px]', clientesPagina.length === porPagina && 'h-full')}>
                <thead>
                  <tr className="border-b border-border/60 text-left text-xs font-medium text-muted-foreground">
                    <th className="sticky left-0 z-20 bg-card px-4 py-3 font-medium shadow-[6px_0_8px_-6px_rgba(15,27,61,0.18)]">Empresa</th>
                    <th className="px-3 py-3 font-medium">Grupo</th>
                    <th className="px-3 py-3 font-medium">Segmento</th>
                    <th className="px-3 py-3 font-medium">Contato</th>
                    <th className="px-3 py-3 font-medium">Data Entrada</th>
                    <th className="px-3 py-3 font-medium">Mensalidade</th>
                    <th className="px-3 py-3 font-medium">Implantação</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="w-10 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {clientesPagina.map((c) => {
                    const grupo = c.grupo_id ? grupoPorId[c.grupo_id] : null;
                    const sistemas = sistemasPorCliente[c.id] || [];
                    return (
                      <tr key={c.id} className="group border-b border-border/50 last:border-0 hover:bg-muted/40">
                        <td className="sticky left-0 z-10 bg-card px-4 py-2.5 shadow-[6px_0_8px_-6px_rgba(15,27,61,0.18)] group-hover:bg-muted">
                          <div className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                              <UserRound className="h-4 w-4" />
                            </span>
                            <div className="min-w-0">
                              <p className="max-w-[240px] truncate font-medium text-foreground" title={c.nome_empresa}>
                                {c.nome_empresa}
                              </p>
                              {sistemas.length > 0 && (
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {sistemas.slice(0, 2).map((s) => (
                                    <span key={s} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                                      {s}
                                    </span>
                                  ))}
                                  {sistemas.length > 2 && <span className="text-[10px] text-muted-foreground">+{sistemas.length - 2}</span>}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {grupo ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: grupo.cor || '#64748B' }} />
                              {grupo.nome}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Sem grupo</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {c.segmento ? (
                            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                              {c.segmento}
                            </span>
                          ) : (
                            <span className="italic text-muted-foreground">Não definido</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {c.telefone ? (
                            <button
                              type="button"
                              onClick={() => abrirWhatsapp(c.telefone!)}
                              className="inline-flex items-center gap-1.5 whitespace-nowrap hover:text-emerald-700"
                              title="Abrir conversa no WhatsApp"
                            >
                              <Phone className="h-3.5 w-3.5 text-emerald-600" />
                              {c.telefone}
                            </button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">{dataCurta(c.data_entrada)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-emerald-600">{moeda(c.valor_mensalidade)}</td>
                        <td className="whitespace-nowrap px-3 py-2.5">{moeda(c.valor_implantacao)}</td>
                        <td className="px-3 py-2.5">
                          <span className={cn('rounded-md px-2 py-1 text-[11px] font-medium capitalize', ESTILO_STATUS[c.status || ''] || ESTILO_STATUS.inativo)}>
                            {c.status || '—'}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Ações">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/clientes?editar=${c.id}`)}>
                                <Pencil className="mr-2 h-4 w-4" /> Editar cliente
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate('/licencas')}>
                                <KeyRound className="mr-2 h-4 w-4" /> Licenças
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => navigate('/pagamentos')}>
                                <Wallet className="mr-2 h-4 w-4" /> Pagamentos
                              </DropdownMenuItem>
                              {c.telefone && (
                                <DropdownMenuItem onClick={() => abrirWhatsapp(c.telefone!)}>
                                  <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                  {clientesPagina.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                        {loading ? 'Carregando clientes...' : 'Nenhum cliente encontrado com esses filtros.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div ref={refRodape} className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm text-muted-foreground">
              <span>
                {clientesFiltrados.length} cliente{clientesFiltrados.length === 1 ? '' : 's'}
                {clientesFiltrados.length > 0 && ` · página ${pagina} de ${totalPaginas}`}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => p - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40"
                  title="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina((p) => p + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted disabled:opacity-40"
                  title="Próxima página"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => navigate('/clientes')} className="ml-2 font-medium text-primary hover:underline">
                  Ver todos
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Coluna lateral */}
        <div ref={refLateral} className="flex flex-col gap-6 self-start">
          <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E5BEA] via-[#1A4FD6] to-[#0E2E8F] p-5 text-white shadow-[0_12px_30px_-12px_rgba(30,91,234,0.6)]">
            <div className="pointer-events-none absolute -right-12 -top-10 h-40 w-40 rotate-45 rounded-3xl bg-white/10" />
            <div className="pointer-events-none absolute -bottom-16 right-6 h-44 w-44 rotate-45 rounded-3xl bg-[#0B1A3D]/30" />
            <div className="relative flex items-center gap-3">
              <ChartNoAxesCombined className="h-7 w-7 shrink-0" />
              <h3 className="text-lg font-bold leading-tight">Seu negócio mais forte com a ImperTech</h3>
            </div>
            <p className="relative mt-2 text-sm text-white/85">Soluções completas em ERP, Ponto, Rural e MEI.</p>
            <button
              type="button"
              onClick={() => navigate('/planos')}
              className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#1A4FD6] transition hover:bg-blue-50"
            >
              Ver planos <ChevronRight className="h-4 w-4" />
            </button>
          </section>

          {/* Financeiro do mês */}
          <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_2px_12px_-4px_rgba(15,27,61,0.08)]">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Wallet className="h-5 w-5" /> Financeiro do mês
              </h2>
              <button type="button" onClick={() => navigate('/pagamentos')} className="text-xs font-medium text-primary hover:underline">
                Pagamentos
              </button>
            </div>
            {(() => {
              const mrr = clientes.filter((c) => c.status === 'ativo').reduce((s, c) => s + (Number(c.valor_mensalidade) || 0), 0);
              const pct = mrr > 0 ? Math.min(100, Math.round((financeiro.recebidoMes / mrr) * 100)) : 0;
              return (
                <div className="mt-4 space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Receita recorrente (mensalidades ativas)</p>
                    <p className="text-2xl font-bold text-foreground">{loading ? '—' : moeda(mrr)}</p>
                  </div>
                  <div>
                    <div className="mb-1 flex items-baseline justify-between text-xs">
                      <span className="text-muted-foreground">Recebido em {format(new Date(), 'MMMM', { locale: ptBR })}</span>
                      <span className="font-semibold text-emerald-600">{moeda(financeiro.recebidoMes)}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/pagamentos')}
                    className="flex w-full items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-left"
                  >
                    <span className="text-xs text-red-600">
                      Em atraso · {financeiro.qtdAtraso} boleto{financeiro.qtdAtraso === 1 ? '' : 's'}
                    </span>
                    <span className="text-sm font-bold text-red-600">{moeda(financeiro.emAtraso)}</span>
                  </button>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">Próximos vencimentos</p>
                    {financeiro.proximos.length === 0 ? (
                      <p className="text-xs text-muted-foreground">{loading ? 'Carregando...' : 'Nenhum boleto a vencer.'}</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {financeiro.proximos.map((p) => (
                          <li key={p.id} className="flex items-center gap-2 text-xs">
                            <span className="w-11 shrink-0 font-semibold tabular-nums text-foreground">{dataCurta(p.vencimento).slice(0, 5)}</span>
                            <span className="min-w-0 flex-1 truncate uppercase text-muted-foreground" title={p.cliente}>
                              {p.cliente}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-foreground">{moeda(p.valor)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })()}
          </section>

          <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-[0_2px_12px_-4px_rgba(15,27,61,0.08)]">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Clock3 className="h-5 w-5" /> Atividades Recentes
              </h2>
              {atividades.length > 6 && (
                <button type="button" onClick={() => setVerTodasAtividades(true)} className="text-xs font-medium text-primary hover:underline">
                  Ver todas
                </button>
              )}
            </div>
            <ListaAtividades itens={atividades.slice(0, 6)} loading={loading} />
          </section>
        </div>
      </div>

      <Dialog open={verTodasAtividades} onOpenChange={setVerTodasAtividades}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Atividades recentes</DialogTitle>
          </DialogHeader>
          <ListaAtividades itens={atividades} loading={false} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ListaAtividades({ itens, loading }: { itens: Atividade[]; loading: boolean }) {
  if (itens.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{loading ? 'Carregando...' : 'Nenhuma atividade registrada.'}</p>;
  }
  return (
    <ul className="mt-3 divide-y divide-border/60">
      {itens.map((a) => {
        const estilo = ESTILO_ATIVIDADE[a.tipo];
        return (
          <li key={a.id} className="flex items-start gap-3 py-3">
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', estilo.classe)}>
              <estilo.icone className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug text-foreground">{a.titulo}</p>
              <p className="truncate text-[11px] uppercase text-muted-foreground" title={a.detalhe}>
                {a.detalhe}
              </p>
            </div>
            <span className="shrink-0 text-[10px] text-muted-foreground">{dataHora(a.quando)}</span>
          </li>
        );
      })}
    </ul>
  );
}
