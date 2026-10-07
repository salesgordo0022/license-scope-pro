import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Inbox, Search, Send, Settings2, Loader2, MessageCircle, Paperclip, ChevronLeft, Copy, Check, BarChart3, RefreshCw } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MeuSlack, type ConexaoSlack } from '@/components/chamados/MeuSlack';
import { RelatorioMensal } from '@/components/chamados/RelatorioMensal';
import { erroDaFunction } from '@/lib/erroFunction';

interface Chamado {
  id: string;
  origem: 'slack' | 'zapcontabil';
  conversa_id: string;
  canal_nome: string | null;
  contato_nome: string | null;
  contato_id: string | null;
  assunto: string | null;
  status: string;
  prioridade: string;
  responsavel_id: string | null;
  cliente_id: string | null;
  dono_id: string | null;
  ultima_mensagem_em: string;
  nao_lidas: number;
  ia_ativa?: boolean;
  ia_instrucoes?: string | null;
  ia_status?: 'atendendo' | 'finalizado' | 'devolvido' | null;
  ia_motivo?: string | null;
  ia_respostas?: number;
}

interface Mensagem {
  id: string;
  direcao: 'entrada' | 'saida';
  autor_nome: string | null;
  texto: string;
  anexos: { nome?: string; url?: string }[] | null;
  created_at: string;
  por_ia?: boolean;
}

interface Config {
  empresa_id: string;
  slack_team_id: string | null;
  slack_user_id: string | null;
  slack_canais: string[];
  zap_webhook_token: string;
  zap_filtro: string | null;
  reabrir_horas: number;
  zap_sync_ate: string | null;
  zap_sync_erro: string | null;
}

const STATUS = [
  { valor: 'aberto', rotulo: 'Aberto', cor: 'bg-blue-50 text-blue-700' },
  { valor: 'em_atendimento', rotulo: 'Em atendimento', cor: 'bg-amber-50 text-amber-700' },
  { valor: 'aguardando', rotulo: 'Aguardando cliente', cor: 'bg-violet-50 text-violet-600' },
  { valor: 'resolvido', rotulo: 'Resolvido', cor: 'bg-emerald-50 text-emerald-700' },
];
const PRIORIDADES = [
  { valor: 'baixa', rotulo: 'Baixa' },
  { valor: 'media', rotulo: 'Média' },
  { valor: 'alta', rotulo: 'Alta' },
  { valor: 'urgente', rotulo: 'Urgente' },
];
const ABAS = [
  { valor: 'ativos', rotulo: 'Em aberto' },
  { valor: 'em_atendimento', rotulo: 'Em atendimento' },
  { valor: 'aguardando', rotulo: 'Aguardando' },
  { valor: 'resolvido', rotulo: 'Resolvidos' },
  { valor: 'todos', rotulo: 'Todos' },
];

const ORIGEM = {
  slack: { rotulo: 'Slack', classe: 'bg-[#4A154B] text-white' },
  zapcontabil: { rotulo: 'WhatsApp', classe: 'bg-[#25D366] text-white' },
} as const;

