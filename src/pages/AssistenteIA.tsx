import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Edit, Trash2, Loader2, Search, Save, Zap } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SeletorCanal } from '@/components/mensagens/SeletorCanal';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { erroDaFunction } from '@/lib/erroFunction';

interface ConfigIA {
  empresa_id?: string;
  alerta_fila_ativo: boolean;
  alerta_fila_limite: number;
  alerta_intervalo_min: number;
  alerta_fila_geral: boolean;
  alerta_conexao_id: number | null;
  alerta_conexao_nome: string | null;
  aviso_demora_ativo: boolean;
  aviso_demora_min: number;
  aviso_demora_slack: boolean;
  aviso_demora_whatsapp: boolean;
  aviso_demora_texto: string;
  plantao_ia_ajuda: boolean;
  horario_dias: number[];
  horario_inicio: string;
  horario_fim: string;
  usar_forum: boolean;
  modelo: string | null;
}

const PADRAO: ConfigIA = {
  alerta_fila_ativo: true,
  alerta_fila_limite: 5,
  alerta_intervalo_min: 60,
  alerta_fila_geral: true,
  alerta_conexao_id: null,
  alerta_conexao_nome: null,
  aviso_demora_ativo: true,
  aviso_demora_min: 10,
  aviso_demora_slack: true,
  aviso_demora_whatsapp: false,
  aviso_demora_texto: 'Oi {nome}! Recebemos sua mensagem. {atendente} está finalizando outro atendimento e já te responde. Obrigado pela paciência! 🙏',
  plantao_ia_ajuda: false,
  horario_dias: [1, 2, 3, 4, 5],
  horario_inicio: '08:00',
  horario_fim: '18:00',
  usar_forum: true,
  modelo: null,
};

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MODELOS = [
  { id: 'padrao', nome: 'Padrão (openai/gpt-oss-120b, o mais capaz)' },
  { id: 'openai/gpt-oss-20b', nome: 'openai/gpt-oss-20b (mais rápido, mais simples)' },
  { id: 'qwen/qwen3.8-27b', nome: 'qwen/qwen3.8-27b' },
];

interface Membro {
  id: string;
  nome: string | null;
  email: string | null;
  whatsapp: string;
  receber_alertas: boolean;
  salvo: boolean;
}

/** "Minha IA": preferências do próprio colaborador (vazio = regra da empresa). */
interface MinhaIA {
  whatsapp: string;
  receber_alertas: boolean;
  alerta_limite: number | null;
  alerta_intervalo_min: number | null;
  horario_proprio: boolean;
  horario_dias: number[];
  horario_inicio: string;
  horario_fim: string;
  aviso_demora_ativo: boolean | null;
  aviso_demora_min: number | null;
  aviso_demora_texto: string;
}

interface Artigo {
  id: string;
  titulo: string;
  conteudo: string;
  tags: string[];
  ativo: boolean;
  updated_at: string;
}

interface Alerta {
  id: string;
  tipo: string;
  perfil_id: string | null;
  quantidade: number | null;
  destino: string | null;
  mensagem: string | null;
  status: string;
  erro: string | null;
  created_at: string;
}

const Bloco = ({ titulo, descricao, ativo, onAtivo, children, podeEditar }: { titulo: string; descricao: string; ativo?: boolean; onAtivo?: (v: boolean) => void; children: React.ReactNode; podeEditar: boolean }) => (
  <div className={cn('space-y-4 rounded-xl border p-4', ativo === false && 'opacity-70')}>
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{titulo}</p>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </div>
      {onAtivo && <Switch checked={!!ativo} onCheckedChange={onAtivo} disabled={!podeEditar} />}
    </div>
    {children}
  </div>
);

const Numero = ({ rotulo, valor, onChange, sufixo, min = 1, max = 1440, disabled }: { rotulo: string; valor: number; onChange: (n: number) => void; sufixo: string; min?: number; max?: number; disabled?: boolean }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{rotulo}</Label>
    <div className="flex items-center gap-2">
      <Input type="number" min={min} max={max} value={valor} disabled={disabled} onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || min)))} className="w-24" />
      <span className="text-sm text-muted-foreground">{sufixo}</span>
    </div>
  </div>
);

/**
 * Painel do Assistente IA: regras do plantão (alerta de fila no WhatsApp da
 * equipe e aviso de demora ao cliente), WhatsApp de cada colaborador, base de
 * conhecimento que a IA consulta e o registro do que ela enviou.
 */
