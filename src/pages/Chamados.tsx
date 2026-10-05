import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Inbox, Search, Send, Settings2, Loader2, MessageCircle, Paperclip, ChevronLeft, Copy, Check } from '@/components/icons';
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
  ultima_mensagem_em: string;
  nao_lidas: number;
}

interface Mensagem {
  id: string;
  direcao: 'entrada' | 'saida';
  autor_nome: string | null;
  texto: string;
  anexos: { nome?: string; url?: string }[] | null;
  created_at: string;
}

interface Config {
  empresa_id: string;
  slack_team_id: string | null;
  slack_user_id: string | null;
  slack_canais: string[];
  zap_webhook_token: string;
  zap_filtro: string | null;
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
 * Chamados: caixa de entrada única com as mensagens do Slack (DMs, menções e
 * canais escolhidos) e de um canal do ZapContábil (WhatsApp). Dá para mudar
 * status, prioridade, responsável, vincular ao cliente e responder — a
 * resposta volta para a origem. Atualiza em tempo real.
 */
export default function Chamados() {
  const { isAdmin } = useAuth();
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tabelaOk, setTabelaOk] = useState(true);
  const [aba, setAba] = useState('ativos');
  const [origem, setOrigem] = useState<'todas' | 'slack' | 'zapcontabil'>('todas');
  const [busca, setBusca] = useState('');
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [resposta, setResposta] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string | null; email: string | null }[]>([]);
  const [clientes, setClientes] = useState<{ id: string; nome_empresa: string }[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  const [configAberta, setConfigAberta] = useState(false);
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
    const { data } = await supabase.from('chamado_mensagens').select('id, direcao, autor_nome, texto, anexos, created_at').eq('chamado_id', id).order('created_at');
    setMensagens((data || []) as Mensagem[]);
  }, []);

  useEffect(() => {
    carregarChamados();
    supabase.from('usuario_perfil').select('id, nome, email').order('nome').then(({ data }) => setUsuarios(data || []));
    supabase.from('clientes').select('id, nome_empresa').order('nome_empresa').then(({ data }) => setClientes(data || []));
    supabase.from('chamados_config').select('*').maybeSingle().then(({ data }) => setConfig((data as Config) || null));
  }, [carregarChamados]);

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
      const casaBusca =
        !termo ||
        [c.contato_nome, c.canal_nome, c.assunto, c.contato_id].some((v) => (v || '').toLowerCase().includes(termo));
      return casaAba && casaOrigem && casaBusca;
    });
  }, [chamados, aba, origem, busca]);

  const contagem = (valor: string) =>
    chamados.filter((c) => (valor === 'todos' ? true : valor === 'ativos' ? c.status !== 'resolvido' : c.status === valor)).length;

  const atualizar = async (campos: Partial<Chamado>) => {
    if (!selecionado) return;
    setChamados((lista) => lista.map((c) => (c.id === selecionado.id ? { ...c, ...campos } : c)));
    const { error } = await supabase.from('chamados').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', selecionado.id);
    if (error) {
      toast.error('Não foi possível atualizar o chamado', { description: error.message });
      carregarChamados();
    }
  };

  const responder = async () => {
    if (!selecionado || !resposta.trim() || enviando) return;
    setEnviando(true);
    const { data, error } = await supabase.functions.invoke('chamados-responder', {
      body: { chamado_id: selecionado.id, texto: resposta.trim() },
    });
    setEnviando(false);
    if (error || data?.error) {
      let detalhe = data?.error as string | undefined;
      if (!detalhe && error && 'context' in error) {
        try {
          detalhe = (await (error as { context: Response }).context.json())?.error;
        } catch {
          /* sem corpo */
        }
      }
      toast.error('Resposta não enviada', { description: detalhe || error?.message });
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
        {isAdmin && (
          <Button variant="outline" className="gap-2" onClick={() => setConfigAberta(true)}>
            <Settings2 className="h-4 w-4" /> Integrações
          </Button>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Lista */}
        <section className={cn('flex min-h-0 flex-col rounded-2xl border border-border/70 bg-card', selecionado && 'hidden lg:flex')}>
          <div className="space-y-3 border-b border-border/60 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contato, canal ou assunto..." className="pl-9" />
            </div>
            <div className="flex gap-1.5">
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
                    <span className="block truncate text-[11px] text-muted-foreground">{c.canal_nome}</span>
                    <span className="mt-0.5 flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{c.assunto}</span>
                      {c.nao_lidas > 0 && (
                        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                          {c.nao_lidas}
                        </span>
                      )}
                    </span>
                    <span className={cn('mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium', statusInfo(c.status).cor)}>{statusInfo(c.status).rotulo}</span>
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
                    </p>
                  </div>
                </div>
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
                        m.direcao === 'saida' ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border border-border/60 bg-card text-foreground'
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

      <ConfigIntegracoes aberta={configAberta} onFechar={() => setConfigAberta(false)} config={config} onSalvo={setConfig} />
    </div>
  );
}

/** Tela de integrações: dados do Slack e do ZapContábil e os endereços para colar em cada um. */
function ConfigIntegracoes({
  aberta,
  onFechar,
  config,
  onSalvo,
}: {
  aberta: boolean;
  onFechar: () => void;
  config: Config | null;
  onSalvo: (c: Config) => void;
}) {
  const [slackUser, setSlackUser] = useState('');
  const [canais, setCanais] = useState('');
  const [filtro, setFiltro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  useEffect(() => {
    if (!aberta) return;
    setSlackUser(config?.slack_user_id || '');
    setCanais((config?.slack_canais || []).join(', '));
    setFiltro(config?.zap_filtro || '');
  }, [aberta, config]);

  const salvar = async () => {
    setSalvando(true);
    const dados = {
      slack_user_id: slackUser.trim() || null,
      slack_canais: canais
        .split(/[\s,;]+/)
        .map((c) => c.trim())
        .filter(Boolean),
      zap_filtro: filtro.trim() || null,
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
              <Label className="text-xs">Seu ID de usuário no Slack (U…)</Label>
              <Input value={slackUser} onChange={(e) => setSlackUser(e.target.value)} placeholder="U0123ABCD" />
              <p className="text-[11px] text-muted-foreground">No Slack: clique na sua foto → Perfil → ⋮ → Copiar ID do membro. DMs e menções a você viram chamado.</p>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Canais que viram chamado por inteiro (IDs C…, separados por vírgula)</Label>
              <Input value={canais} onChange={(e) => setCanais(e.target.value)} placeholder="C0123SUPORTE, C0456CLIENTES" />
              <p className="text-[11px] text-muted-foreground">No canal: clique no nome → no rodapé aparece o ID do canal.</p>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Request URL (Event Subscriptions do app do Slack)</Label>
              <CampoCopiar rotulo="slack" valor={urlSlack} />
              {config?.slack_team_id && <p className="text-[11px] text-emerald-600">Workspace conectado: {config.slack_team_id}</p>}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <p className="flex items-center gap-2 font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded bg-[#25D366] text-[10px] font-bold text-white">W</span> ZapContábil (WhatsApp)
            </p>
            <div className="grid gap-1.5">
              <Label className="text-xs">Canal a receber (ID ou nome da conexão/fila; vazio = todos)</Label>
              <Input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Ex.: Suporte" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">URL do webhook (cole no ZapContábil)</Label>
              <CampoCopiar rotulo="zap" valor={urlZap} />
              <p className="text-[11px] text-muted-foreground">Esta URL tem um token secreto: não compartilhe.</p>
            </div>
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