function horaCurta(iso: string) {
  const d = parseISO(iso);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return 'ontem';
  return format(d, 'dd/MM');
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/**
 * Chamados: caixa de entrada única com as mensagens do Slack e de um canal do
 * ZapContábil (WhatsApp). Cada usuário conecta o próprio Slack ("Meu Slack")
 * e recebe as DMs, menções e canais escolhidos DELE; o WhatsApp é a fila
 * comum da empresa. Dá para mudar status, prioridade, responsável, vincular
 * ao cliente e responder — a resposta volta para a origem. Atualiza em tempo
 * real. "Relatório" mostra a quantidade de chamados por mês.
 */
export default function Chamados() {
  const { isAdmin, profile } = useAuth();
  const meuId = profile?.id ?? null;
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tabelaOk, setTabelaOk] = useState(true);
  const [aba, setAba] = useState('ativos');
  const [origem, setOrigem] = useState<'todas' | 'slack' | 'zapcontabil'>('todas');
  // 'meus' = sou dono ou responsável; 'todos' = tudo o que enxergo; outro valor = id de um usuário (admin).
  const [de, setDe] = useState<string>('todos');
  const [busca, setBusca] = useState('');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [resposta, setResposta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string | null; email: string | null }[]>([]);
  const [clientes, setClientes] = useState<{ id: string; nome_empresa: string }[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [configAberta, setConfigAberta] = useState(false);
  const [conexoes, setConexoes] = useState<ConexaoSlack[]>([]);
  const [meuSlackAberto, setMeuSlackAberto] = useState(false);
  const [relatorioAberto, setRelatorioAberto] = useState(false);
  const minhaConexao = conexoes.find((c) => c.perfil_id === meuId) || null;
  const fimConversa = useRef<HTMLDivElement>(null);
  // Conversa aberta, lida dentro do callback de tempo real (que não é recriado).
  const abertoRef = useRef<string | null>(null);
  useEffect(() => {
    abertoRef.current = selecionadoId;
  }, [selecionadoId]);

  const carregarChamados = useCallback(async () => {
    const { data, error } = await supabase.from('chamados').select('*').order('ultima_mensagem_em', { ascending: false }).limit(500);
    if (error) {
      setTabelaOk(false);
    } else {
      setTabelaOk(true);
      setChamados((data || []) as Chamado[]);
    }
    setCarregando(false);
  }, []);

  const carregarMensagens = useCallback(async (id: string) => {
    const { data } = await supabase.from('chamado_mensagens').select('id, direcao, autor_nome, texto, anexos, created_at, por_ia').eq('chamado_id', id).order('created_at');
    setMensagens((data || []) as Mensagem[]);
  }, []);

  // Conexões do Slack: a minha (todos) e as da equipe (admin).
  const carregarConexoes = useCallback(async () => {
    const { data } = await supabase
      .from('slack_conexoes')
      .select('id, perfil_id, slack_team_id, slack_team_nome, slack_user_id, slack_nome, canais');
    setConexoes((data || []) as ConexaoSlack[]);
  }, []);

  // Clique num aviso: /chamados?abrir=<id> abre a conversa.
  const { search } = useLocation();
  useEffect(() => {
    const id = new URLSearchParams(search).get('abrir');
    if (id) setSelecionadoId(id);
  }, [search]);

  // Volta do "Conectar meu Slack" (?slack=ok|erro|cancelado).
  useEffect(() => {
    const url = new URL(window.location.href);
    const r = url.searchParams.get('slack');
    if (!r) return;
    if (r === 'ok') toast.success('Slack conectado', { description: 'Escolha em Meu Slack os canais que devem virar chamado.' });
    else if (r === 'erro') toast.error('Não foi possível conectar o Slack. Tente de novo.');
    url.searchParams.delete('slack');
    window.history.replaceState(null, '', url.toString());
  }, []);

  useEffect(() => {
    carregarChamados();
    carregarConexoes();
    supabase.from('usuario_perfil').select('id, nome, email').order('nome').then(({ data }) => setUsuarios(data || []));
    supabase.from('clientes').select('id, nome_empresa').order('nome_empresa').then(({ data }) => setClientes(data || []));
    supabase.from('chamados_config').select('*').maybeSingle().then(({ data }) => setConfig((data as Config) || null));
  }, [carregarChamados, carregarConexoes]);

  // Tempo real: lista e conversa aberta atualizam sozinhas.
  useEffect(() => {
    const canal = supabase
      .channel('chamados-tela')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chamados' }, () => carregarChamados())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chamado_mensagens' }, (p) => {
        const nova = p.new as Mensagem & { chamado_id: string };
        if (abertoRef.current === nova.chamado_id) setMensagens((m) => (m.some((x) => x.id === nova.id) ? m : [...m, nova]));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [carregarChamados]);

  const selecionado = chamados.find((c) => c.id === selecionadoId) || null;

  useEffect(() => {
    if (!selecionadoId) return;
    carregarMensagens(selecionadoId);
  }, [selecionadoId, carregarMensagens]);

  // Ao abrir (ou chegar mensagem com a conversa aberta), zera as não lidas.
  useEffect(() => {
    if (selecionado && selecionado.nao_lidas > 0) {
      supabase.from('chamados').update({ nao_lidas: 0 }).eq('id', selecionado.id).then(() => undefined);
    }
  }, [selecionado]);

  useEffect(() => {
    fimConversa.current?.scrollIntoView({ block: 'end' });
  }, [mensagens]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return chamados.filter((c) => {
      const casaAba =
        aba === 'todos' ? true : aba === 'ativos' ? c.status !== 'resolvido' : c.status === aba;
      const casaOrigem = origem === 'todas' || c.origem === origem;
      const casaDe =
        de === 'todos' ? true : de === 'meus' ? c.dono_id === meuId || c.responsavel_id === meuId : c.dono_id === de || c.responsavel_id === de;
      const casaBusca =
        !termo ||
        [c.contato_nome, c.canal_nome, c.assunto, c.contato_id].some((v) => (v || '').toLowerCase().includes(termo));
      return casaAba && casaOrigem && casaDe && casaBusca;
    });
  }, [chamados, aba, origem, de, busca, meuId]);

  const contagem = (valor: string) =>
    chamados.filter(
      (c) =>
        (valor === 'todos' ? true : valor === 'ativos' ? c.status !== 'resolvido' : c.status === valor) &&
        (de === 'todos' || (de === 'meus' ? c.dono_id === meuId || c.responsavel_id === meuId : c.dono_id === de || c.responsavel_id === de))
    ).length;

  const nomeUsuario = (id: string | null) => {
    const u = usuarios.find((x) => x.id === id);
    return u?.nome || u?.email || null;
  };

  const atualizar = async (campos: Partial<Chamado>) => {
    if (!selecionado) return;
    setChamados((lista) => lista.map((c) => (c.id === selecionado.id ? { ...c, ...campos } : c)));
    const { error } = await supabase.from('chamados').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', selecionado.id);
    if (error) {
      toast.error('Não foi possível atualizar o chamado', { description: error.message });
      carregarChamados();
    }
  };

  // Busca agora as mensagens novas do WhatsApp (o agendamento faz isso a cada minuto).
  const [sincronizando, setSincronizando] = useState(false);
  const sincronizarZap = async () => {
    setSincronizando(true);
    const { data, error } = await supabase.functions.invoke('zapcontabil-sincronizar', { body: {} });
    setSincronizando(false);
    if (error || data?.error) {
      toast.error('WhatsApp não sincronizado', { description: await erroDaFunction(error, data) });
      return;
    }
    toast.success(data?.gravadas ? `${data.gravadas} mensagem(ns) nova(s) do WhatsApp` : 'WhatsApp em dia');
    carregarChamados();
  };

  // ---- IA no atendimento (Groq): assumir / parar
  const [iaAberta, setIaAberta] = useState(false);
  const [iaInstrucoes, setIaInstrucoes] = useState('');
  const [iaOcupada, setIaOcupada] = useState(false);

  const iaAssumir = async () => {
    if (!selecionado) return;
    setIaOcupada(true);
    const { data, error } = await supabase.functions.invoke('ia-atendimento', {
      body: { acao: 'assumir', chamado_id: selecionado.id, instrucoes: iaInstrucoes },
    });
    setIaOcupada(false);
    if (error || data?.error) {
      toast.error('A IA não conseguiu assumir', { description: await erroDaFunction(error, data) });
      return;
    }
    setIaAberta(false);
    setIaInstrucoes('');
    toast.success('A IA assumiu o chamado', { description: 'Ela já mandou a primeira mensagem e responde sozinha até o cliente entender.' });
    carregarMensagens(selecionado.id);
    carregarChamados();
  };

  const iaParar = async () => {
    if (!selecionado) return;
    const { data, error } = await supabase.functions.invoke('ia-atendimento', { body: { acao: 'parar', chamado_id: selecionado.id } });
    if (error || data?.error) {
      toast.error('Não foi possível parar a IA', { description: await erroDaFunction(error, data) });
      return;
    }
    toast.success('Você assumiu o chamado');
    carregarChamados();
  };

  const responder = async () => {
    if (!selecionado || !resposta.trim() || enviando) return;
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke('chamados-responder', {
      body: { chamado_id: selecionado.id, texto: resposta.trim() },
    });
    setEnviando(false);
    if (error || data?.error) {
      toast.error('Resposta não enviada', { description: await erroDaFunction(error, data) });
      return;
    }
    setResposta('');
    carregarMensagens(selecionado.id);
    carregarChamados();
  };

  const statusInfo = (s: string) => STATUS.find((x) => x.valor === s) || STATUS[0];

  if (!tabelaOk) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10 text-center">
        <Inbox className="mx-auto h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold">Chamados</h1>
        <p className="text-muted-foreground">
          A caixa de chamados ainda não está ativa no banco. Rode no SQL Editor do Supabase o arquivo{' '}
          <code className="rounded bg-muted px-1">supabase/migrations/20261005120000_chamados.sql</code> e recarregue esta página.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-72px-4rem)] min-h-[520px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Inbox className="h-7 w-7 text-primary" /> Chamados
          </h1>
          <p className="text-sm text-muted-foreground">Mensagens do Slack e do WhatsApp (ZapContábil) num lugar só</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setMeuSlackAberto(true)}>
            <span className={cn('h-2 w-2 rounded-full', minhaConexao ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
            {minhaConexao ? 'Meu Slack' : 'Conectar meu Slack'}
          </Button>
          {config?.zap_filtro && (
            <Button variant="outline" className="gap-2" onClick={sincronizarZap} disabled={sincronizando} title="Buscar agora as mensagens novas do WhatsApp">
              <RefreshCw className={cn('h-4 w-4', sincronizando && 'animate-spin')} /> WhatsApp
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setRelatorioAberto(true)}>
            <BarChart3 className="h-4 w-4" /> Relatório
          </Button>
          {isAdmin && (
            <Button variant="outline" className="gap-2" onClick={() => setConfigAberta(true)}>
              <Settings2 className="h-4 w-4" /> Integrações
            </Button>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Lista */}
        <section className={cn('flex min-h-0 flex-col rounded-2xl border border-border/70 bg-card', selecionado && 'hidden lg:flex')}>
          <div className="space-y-3 border-b border-border/60 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contato, canal ou assunto..." className="pl-9" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Select value={de} onValueChange={setDe}>
                <SelectTrigger className="h-7 w-auto min-w-[110px] rounded-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">{isAdmin ? 'De todos' : 'Todos que vejo'}</SelectItem>
                  <SelectItem value="meus">Meus</SelectItem>
                  {isAdmin &&
                    usuarios
                      .filter((u) => u.id !== meuId)
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome || u.email}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              {(['todas', 'slack', 'zapcontabil'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOrigem(o)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition',
                    origem === o ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'
                  )}
                >
                  {o === 'todas' ? 'Todas' : ORIGEM[o].rotulo}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {ABAS.map((a) => (
                <button
                  key={a.valor}
                  type="button"
                  onClick={() => setAba(a.valor)}
                  className={cn('rounded-md px-2 py-1 text-xs transition', aba === a.valor ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted/60')}
                >
                  {a.rotulo} <span className="opacity-60">{contagem(a.valor)}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {carregando ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : filtrados.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <MessageCircle className="mx-auto mb-2 h-8 w-8 opacity-40" />
                Nenhum chamado aqui.
              </div>
            ) : (
              filtrados.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelecionadoId(c.id)}
                  className={cn(
                    'flex w-full gap-3 border-b border-border/50 px-3 py-3 text-left transition hover:bg-muted/50',
                    selecionadoId === c.id && 'bg-primary/5'
                  )}
                >
                  <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', ORIGEM[c.origem].classe)}>
                    {c.origem === 'slack' ? 'S' : 'W'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cn('truncate text-sm', c.nao_lidas > 0 ? 'font-bold text-foreground' : 'font-medium text-foreground/90')}>
                        {c.contato_nome || c.contato_id || 'Contato'}
                      </span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{horaCurta(c.ultima_mensagem_em)}</span>
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {c.canal_nome}
                      {c.dono_id && c.dono_id !== meuId && nomeUsuario(c.dono_id) ? ` · Slack de ${nomeUsuario(c.dono_id)}` : ''}
                    </span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{c.assunto}</span>
                      {c.nao_lidas > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                          {c.nao_lidas}
                        </span>
                      )}
                    </span>
                    <span className={cn('mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium', statusInfo(c.status).cor)}>{statusInfo(c.status).rotulo}</span>
                    {c.ia_ativa && <span className="ml-1 mt-1 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">🧑‍💻 IA atendendo</span>}
                    {!c.ia_ativa && c.ia_status === 'devolvido' && c.status !== 'resolvido' && (
                      <span className="ml-1 mt-1 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">🧑‍💻 IA devolveu</span>
                    )}
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Conversa */}
        <section className={cn('flex min-h-0 flex-col rounded-2xl border border-border/70 bg-card', !selecionado && 'hidden lg:flex')}>
          {!selecionado ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <Inbox className="h-12 w-12 opacity-30" />
              <p className="text-sm">Escolha um chamado para ver a conversa</p>
            </div>
          ) : (
            <>
              <div className="space-y-3 border-b border-border/60 p-4">
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => setSelecionadoId(null)} className="rounded-md p-1 hover:bg-muted lg:hidden" title="Voltar">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-bold', ORIGEM[selecionado.origem].classe)}>
                    {selecionado.origem === 'slack' ? 'S' : 'W'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-foreground">{selecionado.contato_nome || selecionado.contato_id}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {ORIGEM[selecionado.origem].rotulo} · {selecionado.canal_nome}
                      {selecionado.origem === 'zapcontabil' && selecionado.contato_id ? ` · ${selecionado.contato_id}` : ''}
                      {selecionado.dono_id ? ` · Slack de ${selecionado.dono_id === meuId ? 'você' : nomeUsuario(selecionado.dono_id) || 'outro usuário'}` : ''}
                    </p>
                  </div>
                  {selecionado.ia_ativa ? (
                    <Button size="sm" variant="outline" className="shrink-0" onClick={iaParar}>
                      Parar IA e assumir
                    </Button>
                  ) : (
                    selecionado.status !== 'resolvido' && (
                      <Button size="sm" className="shrink-0 gap-1 bg-violet-600 text-white hover:bg-violet-700" onClick={() => setIaAberta(true)}>
                        🧑‍💻 IA assume
                      </Button>
                    )
                  )}
                </div>
                {selecionado.ia_ativa ? (
                  <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
                    <p className="font-semibold">🧑‍💻 A IA está atendendo ({selecionado.ia_respostas ?? 0} resposta(s)). Se você responder, ela sai da conversa.</p>
                    <p className="mt-0.5 line-clamp-2 opacity-80">Orientação: {selecionado.ia_instrucoes}</p>
                  </div>
                ) : selecionado.ia_status && selecionado.ia_motivo ? (
                  <div
                    className={cn(
                      'rounded-lg border px-3 py-2 text-xs',
                      selecionado.ia_status === 'finalizado' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'
                    )}
                  >
                    🧑‍💻 {selecionado.ia_status === 'finalizado' ? 'A IA encerrou o atendimento' : 'A IA devolveu o atendimento'}: {selecionado.ia_motivo}
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  <Select value={selecionado.status} onValueChange={(v) => atualizar({ status: v })}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS.map((s) => (
                        <SelectItem key={s.valor} value={s.valor}>
                          {s.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selecionado.prioridade} onValueChange={(v) => atualizar({ prioridade: v })}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRIORIDADES.map((p) => (
                        <SelectItem key={p.valor} value={p.valor}>
                          Prioridade {p.rotulo.toLowerCase()}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selecionado.responsavel_id || 'ninguem'} onValueChange={(v) => atualizar({ responsavel_id: v === 'ninguem' ? null : v })}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Responsável" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ninguem">Sem responsável</SelectItem>
                      {usuarios.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome || u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selecionado.cliente_id || 'nenhum'} onValueChange={(v) => atualizar({ cliente_id: v === 'nenhum' ? null : v })}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhum">Sem cliente vinculado</SelectItem>
                      {clientes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome_empresa}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-muted/20 p-4">
                {mensagens.map((m) => (
                  <div key={m.id} className={cn('flex', m.direcao === 'saida' ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                        m.por_ia
                          ? 'rounded-br-sm bg-violet-600 text-white'
                          : m.direcao === 'saida'
                            ? 'rounded-br-sm bg-primary text-primary-foreground'
                            : 'rounded-bl-sm border border-border/60 bg-card text-foreground'
                      )}
                    >
                      <p className={cn('mb-0.5 text-[11px] font-semibold', m.direcao === 'saida' ? 'text-primary-foreground/80' : 'text-primary')}>{m.autor_nome}</p>
                      <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                      {(m.anexos || []).map((a, i) =>
                        a?.url ? (
                          <a
                            key={i}
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={cn('mt-1 flex items-center gap-1 text-xs underline', m.direcao === 'saida' ? 'text-primary-foreground' : 'text-primary')}
                          >
                            <Paperclip className="h-3.5 w-3.5" /> {a.nome || 'Anexo'}
                          </a>
                        ) : null
                      )}
                      <p className={cn('mt-1 text-right text-[10px]', m.direcao === 'saida' ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
                        {format(parseISO(m.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={fimConversa} />
              </div>

              <div className="border-t border-border/60 p-3">
                <div className="flex items-end gap-2">
                  <Textarea
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        responder();
                      }
                    }}
                    rows={2}
                    placeholder={`Responder pelo ${ORIGEM[selecionado.origem].rotulo}... (Ctrl+Enter envia)`}
                    className="min-h-[44px] resize-none"
                  />
                  <Button onClick={responder} disabled={enviando || !resposta.trim()} className="h-11 gap-2">
                    {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      <ConfigIntegracoes
        aberta={configAberta}
        onFechar={() => setConfigAberta(false)}
        config={config}
        onSalvo={setConfig}
        conexoes={conexoes}
        nomeUsuario={nomeUsuario}
      />
      <MeuSlack aberta={meuSlackAberto} onFechar={() => setMeuSlackAberto(false)} conexao={minhaConexao} onMudou={carregarConexoes} />
      <Dialog open={iaAberta} onOpenChange={(v) => !iaOcupada && setIaAberta(v)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>🧑‍💻 A IA assume este chamado</DialogTitle>
            <DialogDescription>
              Escreva como você explicaria para um estagiário: o que dizer ao cliente, onde procurar e quando chamar a equipe. A IA se apresenta como assistente
              virtual, explica, pergunta se ficou claro e tenta de outro jeito até o cliente entender. Ela encerra sozinha quando ele confirmar, ou devolve
              para a equipe se não conseguir.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={8}
            value={iaInstrucoes}
            onChange={(e) => setIaInstrucoes(e.target.value)}
            placeholder={
              'Ex.: Dúvida de Onvio. O cliente quer liberar acesso para um funcionário novo.\nExplique: Configurações → Usuários → Convidar, informando o e-mail do funcionário. Ele recebe um e-mail para criar a senha.\nSe aparecer erro de permissão, peça um print e passe para a equipe.'
            }
          />
          <p className="text-[11px] text-muted-foreground">
            A IA não promete prazo, preço ou desconto e não mexe em nada do sistema: só conversa. Se você responder no chamado, ela sai na hora.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setIaAberta(false)} disabled={iaOcupada}>
              Cancelar
            </Button>
            <Button className="gap-2 bg-violet-600 text-white hover:bg-violet-700" onClick={iaAssumir} disabled={iaOcupada || iaInstrucoes.trim().length < 10}>
              {iaOcupada && <Loader2 className="h-4 w-4 animate-spin" />} {iaOcupada ? 'A IA está escrevendo...' : 'IA assume e responde'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <RelatorioMensal aberta={relatorioAberto} onFechar={() => setRelatorioAberto(false)} usuarios={usuarios} clientes={clientes} />
    </div>
  );
}

/**
 * Tela de integrações (admin): quem da equipe já conectou o Slack, o canal do
 * ZapContábil, o prazo de reabertura e os endereços para colar em cada lado.
 */
function ConfigIntegracoes({
  aberta,
  onFechar,
  config,
  onSalvo,
  conexoes,
  nomeUsuario,
}: {
  aberta: boolean;
  onFechar: () => void;
  config: Config | null;
  onSalvo: (c: Config) => void;
  conexoes: ConexaoSlack[];
  nomeUsuario: (id: string | null) => string | null;
}) {
  const [filtro, setFiltro] = useState('');
  const [reabrirHoras, setReabrirHoras] = useState('24');
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    if (!aberta) return;
    setFiltro(config?.zap_filtro || '');
    setReabrirHoras(String(config?.reabrir_horas ?? 24));
  }, [aberta, config]);

  const salvar = async () => {
    setSalvando(true);
    const horas = Math.min(720, Math.max(0, Math.round(Number(reabrirHoras) || 0)));
    const dados = {
      zap_filtro: filtro.trim() || null,
      reabrir_horas: horas,
      updated_at: new Date().toISOString(),
    };
    const resp = config
      ? await supabase.from('chamados_config').update(dados).eq('empresa_id', config.empresa_id).select('*').single()
      : await supabase.from('chamados_config').insert(dados).select('*').single();
    setSalvando(false);
    if (resp.error) {
      toast.error('Não foi possível salvar', { description: resp.error.message });
      return;
    }
    onSalvo(resp.data as Config);
    toast.success('Integrações salvas');
  };

  const copiar = (rotulo: string, texto: string) => {
    navigator.clipboard?.writeText(texto).then(() => {
      setCopiado(rotulo);
      setTimeout(() => setCopiado(null), 1500);
    });
  };

  const urlSlack = `${SUPABASE_URL}/functions/v1/slack-eventos`;
  const urlZap = config ? `${SUPABASE_URL}/functions/v1/zapcontabil-webhook?empresa=${config.empresa_id}&token=${config.zap_webhook_token}` : '';

  const CampoCopiar = ({ rotulo, valor }: { rotulo: string; valor: string }) => (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-[11px]">{valor || 'Salve a configuração primeiro'}</code>
      <Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0" disabled={!valor} onClick={() => copiar(rotulo, valor)} title="Copiar">
        {copiado === rotulo ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );

  return (
    <Dialog open={aberta} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Integrações dos Chamados</DialogTitle>
          <DialogDescription>De onde as mensagens chegam. Os tokens ficam guardados como secrets no Supabase, não aqui.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-3 rounded-xl border p-4">
            <p className="flex items-center gap-2 font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-[#4A154B] text-[10px] font-bold text-white">S</span> Slack
            </p>
            <div className="grid gap-1.5">
              <Label className="text-xs">Quem já conectou o Slack</Label>
              {conexoes.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Ninguém ainda. Cada usuário clica em “Conectar meu Slack” na tela de Chamados.</p>
              ) : (
                <ul className="divide-y rounded-md border text-xs">
                  {conexoes.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-1.5">
                      <span className="font-medium">{nomeUsuario(c.perfil_id) || 'Usuário'}</span>
                      <span className="text-muted-foreground">
                        {c.slack_nome || c.slack_user_id} · {c.canais.length ? `${c.canais.length} canal(is)` : 'só DMs e menções'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Request URL (Event Subscriptions do app do Slack)</Label>
              <CampoCopiar rotulo="slack" valor={urlSlack} />
              <p className="text-[11px] text-muted-foreground">
                No app do Slack, use também como Redirect URL (OAuth &amp; Permissions): <code>{`${SUPABASE_URL}/functions/v1/slack-oauth`}</code>
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border p-4">
            <p className="font-semibold">Contagem de chamados</p>
            <div className="grid gap-1.5">
              <Label className="text-xs">Reabrir o mesmo chamado se o contato voltar a falar em até (horas)</Label>
              <Input type="number" min={0} max={720} value={reabrirHoras} onChange={(e) => setReabrirHoras(e.target.value)} className="w-32" />
              <p className="text-[11px] text-muted-foreground">
                Depois desse prazo, mensagem nova numa conversa resolvida abre um chamado novo (e conta de novo no mês). Padrão: 24h.
              </p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <p className="flex items-center gap-2 font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-[#25D366] text-[10px] font-bold text-white">W</span> ZapContábil (WhatsApp)
            </p>
            <div className="grid gap-1.5">
              <Label className="text-xs">Canal (nome da conexão ou do setor no ZapContábil)</Label>
              <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Ex.: Impertech" />
              <p className="text-[11px] text-muted-foreground">
                Todas as mensagens desse canal entram como chamados da equipe toda, a cada minuto. Respostas enviadas daqui saem assinadas com o nome de quem respondeu, como no ZapContábil.
              </p>
              {config?.zap_sync_erro ? (
                <p className="text-[11px] text-destructive">Erro na última sincronização: {config.zap_sync_erro}</p>
              ) : config?.zap_sync_ate ? (
                <p className="text-[11px] text-emerald-600">Sincronizado até {format(parseISO(config.zap_sync_ate), "dd/MM 'às' HH:mm")}</p>
              ) : null}
            </div>
            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer">Webhook (opcional, se o ZapContábil oferecer)</summary>
              <div className="mt-2 grid gap-1.5">
                <CampoCopiar rotulo="zap" valor={urlZap} />
                <p>Esta URL tem um token secreto: não compartilhe.</p>
              </div>
            </details>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
