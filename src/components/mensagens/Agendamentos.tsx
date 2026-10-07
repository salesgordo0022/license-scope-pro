import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Edit, Trash2, Loader2, Paperclip, Clock, Search, X, Send } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { erroDaFunction } from '@/lib/erroFunction';
import { canalLembrado, lembrarCanal, useConexoesZap } from '@/hooks/use-conexoes-zap';
import { SeletorCanal } from '@/components/mensagens/SeletorCanal';
import { descreverRegra, preencherVariaveis, proximaExecucao, type Recorrencia, type RegraAgenda } from '@/lib/agenda';

interface Agendamento extends RegraAgenda {
  id: string;
  titulo: string;
  tipo: string;
  mensagem: string;
  destino: 'todos_ativos' | 'selecionados';
  clientes_ids: string[];
  conexao_id: number | null;
  conexao_nome: string | null;
  anexo_path: string | null;
  anexo_nome: string | null;
  ativo: boolean;
  proxima_execucao: string | null;
  ultima_execucao: string | null;
}

interface ItemFila {
  id: string;
  cliente_nome: string | null;
  telefone: string;
  tipo: string;
  anexo_nome: string | null;
  enviar_em: string;
  status: string;
  erro: string | null;
  agendamento_id: string | null;
}

interface ClienteBasico {
  id: string;
  nome_empresa: string;
  telefone: string | null;
  status: string | null;
}

const VARIAVEIS = [
  { v: '{nome}', d: 'nome da empresa' },
  { v: '{contato}', d: 'nome do dono/contato' },
  { v: '{mes}', d: 'mês atual' },
  { v: '{mes_anterior}', d: 'mês anterior' },
  { v: '{ano}', d: 'ano' },
  { v: '{data}', d: 'data do envio' },
  { v: '{mensalidade}', d: 'valor da mensalidade' },
];

const MODELOS = [
  {
    titulo: 'Lembrete de boleto (dia 10)',
    tipo: 'boleto',
    recorrencia: 'mensal' as Recorrencia,
    dia_mes: 10,
    mensagem: 'Olá {contato}, tudo bem?\n\nLembrete: a mensalidade do seu sistema referente a {mes} vence hoje ({data}). Valor: {mensalidade}.\n\nSe já pagou, desconsidere. Qualquer dúvida estamos à disposição.',
  },
  {
    titulo: 'Fim do mês: está tudo bem?',
    tipo: 'avulsa',
    recorrencia: 'ultimo_dia_mes' as Recorrencia,
    dia_mes: null,
    mensagem: 'Olá {contato}! Passando para saber se está tudo certo com o sistema neste fim de {mes}.\n\nTeve alguma dificuldade ou precisa de ajuda com algo? É só responder esta mensagem que a nossa equipe atende você.',
  },
];

const STATUS_FILA: Record<string, { rotulo: string; cor: string }> = {
  pendente: { rotulo: 'Agendado', cor: 'bg-blue-50 text-blue-700' },
  enviando: { rotulo: 'Enviando', cor: 'bg-amber-50 text-amber-700' },
  enviado: { rotulo: 'Enviado', cor: 'bg-emerald-50 text-emerald-700' },
  enviado_link: { rotulo: 'Enviado (link)', cor: 'bg-emerald-50 text-emerald-700' },
  enviado_sem_anexo: { rotulo: 'Sem anexo', cor: 'bg-amber-50 text-amber-700' },
  erro: { rotulo: 'Erro', cor: 'bg-red-50 text-red-700' },
  cancelado: { rotulo: 'Cancelado', cor: 'bg-muted text-muted-foreground' },
};

const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const dois = (n: number) => String(n).padStart(2, '0');

/** Data (AAAA-MM-DD) e hora (HH:MM) de Brasília daqui a `minutos`, arredondada para cima de 5 em 5. */
function daquiA(minutos: number): { data: string; hora: string } {
  const t = new Date(Date.now() + minutos * 60_000 - 3 * 3600_000); // relógio de Brasília em UTC
  const m = Math.ceil(t.getUTCMinutes() / 5) * 5;
  t.setUTCMinutes(m, 0, 0);
  return { data: `${t.getUTCFullYear()}-${dois(t.getUTCMonth() + 1)}-${dois(t.getUTCDate())}`, hora: `${dois(t.getUTCHours())}:${dois(t.getUTCMinutes())}` };
}