export default function AssistenteIA() {
  const { isAdmin, profile } = useAuth();
  const [cfg, setCfg] = useState<ConfigIA>(PADRAO);
  const [cfgExiste, setCfgExiste] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [tabelaOk, setTabelaOk] = useState(true);

  const [equipe, setEquipe] = useState<Membro[]>([]);
  const [artigos, setArtigos] = useState<Artigo[]>([]);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [statsIA, setStatsIA] = useState({ atendendo: 0, finalizado: 0, devolvido: 0 });
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Partial<Artigo> | null>(null);
  const [minha, setMinha] = useState<MinhaIA | null>(null);
  const [salvandoMinha, setSalvandoMinha] = useState(false);
  const [testando, setTestando] = useState(false);

  const carregar = useCallback(async () => {
    const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const [c, eq, pf, ar, al, ch] = await Promise.all([
      supabase.from('ia_config').select('*').maybeSingle(),
      supabase.from('ia_equipe').select('*'),
      supabase.from('usuario_perfil').select('id, nome, email').order('nome'),
      supabase.from('ia_conhecimento').select('id, titulo, conteudo, tags, ativo, updated_at').order('titulo'),
      supabase.from('ia_alertas').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('chamados').select('ia_status, ia_ativa').not('ia_status', 'is', null).gte('updated_at', inicioMes),
    ]);
    if (c.error) {
      setTabelaOk(false);
      return;
    }
    if (c.data) {
      setCfg({ ...PADRAO, ...(c.data as ConfigIA), horario_inicio: String(c.data.horario_inicio).slice(0, 5), horario_fim: String(c.data.horario_fim).slice(0, 5) });
      setCfgExiste(true);
    }
    type LinhaEquipe = {
      perfil_id: string;
      whatsapp: string | null;
      receber_alertas: boolean;
      alerta_limite: number | null;
      alerta_intervalo_min: number | null;
      horario_dias: number[] | null;
      horario_inicio: string | null;
      horario_fim: string | null;
      aviso_demora_ativo: boolean | null;
      aviso_demora_min: number | null;
      aviso_demora_texto: string | null;
    };
    const mapa = new Map(((eq.data || []) as LinhaEquipe[]).map((e) => [e.perfil_id, e]));
    const eu = profile?.id ? mapa.get(profile.id) : undefined;
    setMinha({
      whatsapp: eu?.whatsapp || '',
      receber_alertas: eu?.receber_alertas ?? true,
      alerta_limite: eu?.alerta_limite ?? null,
      alerta_intervalo_min: eu?.alerta_intervalo_min ?? null,
      horario_proprio: !!eu?.horario_dias?.length,
      horario_dias: eu?.horario_dias?.length ? eu.horario_dias : [1, 2, 3, 4, 5],
      horario_inicio: (eu?.horario_inicio || '08:00').slice(0, 5),
      horario_fim: (eu?.horario_fim || '18:00').slice(0, 5),
      aviso_demora_ativo: eu?.aviso_demora_ativo ?? null,
      aviso_demora_min: eu?.aviso_demora_min ?? null,
      aviso_demora_texto: eu?.aviso_demora_texto || '',
    });
    setEquipe(
      ((pf.data || []) as { id: string; nome: string | null; email: string | null }[]).map((p) => ({
        ...p,
        whatsapp: mapa.get(p.id)?.whatsapp || '',
        receber_alertas: mapa.get(p.id)?.receber_alertas ?? false,
        salvo: mapa.has(p.id),
      }))
    );
    setArtigos((ar.data || []) as Artigo[]);
    setAlertas((al.data || []) as Alerta[]);
    const st = { atendendo: 0, finalizado: 0, devolvido: 0 };
    for (const x of (ch.data || []) as { ia_status: string; ia_ativa: boolean }[]) if (x.ia_status in st) st[x.ia_status as keyof typeof st]++;
    setStatsIA(st);
  }, [profile?.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvarMinha = async () => {
    if (!minha || !profile?.id) return;
    const fone = minha.whatsapp.replace(/\D/g, '');
    if (minha.receber_alertas && fone.length < 10) return toast.error('Informe o seu WhatsApp com DDD');
    setSalvandoMinha(true);
    const { error } = await supabase.from('ia_equipe').upsert(
      {
        perfil_id: profile.id,
        whatsapp: fone || null,
        receber_alertas: minha.receber_alertas,
        alerta_limite: minha.alerta_limite,
        alerta_intervalo_min: minha.alerta_intervalo_min,
        horario_dias: minha.horario_proprio ? minha.horario_dias : null,
        horario_inicio: minha.horario_proprio ? minha.horario_inicio : null,
        horario_fim: minha.horario_proprio ? minha.horario_fim : null,
        aviso_demora_ativo: minha.aviso_demora_ativo,
        aviso_demora_min: minha.aviso_demora_min,
        aviso_demora_texto: minha.aviso_demora_texto.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'perfil_id' }
    );
    setSalvandoMinha(false);
    if (error) return toast.error('Não foi possível salvar', { description: error.message });
    toast.success('Sua IA foi configurada');
    carregar();
  };

  const testarAlerta = async () => {
    setTestando(true);
    const { data, error } = await supabase.functions.invoke('ia-atendimento', { body: { acao: 'teste_alerta' } });
    setTestando(false);
    if (error || data?.error) return toast.error('Não foi possível enviar', { description: await erroDaFunction(error, data) });
    toast.success('Enviado para o seu WhatsApp', { description: `${data?.quantidade ?? 0} chamado(s) em aberto no resumo.` });
    carregar();
  };

  const salvarConfig = async () => {
    setSalvando(true);
    const { empresa_id: _e, ...dados } = cfg;
    const linha = { ...dados, modelo: cfg.modelo || null, updated_at: new Date().toISOString() };
    const { error } = cfgExiste
      ? await supabase.from('ia_config').update(linha).eq('empresa_id', cfg.empresa_id ?? profile?.empresa_id ?? '')
      : await supabase.from('ia_config').insert(linha);
    setSalvando(false);
    if (error) return toast.error('Não foi possível salvar', { description: error.message });
    toast.success('Regras da IA salvas', { description: 'Valem a partir da próxima rodada do plantão (até 2 minutos).' });
    carregar();
  };

  const salvarMembro = async (m: Membro) => {
    const fone = m.whatsapp.replace(/\D/g, '');
    if (m.receber_alertas && fone.length < 10) return toast.error('Informe o WhatsApp com DDD');
    const { error } = await supabase.from('ia_equipe').upsert({ perfil_id: m.id, whatsapp: fone || null, receber_alertas: m.receber_alertas, updated_at: new Date().toISOString() }, { onConflict: 'perfil_id' });
    if (error) return toast.error('Não foi possível salvar', { description: error.message });
    toast.success(`${m.nome || m.email}: salvo`);
    carregar();
  };

  const salvarArtigo = async () => {
    if (!editando?.titulo?.trim() || !editando?.conteudo?.trim()) return toast.error('Preencha o título e o conteúdo');
    const dados = {
      titulo: editando.titulo.trim(),
      conteudo: editando.conteudo.trim(),
      tags: (editando.tags || []).map((t) => t.trim()).filter(Boolean),
      ativo: editando.ativo ?? true,
      updated_at: new Date().toISOString(),
    };
    const { error } = editando.id ? await supabase.from('ia_conhecimento').update(dados).eq('id', editando.id) : await supabase.from('ia_conhecimento').insert(dados);
    if (error) return toast.error('Não foi possível salvar', { description: error.message });
    toast.success('Artigo salvo: a IA já passa a usar');
    setEditando(null);
    carregar();
  };

  const alternarArtigo = async (a: Artigo, ativo: boolean) => {
    const { error } = await supabase.from('ia_conhecimento').update({ ativo, updated_at: new Date().toISOString() }).eq('id', a.id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const excluirArtigo = async (a: Artigo) => {
    if (!window.confirm(`Excluir "${a.titulo}" da base?`)) return;
    const { error } = await supabase.from('ia_conhecimento').delete().eq('id', a.id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const artigosFiltrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return artigos.filter((a) => !t || `${a.titulo} ${a.conteudo} ${a.tags.join(' ')}`.toLowerCase().includes(t));
  }, [artigos, busca]);

  const nomeDe = (id: string | null) => equipe.find((m) => m.id === id)?.nome || '—';
  const set = <K extends keyof ConfigIA>(k: K, v: ConfigIA[K]) => setCfg((c) => ({ ...c, [k]: v }));
  const ed = !isAdmin;

  if (!tabelaOk) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 py-10 text-center">
        <Zap className="mx-auto h-10 w-10 text-primary" />
        <h1 className="text-2xl font-bold">Assistente IA</h1>
        <p className="text-muted-foreground">
          O painel ainda não está ativo no banco. Rode no SQL Editor a migration <code className="rounded bg-muted px-1">20261007230000_ia_painel.sql</code> e recarregue.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-lg text-white">🤖</span> Assistente IA
          </h1>
          <p className="text-sm text-muted-foreground">Regras do plantão, alertas para a equipe e o que a IA sabe para ajudar no suporte.</p>
        </div>
        <div className="flex gap-2 text-xs">
          <Badge variant="secondary">Atendendo agora: {statsIA.atendendo}</Badge>
          <Badge variant="secondary">Resolvidos pela IA no mês: {statsIA.finalizado}</Badge>
          <Badge variant="secondary">Devolvidos à equipe: {statsIA.devolvido}</Badge>
        </div>
      </div>

      <Tabs defaultValue="minha">
        <TabsList>
          <TabsTrigger value="minha">Minha IA</TabsTrigger>
          <TabsTrigger value="regras">Regras da empresa</TabsTrigger>
          {isAdmin && <TabsTrigger value="equipe">Equipe</TabsTrigger>}
          <TabsTrigger value="base">Base de conhecimento ({artigos.filter((a) => a.ativo).length})</TabsTrigger>
          <TabsTrigger value="atividade">Atividade</TabsTrigger>
        </TabsList>

        {/* --------------------------------------------------------- MINHA IA */}
        <TabsContent value="minha" className="mt-4 space-y-4">
          {minha && (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <Bloco
                  titulo="📲 Meus lembretes no WhatsApp"
                  descricao="Quando eu tiver muitos chamados em aberto, a IA me manda no WhatsApp a lista com o que cada cliente quer."
                  ativo={minha.receber_alertas}
                  onAtivo={(v) => setMinha({ ...minha, receber_alertas: v })}
                  podeEditar
                >
                  <div className="space-y-1.5">
                    <Label className="text-xs">Meu WhatsApp</Label>
                    <Input value={minha.whatsapp} onChange={(e) => setMinha({ ...minha, whatsapp: e.target.value })} placeholder="(98) 9XXXX-XXXX" className="w-56" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Me avisar a partir de</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={200}
                          value={minha.alerta_limite ?? ''}
                          placeholder={String(cfg.alerta_fila_limite)}
                          onChange={(e) => setMinha({ ...minha, alerta_limite: e.target.value ? Math.max(1, Number(e.target.value)) : null })}
                          className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">chamados</span>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">No máximo 1 lembrete a cada</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={10}
                          max={1440}
                          value={minha.alerta_intervalo_min ?? ''}
                          placeholder={String(cfg.alerta_intervalo_min)}
                          onChange={(e) => setMinha({ ...minha, alerta_intervalo_min: e.target.value ? Math.max(10, Number(e.target.value)) : null })}
                          className="w-24"
                        />
                        <span className="text-sm text-muted-foreground">minutos</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">Em branco = regra da empresa ({cfg.alerta_fila_limite} chamados, a cada {cfg.alerta_intervalo_min} min).</p>
                  <Button variant="outline" size="sm" className="gap-2" onClick={testarAlerta} disabled={testando}>
                    {testando ? <Loader2 className="h-4 w-4 animate-spin" /> : '📲'} Mandar meu resumo agora (teste)
                  </Button>
                </Bloco>

                <Bloco
                  titulo="⏰ Aviso de demora nos meus chamados"
                  descricao="Se alguém esperar resposta minha por muito tempo, a IA avisa com educação que eu já respondo."
                  podeEditar
                >
                  <div className="flex flex-wrap gap-2">
                    {[
                      { v: null, r: 'Seguir a empresa' },
                      { v: true, r: 'Ligado' },
                      { v: false, r: 'Desligado' },
                    ].map((o) => (
                      <Button key={String(o.v)} size="sm" type="button" variant={minha.aviso_demora_ativo === o.v ? 'default' : 'outline'} onClick={() => setMinha({ ...minha, aviso_demora_ativo: o.v })}>
                        {o.r}
                      </Button>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Avisar depois de</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        value={minha.aviso_demora_min ?? ''}
                        placeholder={String(cfg.aviso_demora_min)}
                        onChange={(e) => setMinha({ ...minha, aviso_demora_min: e.target.value ? Math.max(1, Number(e.target.value)) : null })}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">minutos sem resposta</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Minha mensagem ({'{nome}'} = quem chamou, {'{atendente}'} = eu)</Label>
                    <Textarea rows={3} value={minha.aviso_demora_texto} placeholder={cfg.aviso_demora_texto} onChange={(e) => setMinha({ ...minha, aviso_demora_texto: e.target.value })} />
                  </div>
                </Bloco>

                <Bloco
                  titulo="🕗 Meu horário"
                  descricao="Fora deste horário a IA não me manda lembretes nem avisa de demora nos meus chamados."
                  ativo={minha.horario_proprio}
                  onAtivo={(v) => setMinha({ ...minha, horario_proprio: v })}
                  podeEditar
                >
                  {minha.horario_proprio ? (
                    <>
                      <div className="flex flex-wrap gap-1.5">
                        {DIAS.map((d, i) => (
                          <Button
                            key={d}
                            type="button"
                            size="sm"
                            variant={minha.horario_dias.includes(i) ? 'default' : 'outline'}
                            onClick={() =>
                              setMinha({ ...minha, horario_dias: minha.horario_dias.includes(i) ? minha.horario_dias.filter((x) => x !== i) : [...minha.horario_dias, i].sort() })
                            }
                          >
                            {d}
                          </Button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input type="time" value={minha.horario_inicio} onChange={(e) => setMinha({ ...minha, horario_inicio: e.target.value || '08:00' })} className="w-32" />
                        <span className="text-sm text-muted-foreground">até</span>
                        <Input type="time" value={minha.horario_fim} onChange={(e) => setMinha({ ...minha, horario_fim: e.target.value || '18:00' })} className="w-32" />
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Seguindo o horário da empresa: {cfg.horario_dias.map((d) => DIAS[d]).join(', ')}, das {cfg.horario_inicio} às {cfg.horario_fim}.
                    </p>
                  )}
                </Bloco>
              </div>
              <div className="flex justify-end">
                <Button onClick={salvarMinha} disabled={salvandoMinha} className="gap-2">
                  {salvandoMinha ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar minha IA
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------ REGRAS */}
        <TabsContent value="regras" className="mt-4 space-y-4">
          {ed && <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">Só administradores alteram as regras.</p>}
          <div className="grid gap-4 lg:grid-cols-2">
            <Bloco
              titulo="📋 Alerta de fila no WhatsApp da equipe"
              descricao="Quando um colaborador fica com muitos chamados em aberto, a IA manda no WhatsApp pessoal dele a lista com um resumo de cada um."
              ativo={cfg.alerta_fila_ativo}
              onAtivo={(v) => set('alerta_fila_ativo', v)}
              podeEditar={!ed}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Numero rotulo="Avisar a partir de" valor={cfg.alerta_fila_limite} onChange={(n) => set('alerta_fila_limite', n)} sufixo="chamados abertos" max={200} disabled={ed} />
                <Numero rotulo="No máximo 1 alerta a cada" valor={cfg.alerta_intervalo_min} onChange={(n) => set('alerta_intervalo_min', n)} sufixo="minutos" min={10} disabled={ed} />
              </div>
              <p className="text-[11px] text-muted-foreground">Antes do intervalo, só manda de novo se a fila crescer bastante.</p>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-sm">Chamados de WhatsApp sem responsável contam para todos que recebem alertas</span>
                <Switch checked={cfg.alerta_fila_geral} onCheckedChange={(v) => set('alerta_fila_geral', v)} disabled={ed} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Canal do ZapContábil que envia os alertas internos</Label>
                <SeletorCanal valor={cfg.alerta_conexao_id} onChange={(id) => set('alerta_conexao_id', id)} />
              </div>
              <p className="text-[11px] text-muted-foreground">Quem recebe: aba Equipe (WhatsApp de cada um).</p>
            </Bloco>

            <Bloco
              titulo="⏰ Aviso de demora ao cliente"
              descricao="Se a pessoa estiver esperando resposta há mais tempo que o limite, a IA manda uma mensagem educada pedindo para aguardar. Uma vez por espera."
              ativo={cfg.aviso_demora_ativo}
              onAtivo={(v) => set('aviso_demora_ativo', v)}
              podeEditar={!ed}
            >
              <Numero rotulo="Avisar depois de" valor={cfg.aviso_demora_min} onChange={(n) => set('aviso_demora_min', n)} sufixo="minutos sem resposta" disabled={ed} />
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={cfg.aviso_demora_slack} onCheckedChange={(v) => set('aviso_demora_slack', v)} disabled={ed} /> Slack
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={cfg.aviso_demora_whatsapp} onCheckedChange={(v) => set('aviso_demora_whatsapp', v)} disabled={ed} /> WhatsApp
                </label>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Mensagem ({'{nome}'} = quem chamou, {'{atendente}'} = responsável)</Label>
                <Textarea rows={3} value={cfg.aviso_demora_texto} onChange={(e) => set('aviso_demora_texto', e.target.value)} disabled={ed || cfg.plantao_ia_ajuda} />
              </div>
              <div className="flex items-start justify-between gap-3 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/30">
                <span className="text-sm">
                  <strong>A IA já tenta ajudar</strong>
                  <span className="block text-[11px] text-muted-foreground">
                    Em vez da mensagem fixa, a IA avisa da espera e tenta resolver usando a base de conhecimento. Se não souber, deixa para a equipe.
                  </span>
                </span>
                <Switch checked={cfg.plantao_ia_ajuda} onCheckedChange={(v) => set('plantao_ia_ajuda', v)} disabled={ed} />
              </div>
            </Bloco>

            <Bloco titulo="🕗 Horário do plantão" descricao="Alertas e avisos só acontecem neste horário (Brasília)." podeEditar={!ed}>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map((d, i) => (
                  <Button
                    key={d}
                    type="button"
                    size="sm"
                    disabled={ed}
                    variant={cfg.horario_dias.includes(i) ? 'default' : 'outline'}
                    onClick={() => set('horario_dias', cfg.horario_dias.includes(i) ? cfg.horario_dias.filter((x) => x !== i) : [...cfg.horario_dias, i].sort())}
                  >
                    {d}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <Input type="time" value={cfg.horario_inicio} onChange={(e) => set('horario_inicio', e.target.value || '08:00')} className="w-32" disabled={ed} />
                <span className="text-sm text-muted-foreground">até</span>
                <Input type="time" value={cfg.horario_fim} onChange={(e) => set('horario_fim', e.target.value || '18:00')} className="w-32" disabled={ed} />
              </div>
            </Bloco>

            <Bloco titulo="🧠 Inteligência" descricao="De onde a IA tira o conhecimento e qual modelo do Groq ela usa." podeEditar={!ed}>
              <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
                <span className="text-sm">
                  Usar também os posts <strong>resolvidos</strong> do Fórum
                </span>
                <Switch checked={cfg.usar_forum} onCheckedChange={(v) => set('usar_forum', v)} disabled={ed} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Modelo</Label>
                <Select value={cfg.modelo || 'padrao'} onValueChange={(v) => set('modelo', v === 'padrao' ? null : v)} disabled={ed}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELOS.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </Bloco>
          </div>
          {!ed && (
            <div className="flex justify-end">
              <Button onClick={salvarConfig} disabled={salvando} className="gap-2">
                {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar regras
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ------------------------------------------------------------ EQUIPE */}
        <TabsContent value="equipe" className="mt-4">
          <div className="rounded-xl border">
            <p className="border-b px-4 py-3 text-sm text-muted-foreground">
              WhatsApp pessoal de quem recebe o alerta de fila. Cada um pode cadastrar o próprio; o administrador cadastra todos.
            </p>
            {equipe.map((m, i) => {
              const podeMexer = isAdmin || m.id === profile?.id;
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0">
                  <div className="min-w-[180px] flex-1">
                    <p className="font-medium">{m.nome || m.email}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  <Input
                    value={m.whatsapp}
                    placeholder="(98) 9XXXX-XXXX"
                    disabled={!podeMexer}
                    onChange={(e) => setEquipe((l) => l.map((x, k) => (k === i ? { ...x, whatsapp: e.target.value } : x)))}
                    className="w-48"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={m.receber_alertas}
                      disabled={!podeMexer}
                      onCheckedChange={(v) => setEquipe((l) => l.map((x, k) => (k === i ? { ...x, receber_alertas: v } : x)))}
                    />
                    Recebe alertas
                  </label>
                  <Button size="sm" variant="outline" disabled={!podeMexer} onClick={() => salvarMembro(m)}>
                    Salvar
                  </Button>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* -------------------------------------------------------------- BASE */}
        <TabsContent value="base" className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na base..." className="pl-9" />
            </div>
            <Button className="gap-2" onClick={() => setEditando({ titulo: '', conteudo: '', tags: [], ativo: true })}>
              <Plus className="h-4 w-4" /> Novo artigo
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            A IA procura aqui os artigos mais parecidos com a dúvida do cliente{cfg.usar_forum ? ' (e também nos posts resolvidos do Fórum)' : ''}. Escreva como um passo a passo:
            o problema, onde clicar e o que fazer se der erro.
          </p>
          {artigosFiltrados.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum artigo ainda. Comece pelas dúvidas que mais chegam (ex.: "Cadastrar usuário no Onvio", "NF-e rejeição 539").
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {artigosFiltrados.map((a) => (
                <div key={a.id} className={cn('rounded-xl border p-4', !a.ativo && 'opacity-60')}>
                  <div className="flex items-start gap-2">
                    <p className="flex-1 font-semibold">{a.titulo}</p>
                    <Switch checked={a.ativo} onCheckedChange={(v) => alternarArtigo(a, v)} title={a.ativo ? 'Desativar' : 'Ativar'} />
                  </div>
                  <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">{a.conteudo}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {a.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-[10px]">
                        {t}
                      </Badge>
                    ))}
                    <span className="ml-auto flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditando(a)} title="Editar">
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      {isAdmin && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => excluirArtigo(a)} title="Excluir">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* --------------------------------------------------------- ATIVIDADE */}
        <TabsContent value="atividade" className="mt-4">
          <div className="rounded-xl border">
            {alertas.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nada enviado pelo plantão ainda.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Quando</th>
                    <th className="px-4 py-2 text-left font-medium">O quê</th>
                    <th className="px-4 py-2 text-left font-medium">Para</th>
                    <th className="px-4 py-2 text-left font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {alertas.map((a) => (
                    <tr key={a.id} className="border-t align-top">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums">{format(parseISO(a.created_at), "dd/MM 'às' HH:mm", { locale: ptBR })}</td>
                      <td className="px-4 py-2">
                        {a.tipo === 'fila' ? `📋 Alerta de fila (${a.quantidade} chamados)` : `⏰ ${a.mensagem || 'Aviso de demora'}`}
                      </td>
                      <td className="px-4 py-2">{a.tipo === 'fila' ? nomeDe(a.perfil_id) : a.destino}</td>
                      <td className="px-4 py-2">
                        <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', a.status === 'enviado' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')}>
                          {a.status === 'enviado' ? 'Enviado' : 'Erro'}
                        </span>
                        {a.erro && <span className="mt-1 block max-w-[320px] text-[11px] text-muted-foreground">{a.erro}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando?.id ? 'Editar artigo' : 'Novo artigo da base'}</DialogTitle>
            <DialogDescription>Escreva como você explicaria para alguém da equipe. A IA usa este texto para responder; ela não inventa além do que está aqui.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título (a dúvida)</Label>
              <Input value={editando?.titulo || ''} onChange={(e) => setEditando((x) => ({ ...x, titulo: e.target.value }))} placeholder="Ex.: Como cadastrar um usuário novo no Onvio" />
            </div>
            <div className="space-y-1.5">
              <Label>Resposta / passo a passo</Label>
              <Textarea
                rows={12}
                value={editando?.conteudo || ''}
                onChange={(e) => setEditando((x) => ({ ...x, conteudo: e.target.value }))}
                placeholder={'1. Entre no Onvio com um usuário administrador.\n2. Vá em Configurações → Usuários → Convidar.\n3. Informe o e-mail do funcionário e as permissões.\n4. Ele recebe um e-mail para criar a senha.\n\nSe der erro de permissão: o usuário logado não é administrador; peça para o administrador do escritório fazer.'}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Palavras-chave (separadas por vírgula)</Label>
              <Input
                value={(editando?.tags || []).join(', ')}
                onChange={(e) => setEditando((x) => ({ ...x, tags: e.target.value.split(',') }))}
                placeholder="onvio, usuário, acesso, convite"
              />
              <p className="text-[11px] text-muted-foreground">Ajudam a IA a achar este artigo quando o cliente usa outras palavras.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
            <Button onClick={salvarArtigo}>Salvar artigo</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