const dataHora = (iso: string | null) => (iso ? format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '—');

function arquivoParaBase64(f: File): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(r.error);
    r.readAsDataURL(f);
  });
}

const vazio = (): Omit<Agendamento, 'id' | 'proxima_execucao' | 'ultima_execucao'> => ({
  titulo: '',
  tipo: 'avulsa',
  mensagem: '',
  recorrencia: 'mensal',
  dia_mes: 10,
  dia_semana: 1,
  data_unica: null,
  hora: '09:00',
  destino: 'todos_ativos',
  clientes_ids: [],
  conexao_id: canalLembrado(),
  conexao_nome: null,
  anexo_path: null,
  anexo_nome: null,
  ativo: true,
});

/**
 * Mensagens programadas: regras que enviam sozinhas (todo dia 10, último dia
 * do mês, toda semana...) para todos os clientes ativos ou para escolhidos,
 * por um canal do ZapContábil. Embaixo, a fila com o que está agendado
 * (inclusive boletos agendados na Pasta de Boletos) e o que já saiu.
 */
export default function Agendamentos() {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([]);
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [clientes, setClientes] = useState<ClienteBasico[]>([]);
  const [tabelaOk, setTabelaOk] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState(vazio());
  const [buscaCliente, setBuscaCliente] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState(false);
  const [verFila, setVerFila] = useState<'proximos' | 'enviados'>('proximos');
  const { conexoes } = useConexoesZap();

  const carregar = useCallback(async () => {
    const [ag, fi, cl] = await Promise.all([
      supabase.from('mensagens_agendadas').select('*').order('proxima_execucao', { ascending: true, nullsFirst: false }),
      supabase.from('fila_envios').select('id, cliente_nome, telefone, tipo, anexo_nome, enviar_em, status, erro, agendamento_id').order('enviar_em', { ascending: false }).limit(300),
      supabase.from('clientes').select('id, nome_empresa, telefone, status').order('nome_empresa'),
    ]);
    if (ag.error) {
      setTabelaOk(false);
      setCarregando(false);
      return;
    }
    setAgendamentos((ag.data || []) as Agendamento[]);
    setFila((fi.data || []) as ItemFila[]);
    setClientes((cl.data || []) as ClienteBasico[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 30000);
    return () => clearInterval(t);
  }, [carregar]);

  const ativos = clientes.filter((c) => c.status === 'ativo' && (c.telefone || '').replace(/\D/g, '').length >= 10);
  // Mostra "Hoje"/"Amanhã" no seletor quando a data única cai nesses dias.
  const opcaoQuando =
    form.recorrencia !== 'uma_vez'
      ? form.recorrencia
      : form.data_unica === daquiA(0).data
        ? 'hoje'
        : form.data_unica === daquiA(24 * 60).data
          ? 'amanha'
          : 'uma_vez';
  const proximaPrevista = useMemo(() => proximaExecucao(form, new Date()), [form]);
  const exemplo = useMemo(() => {
    const c = form.destino === 'selecionados' ? clientes.find((x) => form.clientes_ids.includes(x.id)) : ativos[0];
    return preencherVariaveis(form.mensagem, { nome: c?.nome_empresa || 'Empresa Exemplo', contato: 'Fulano', mensalidade: 150 }, proximaPrevista ?? new Date());
  }, [form, clientes, ativos, proximaPrevista]);

  const abrirNovo = (modelo?: (typeof MODELOS)[number]) => {
    setEditandoId(null);
    setForm({ ...vazio(), ...(modelo ? { titulo: modelo.titulo, tipo: modelo.tipo, recorrencia: modelo.recorrencia, dia_mes: modelo.dia_mes, mensagem: modelo.mensagem } : {}) });
    setBuscaCliente('');
    setAberto(true);
  };

  const abrirEdicao = (a: Agendamento) => {
    setEditandoId(a.id);
    setForm({ ...a, hora: a.hora.slice(0, 5) });
    setBuscaCliente('');
    setAberto(true);
  };

  const anexar = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) return toast.error('Arquivo maior que 8 MB');
    setSubindo(true);
    const { data, error } = await supabase.functions.invoke('envios-agendados', {
      body: { acao: 'upload_anexo', nome: f.name, tipo: f.type || 'application/pdf', base64: await arquivoParaBase64(f) },
    });
    setSubindo(false);
    if (error || data?.error) return toast.error('Anexo não enviado', { description: await erroDaFunction(error, data) });
    setForm((x) => ({ ...x, anexo_path: data.path, anexo_nome: f.name }));
  };

  const salvar = async () => {
    if (!form.titulo.trim() || !form.mensagem.trim()) return toast.error('Preencha o título e a mensagem');
    if (form.recorrencia === 'uma_vez' && !form.data_unica) return toast.error('Escolha a data do envio');
    if (form.destino === 'selecionados' && form.clientes_ids.length === 0) return toast.error('Escolha pelo menos um cliente');
    const proxima = proximaExecucao(form, new Date());
    if (!proxima) return toast.error('Essa data já passou');
    setSalvando(true);
    const conexao = conexoes.find((c) => c.id === form.conexao_id);
    const dados = {
      titulo: form.titulo.trim(),
      tipo: form.tipo,
      mensagem: form.mensagem,
      recorrencia: form.recorrencia,
      dia_mes: form.recorrencia === 'mensal' ? form.dia_mes : null,
      dia_semana: form.recorrencia === 'semanal' ? form.dia_semana : null,
      data_unica: form.recorrencia === 'uma_vez' ? form.data_unica : null,
      hora: form.hora,
      destino: form.destino,
      clientes_ids: form.destino === 'selecionados' ? form.clientes_ids : [],
      conexao_id: form.conexao_id,
      conexao_nome: conexao?.nome ?? null,
      anexo_path: form.anexo_path,
      anexo_nome: form.anexo_nome,
      ativo: form.ativo,
      proxima_execucao: proxima.toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = editandoId
      ? await supabase.from('mensagens_agendadas').update(dados).eq('id', editandoId)
      : await supabase.from('mensagens_agendadas').insert(dados);
    setSalvando(false);
    if (error) return toast.error('Não foi possível salvar', { description: error.message });
    toast.success('Agendamento salvo', { description: `Próximo envio: ${dataHora(proxima.toISOString())}` });
    setAberto(false);
    carregar();
  };

  const alternarAtivo = async (a: Agendamento, ativo: boolean) => {
    const proxima = ativo ? proximaExecucao(a, new Date()) : null;
    if (ativo && !proxima) return toast.error('A data deste agendamento já passou; edite para escolher outra');
    const { error } = await supabase
      .from('mensagens_agendadas')
      .update({ ativo, proxima_execucao: proxima ? proxima.toISOString() : a.proxima_execucao, updated_at: new Date().toISOString() })
      .eq('id', a.id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const excluir = async (a: Agendamento) => {
    if (!window.confirm(`Excluir o agendamento "${a.titulo}"? Os envios já feitos continuam no histórico.`)) return;
    const { error } = await supabase.from('mensagens_agendadas').delete().eq('id', a.id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const cancelar = async (item: ItemFila) => {
    const { error } = await supabase.from('fila_envios').update({ status: 'cancelado' }).eq('id', item.id).eq('status', 'pendente');
    if (error) return toast.error(error.message);
    carregar();
  };

  const destinatarios = (a: Agendamento) => (a.destino === 'todos_ativos' ? `Todos os clientes ativos (${ativos.length})` : `${a.clientes_ids.length} cliente(s) escolhido(s)`);
  const filtradosCliente = clientes.filter((c) => !buscaCliente || c.nome_empresa.toLowerCase().includes(buscaCliente.toLowerCase()));
  const listaFila = fila.filter((f) => (verFila === 'proximos' ? f.status === 'pendente' || f.status === 'enviando' : f.status !== 'pendente' && f.status !== 'enviando'));
  const proximosOrdenados = verFila === 'proximos' ? [...listaFila].sort((a, b) => a.enviar_em.localeCompare(b.enviar_em)) : listaFila;

  if (!tabelaOk) {
    return (
      <div className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
        Os agendamentos ainda não estão ativos no banco. Rode no SQL Editor a migration{' '}
        <code className="rounded bg-muted px-1">20261007150000_envios_agendados.sql</code> e recarregue.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Mensagens programadas</h2>
          <p className="text-sm text-muted-foreground">Saem sozinhas na data e hora marcadas (horário de Brasília), pelo canal escolhido.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {MODELOS.map((m) => (
            <Button key={m.titulo} variant="outline" size="sm" onClick={() => abrirNovo(m)}>
              {m.titulo}
            </Button>
          ))}
          <Button size="sm" className="gap-2" onClick={() => abrirNovo()}>
            <Plus className="h-4 w-4" /> Novo agendamento
          </Button>
        </div>
      </div>

      {carregando ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : agendamentos.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma mensagem programada. Comece por um dos modelos acima.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {agendamentos.map((a) => (
            <div key={a.id} className={cn('rounded-xl border p-4', !a.ativo && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{a.titulo}</p>
                  <p className="text-sm text-primary">{descreverRegra(a)}</p>
                </div>
                <Switch checked={a.ativo} onCheckedChange={(v) => alternarAtivo(a, v)} title={a.ativo ? 'Pausar' : 'Ativar'} />
              </div>
              <p className="mt-2 line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{a.mensagem}</p>
              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
                <Badge variant="secondary">{destinatarios(a)}</Badge>
                <Badge variant="secondary">Canal: {a.conexao_nome || conexoes.find((c) => c.id === a.conexao_id)?.nome || 'padrão'}</Badge>
                {a.anexo_nome && (
                  <Badge variant="secondary" className="gap-1">
                    <Paperclip className="h-3 w-3" /> {a.anexo_nome}
                  </Badge>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {a.ativo && a.proxima_execucao ? `Próximo: ${dataHora(a.proxima_execucao)}` : a.ativo ? '—' : 'Pausado'}
                </span>
                <span className="flex gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => abrirEdicao(a)} title="Editar">
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => excluir(a)} title="Excluir">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Send className="h-4 w-4 text-primary" />
          <p className="font-semibold">Fila de envios</p>
          <span className="text-xs text-muted-foreground">mensagens programadas e boletos agendados</span>
          <div className="ml-auto flex gap-1">
            {(['proximos', 'enviados'] as const).map((v) => (
              <Button key={v} size="sm" variant={verFila === v ? 'secondary' : 'ghost'} onClick={() => setVerFila(v)}>
                {v === 'proximos' ? 'Próximos' : 'Já processados'}
              </Button>
            ))}
          </div>
        </div>
        {proximosOrdenados.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">{verFila === 'proximos' ? 'Nada agendado para enviar.' : 'Nada enviado ainda.'}</p>
        ) : (
          <div className="max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Quando</th>
                  <th className="px-4 py-2 text-left font-medium">Cliente</th>
                  <th className="px-4 py-2 text-left font-medium">O quê</th>
                  <th className="px-4 py-2 text-left font-medium">Situação</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {proximosOrdenados.map((f) => (
                  <tr key={f.id} className="border-t border-border/50 align-top">
                    <td className="whitespace-nowrap px-4 py-2 tabular-nums">{dataHora(f.enviar_em)}</td>
                    <td className="px-4 py-2">
                      <span className="block font-medium">{f.cliente_nome || '—'}</span>
                      <span className="text-xs text-muted-foreground">{f.telefone}</span>
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {f.tipo === 'boleto' ? 'Boleto' : 'Mensagem'}
                      {f.anexo_nome && <span className="block text-muted-foreground">📎 {f.anexo_nome}</span>}
                      {f.agendamento_id && <span className="block text-muted-foreground">{agendamentos.find((a) => a.id === f.agendamento_id)?.titulo}</span>}
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', STATUS_FILA[f.status]?.cor)}>{STATUS_FILA[f.status]?.rotulo || f.status}</span>
                      {f.erro && <span className="mt-1 block max-w-[260px] text-[11px] text-muted-foreground">{f.erro}</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {f.status === 'pendente' && (
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-destructive" onClick={() => cancelar(f)}>
                          <X className="h-3.5 w-3.5" /> Cancelar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoId ? 'Editar agendamento' : 'Novo agendamento'}</DialogTitle>
            <DialogDescription>A mensagem sai sozinha para cada cliente, com o nome dele no lugar de {'{nome}'}.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
              <div className="space-y-1.5">
                <Label>Título (só para você)</Label>
                <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Lembrete de boleto" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo no histórico</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="avulsa">Mensagem</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                    <SelectItem value="lembrete">Lembrete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Mensagem</Label>
              <Textarea rows={6} value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} />
              <div className="flex flex-wrap gap-1">
                {VARIAVEIS.map((x) => (
                  <button
                    key={x.v}
                    type="button"
                    title={x.d}
                    onClick={() => setForm((f) => ({ ...f, mensagem: `${f.mensagem}${x.v}` }))}
                    className="rounded border px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted"
                  >
                    {x.v}
                  </button>
                ))}
              </div>
              {form.mensagem && (
                <div className="rounded-lg bg-[#DCF8C6] p-3 text-xs text-[#111] dark:bg-emerald-900/40 dark:text-emerald-50">
                  <p className="mb-1 text-[10px] font-semibold uppercase opacity-60">Como o cliente recebe</p>
                  <p className="whitespace-pre-line">{exemplo}</p>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Quando</Label>
                <Select
                  value={opcaoQuando}
                  onValueChange={(v) => {
                    // "Hoje" e "Amanhã" são atalhos de "uma vez só" com a data já preenchida.
                    if (v === 'hoje') {
                      const d = daquiA(10);
                      return setForm({ ...form, recorrencia: 'uma_vez', data_unica: d.data, hora: d.hora });
                    }
                    if (v === 'amanha') {
                      return setForm({ ...form, recorrencia: 'uma_vez', data_unica: daquiA(24 * 60).data, hora: '09:00' });
                    }
                    const r = v as Recorrencia;
                    if (r === 'uma_vez' && !form.data_unica) {
                      const d = daquiA(10);
                      setForm({ ...form, recorrencia: r, data_unica: d.data, hora: d.hora });
                    } else setForm({ ...form, recorrencia: r });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hoje">Hoje (uma vez)</SelectItem>
                    <SelectItem value="amanha">Amanhã (uma vez)</SelectItem>
                    <SelectItem value="mensal">Todo mês, no dia...</SelectItem>
                    <SelectItem value="ultimo_dia_mes">Último dia do mês</SelectItem>
                    <SelectItem value="semanal">Toda semana</SelectItem>
                    <SelectItem value="diaria">Todos os dias</SelectItem>
                    <SelectItem value="uma_vez">Uma vez, em outra data</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.recorrencia === 'mensal' && (
                <div className="space-y-1.5">
                  <Label>Dia do mês</Label>
                  <Input type="number" min={1} max={31} value={form.dia_mes ?? 10} onChange={(e) => setForm({ ...form, dia_mes: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
                </div>
              )}
              {form.recorrencia === 'semanal' && (
                <div className="space-y-1.5">
                  <Label>Dia da semana</Label>
                  <Select value={String(form.dia_semana ?? 1)} onValueChange={(v) => setForm({ ...form, dia_semana: Number(v) })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEMANA.map((d, i) => (
                        <SelectItem key={d} value={String(i)}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {form.recorrencia === 'uma_vez' && (
                <div className="space-y-1.5">
                  <Label>Data</Label>
                  <Input type="date" min={daquiA(0).data} value={form.data_unica ?? ''} onChange={(e) => setForm({ ...form, data_unica: e.target.value || null })} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Hora</Label>
                <Input type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value || '09:00' })} />
              </div>
            </div>
            {form.recorrencia === 'uma_vez' && (
              <div className="-mt-1 flex flex-wrap gap-1.5">
                {[
                  { rotulo: 'Daqui a 5 min', min: 5 },
                  { rotulo: 'Daqui a 30 min', min: 30 },
                  { rotulo: 'Daqui a 1 hora', min: 60 },
                ].map((o) => (
                  <Button
                    key={o.rotulo}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => {
                      const d = daquiA(o.min);
                      setForm({ ...form, data_unica: d.data, hora: d.hora });
                    }}
                  >
                    {o.rotulo}
                  </Button>
                ))}
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setForm({ ...form, data_unica: daquiA(0).data, hora: '18:00' })}>
                  Hoje às 18:00
                </Button>
              </div>
            )}
            <p className={cn('-mt-2 text-xs', proximaPrevista ? 'text-muted-foreground' : 'text-destructive')}>
              {proximaPrevista
                ? `Primeiro envio: ${dataHora(proximaPrevista.toISOString())}`
                : form.recorrencia === 'uma_vez' && form.data_unica === daquiA(0).data
                  ? `Esse horário de hoje já passou: escolha depois de ${daquiA(0).hora}.`
                  : 'Essa data já passou.'}
              {form.recorrencia === 'mensal' && (form.dia_mes ?? 0) > 28 ? ' · Nos meses mais curtos, sai no último dia.' : ''}
            </p>

            <div className="space-y-1.5">
              <Label>Canal do WhatsApp (conexão do ZapContábil)</Label>
              <SeletorCanal
                valor={form.conexao_id}
                onChange={(id) => {
                  setForm({ ...form, conexao_id: id });
                  lembrarCanal(id);
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Para quem</Label>
              <div className="flex gap-2">
                {(['todos_ativos', 'selecionados'] as const).map((d) => (
                  <Button key={d} type="button" size="sm" variant={form.destino === d ? 'default' : 'outline'} onClick={() => setForm({ ...form, destino: d })}>
                    {d === 'todos_ativos' ? `Todos os clientes ativos (${ativos.length})` : `Escolher clientes${form.clientes_ids.length ? ` (${form.clientes_ids.length})` : ''}`}
                  </Button>
                ))}
              </div>
              {form.destino === 'selecionados' && (
                <div className="rounded-lg border">
                  <div className="relative border-b p-2">
                    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={buscaCliente} onChange={(e) => setBuscaCliente(e.target.value)} placeholder="Buscar cliente..." className="h-8 pl-8" />
                  </div>
                  <div className="max-h-52 overflow-y-auto p-1">
                    {filtradosCliente.map((c) => {
                      const semFone = (c.telefone || '').replace(/\D/g, '').length < 10;
                      const marcado = form.clientes_ids.includes(c.id);
                      return (
                        <label key={c.id} className={cn('flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted', semFone && 'opacity-50')}>
                          <Checkbox
                            checked={marcado}
                            disabled={semFone}
                            onCheckedChange={(v) =>
                              setForm((f) => ({ ...f, clientes_ids: v ? [...f.clientes_ids, c.id] : f.clientes_ids.filter((x) => x !== c.id) }))
                            }
                          />
                          <span className="flex-1 truncate">{c.nome_empresa}</span>
                          <span className="text-[11px] text-muted-foreground">{semFone ? 'sem telefone' : c.status}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Clientes sem telefone são pulados.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Anexo fixo (opcional)</Label>
              {form.anexo_nome ? (
                <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <Paperclip className="h-4 w-4" /> <span className="flex-1 truncate">{form.anexo_nome}</span>
                  <Button size="sm" variant="ghost" onClick={() => setForm({ ...form, anexo_path: null, anexo_nome: null })}>
                    Remover
                  </Button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                  {subindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                  {subindo ? 'Enviando arquivo...' : 'Escolher PDF ou imagem (até 8 MB): vai o mesmo arquivo para todos'}
                  <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => anexar(e.target.files?.[0])} />
                </label>
              )}
              <p className="text-[11px] text-muted-foreground">Para mandar o boleto de cada cliente, use a Pasta de Boletos → Agendar.</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button onClick={salvar} disabled={salvando || subindo}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
