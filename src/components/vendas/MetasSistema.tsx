import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Trash2, Target, Monitor, Edit, Loader2, Copy, TrendingUp } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PlanoMeta {
  plano_id: string | null;
  nome: string;
  quantidade: number;
  mensalidade: number;
  implantacao: number;
}

interface MetaSistema {
  id?: string;
  sistema: string;
  quantidade: number;
  planos: PlanoMeta[];
  observacoes: string | null;
}

interface Plano {
  id: string;
  nome: string;
  valor_mensalidade: number;
  valor_implantacao: number;
}

interface Realizado {
  vendas: number;
  valor: number;
}

const moeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
const primeiroDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const isoDia = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
const chave = (s: string) => s.trim().toUpperCase();

/** Previsão de receita de uma meta (preços congelados na própria meta). */
function previsao(planos: PlanoMeta[]) {
  const mensal = planos.reduce((s, p) => s + p.quantidade * (p.mensalidade || 0), 0);
  const implantacao = planos.reduce((s, p) => s + p.quantidade * (p.implantacao || 0), 0);
  return { mensal, implantacao, mes: mensal + implantacao, anual: mensal * 12 + implantacao };
}

/**
 * Metas mensais por sistema: quantas vendas de cada plano se quer fechar no
 * mês, a previsão de receita que isso gera e o realizado (vendas do funil
 * marcadas como "fechado" no mês, daquele sistema).
 */
export default function MetasSistema() {
  const { isAdmin } = useAuth();
  const [mes, setMes] = useState(() => primeiroDia(new Date()));
  const [sistemas, setSistemas] = useState<string[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [metas, setMetas] = useState<Record<string, MetaSistema>>({});
  const [realizado, setRealizado] = useState<Record<string, Realizado>>({});
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<MetaSistema | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [tabelaOk, setTabelaOk] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const inicio = mes;
    const fim = new Date(mes.getFullYear(), mes.getMonth() + 1, 1);
    const [si, pl, me, rv] = await Promise.all([
      supabase.from('sistemas').select('nome').eq('ativo', true).order('nome'),
      supabase.from('tabela_precos').select('id, nome, valor_mensalidade, valor_implantacao').eq('ativo', true).order('ordem'),
      supabase.from('metas_sistema').select('id, sistema, quantidade, planos, observacoes').eq('mes', isoDia(mes)),
      supabase
        .from('revendas')
        .select('sistema, valor_estimado, data_venda')
        .eq('status_venda', 'fechado')
        .gte('data_venda', isoDia(inicio))
        .lt('data_venda', isoDia(fim)),
    ]);
    if (me.error) {
      setTabelaOk(false);
      setCarregando(false);
      return;
    }
    setTabelaOk(true);
    const nomes = ((si.data as { nome: string }[]) || []).map((s) => s.nome.trim());
    setPlanos(((pl.data as Plano[]) || []).map((p) => ({ ...p, valor_mensalidade: Number(p.valor_mensalidade) || 0, valor_implantacao: Number(p.valor_implantacao) || 0 })));
    const mapa: Record<string, MetaSistema> = {};
    for (const m of (me.data || []) as unknown as MetaSistema[]) mapa[chave(m.sistema)] = { ...m, planos: Array.isArray(m.planos) ? m.planos : [] };
    // Sistemas com meta mas desativados continuam aparecendo.
    const todos = Array.from(new Set([...nomes, ...Object.values(mapa).map((m) => m.sistema.trim())]));
    setSistemas(todos);
    setMetas(mapa);
    const real: Record<string, Realizado> = {};
    for (const r of (rv.data || []) as { sistema: string | null; valor_estimado: number | null }[]) {
      const k = chave(r.sistema || 'Não definido');
      real[k] = real[k] || { vendas: 0, valor: 0 };
      real[k].vendas++;
      real[k].valor += Number(r.valor_estimado) || 0;
    }
    setRealizado(real);
    setCarregando(false);
  }, [mes]);

  useEffect(() => {
    carregar();
    setEditando(null);
  }, [carregar]);

  const abrirEdicao = (sistema: string) => {
    const atual = metas[chave(sistema)];
    setRascunho(
      atual
        ? { ...atual, planos: atual.planos.map((p) => ({ ...p })) }
        : { sistema, quantidade: 0, planos: [], observacoes: null }
    );
    setEditando(chave(sistema));
  };

  const alterarPlano = (i: number, campos: Partial<PlanoMeta>) =>
    setRascunho((r) => (r ? { ...r, planos: r.planos.map((p, k) => (k === i ? { ...p, ...campos } : p)) } : r));

  const escolherPlano = (i: number, planoId: string) => {
    const p = planos.find((x) => x.id === planoId);
    if (p) alterarPlano(i, { plano_id: p.id, nome: p.nome, mensalidade: p.valor_mensalidade, implantacao: p.valor_implantacao });
  };

  const salvar = async () => {
    if (!rascunho) return;
    const planosValidos = rascunho.planos.filter((p) => p.quantidade > 0 && p.nome);
    setSalvando(true);
    const { data: perfil } = await supabase.from('usuario_perfil').select('empresa_id').maybeSingle();
    const { error } = await supabase.from('metas_sistema').upsert(
      {
        empresa_id: perfil?.empresa_id ?? null,
        mes: isoDia(mes),
        sistema: rascunho.sistema.trim(),
        quantidade: planosValidos.reduce((s, p) => s + p.quantidade, 0),
        planos: planosValidos as unknown as never,
        observacoes: rascunho.observacoes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'empresa_id,mes,sistema' }
    );
    setSalvando(false);
    if (error) {
      toast.error('Não foi possível salvar a meta', { description: error.message });
      return;
    }
    toast.success(`Meta de ${rascunho.sistema} salva`);
    setEditando(null);
    carregar();
  };

  const excluir = async (m: MetaSistema) => {
    if (!m.id || !confirm(`Excluir a meta de ${m.sistema} deste mês?`)) return;
    const { error } = await supabase.from('metas_sistema').delete().eq('id', m.id);
    if (error) toast.error('Não foi possível excluir', { description: error.message });
    else carregar();
  };

  /** Copia as metas do mês anterior para este (só sistemas ainda sem meta). */
  const copiarMesAnterior = async () => {
    const anterior = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
    const { data } = await supabase.from('metas_sistema').select('sistema, quantidade, planos, observacoes').eq('mes', isoDia(anterior));
    const novas = ((data || []) as unknown as MetaSistema[]).filter((m) => !metas[chave(m.sistema)]);
    if (!novas.length) {
      toast.info('Nada para copiar', { description: 'O mês anterior não tem metas, ou este mês já tem todas.' });
      return;
    }
    const { data: perfil } = await supabase.from('usuario_perfil').select('empresa_id').maybeSingle();
    const { error } = await supabase.from('metas_sistema').insert(
      novas.map((m) => ({ empresa_id: perfil?.empresa_id ?? null, mes: isoDia(mes), sistema: m.sistema, quantidade: m.quantidade, planos: m.planos as unknown as never, observacoes: m.observacoes }))
    );
    if (error) toast.error('Não foi possível copiar', { description: error.message });
    else {
      toast.success(`${novas.length} meta(s) copiada(s) do mês anterior`);
      carregar();
    }
  };

  const totais = useMemo(() => {
    const lista = Object.values(metas);
    const prev = previsao(lista.flatMap((m) => m.planos));
    const metaQtd = lista.reduce((s, m) => s + m.quantidade, 0);
    const vendas = sistemas.reduce((s, n) => s + (realizado[chave(n)]?.vendas || 0), 0);
    const valor = sistemas.reduce((s, n) => s + (realizado[chave(n)]?.valor || 0), 0);
    return { ...prev, metaQtd, vendas, valor };
  }, [metas, realizado, sistemas]);

  if (!tabelaOk) {
    return (
      <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
        As metas por sistema ainda não estão ativas no banco. Rode no SQL Editor do Supabase o arquivo{' '}
        <code className="rounded bg-muted px-1">supabase/migrations/20261007120000_prospectos_e_metas_sistema.sql</code>.
      </div>
    );
  }

  const nomeMes = format(mes, "MMMM 'de' yyyy", { locale: ptBR });
  const pct = (a: number, b: number) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Target className="h-5 w-5 text-primary" /> Metas por sistema
          </h2>
          <p className="text-sm text-muted-foreground">Quantas vendas de cada plano no mês e a receita prevista</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button variant="outline" size="sm" className="gap-2" onClick={copiarMesAnterior}>
              <Copy className="h-4 w-4" /> Copiar do mês anterior
            </Button>
          )}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[150px] text-center text-sm font-semibold capitalize">{nomeMes}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Totais do mês */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Vendas fechadas / meta</p>
          <p className="text-2xl font-bold">
            {totais.vendas} <span className="text-base font-medium text-muted-foreground">/ {totais.metaQtd}</span>
          </p>
          <Progress value={pct(totais.vendas, totais.metaQtd)} className="mt-2 h-2" />
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Mensalidade nova prevista</p>
          <p className="text-2xl font-bold text-primary">{moeda(totais.mensal)}</p>
          <p className="text-[11px] text-muted-foreground">receita recorrente que entra por mês</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Implantação prevista</p>
          <p className="text-2xl font-bold">{moeda(totais.implantacao)}</p>
          <p className="text-[11px] text-muted-foreground">receita do mês: {moeda(totais.mes)}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" /> Previsão em 12 meses
          </p>
          <p className="text-2xl font-bold text-emerald-600">{moeda(totais.anual)}</p>
          <p className="text-[11px] text-muted-foreground">mensalidades × 12 + implantação</p>
        </div>
      </div>

      {carregando ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sistemas.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Cadastre os sistemas na aba Sistemas para definir metas.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sistemas.map((s) => {
            const k = chave(s);
            const meta = metas[k];
            const real = realizado[k] || { vendas: 0, valor: 0 };
            const prev = previsao(meta?.planos || []);
            const emEdicao = editando === k && rascunho;
            const prevRascunho = emEdicao ? previsao(rascunho.planos) : prev;
            return (
              <div key={k} className={cn('rounded-2xl border bg-card p-4', emEdicao && 'border-primary/50 ring-1 ring-primary/20')}>
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Monitor className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{s}</p>
                    <p className="text-xs text-muted-foreground">
                      {meta ? `Meta: ${meta.quantidade} venda(s)` : 'Sem meta neste mês'} · Fechadas: {real.vendas}
                    </p>
                  </div>
                  {isAdmin && !emEdicao && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => abrirEdicao(s)}>
                        <Edit className="h-3.5 w-3.5" /> {meta ? 'Editar' : 'Definir meta'}
                      </Button>
                      {meta && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => excluir(meta)} title="Excluir meta">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {meta && !emEdicao && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-muted-foreground">Progresso</span>
                      <span className="font-semibold">
                        {real.vendas}/{meta.quantidade} · {pct(real.vendas, meta.quantidade)}%
                      </span>
                    </div>
                    <Progress value={pct(real.vendas, meta.quantidade)} className="h-2" />
                  </div>
                )}

                {!emEdicao && meta && (
                  <ul className="mt-3 space-y-1 text-sm">
                    {meta.planos.map((p, i) => (
                      <li key={i} className="flex justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5">
                        <span>
                          <b>{p.quantidade}×</b> {p.nome}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {moeda(p.mensalidade)}/mês · impl. {moeda(p.implantacao)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {emEdicao && (
                  <div className="mt-3 space-y-2">
                    {rascunho.planos.map((p, i) => (
                      <div key={i} className="grid grid-cols-[1fr_70px_32px] gap-2 rounded-lg border p-2 sm:grid-cols-[1fr_70px_100px_100px_32px]">
                        <Select value={p.plano_id || ''} onValueChange={(v) => escolherPlano(i, v)}>
                          <SelectTrigger className="h-9 text-xs">
                            <SelectValue placeholder="Plano" />
                          </SelectTrigger>
                          <SelectContent>
                            {planos.map((pl) => (
                              <SelectItem key={pl.id} value={pl.id}>
                                {pl.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input type="number" min={0} className="h-9 text-xs" title="Quantidade" value={p.quantidade} onChange={(e) => alterarPlano(i, { quantidade: Math.max(0, parseInt(e.target.value) || 0) })} />
                        <Input type="number" min={0} step="0.01" className="hidden h-9 text-xs sm:block" title="Mensalidade" value={p.mensalidade} onChange={(e) => alterarPlano(i, { mensalidade: parseFloat(e.target.value) || 0 })} />
                        <Input type="number" min={0} step="0.01" className="hidden h-9 text-xs sm:block" title="Implantação" value={p.implantacao} onChange={(e) => alterarPlano(i, { implantacao: parseFloat(e.target.value) || 0 })} />
                        <Button type="button" size="icon" variant="ghost" className="h-9 w-8" onClick={() => setRascunho((r) => (r ? { ...r, planos: r.planos.filter((_, k2) => k2 !== i) } : r))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <p className="hidden px-1 text-[10px] text-muted-foreground sm:block">Plano · quantidade · mensalidade · implantação (preços vêm de Planos e Preços; dá para ajustar)</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="w-full gap-1.5 border-dashed"
                      onClick={() => setRascunho((r) => (r ? { ...r, planos: [...r.planos, { plano_id: null, nome: '', quantidade: 1, mensalidade: 0, implantacao: 0 }] } : r))}
                    >
                      <Plus className="h-4 w-4" /> Adicionar plano
                    </Button>
                  </div>
                )}

                {(meta || emEdicao) && (
                  <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-primary/5 p-3 text-center">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Mensal</p>
                      <p className="text-sm font-bold text-primary">{moeda(prevRascunho.mensal)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">Implantação</p>
                      <p className="text-sm font-bold">{moeda(prevRascunho.implantacao)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground">12 meses</p>
                      <p className="text-sm font-bold text-emerald-600">{moeda(prevRascunho.anual)}</p>
                    </div>
                  </div>
                )}

                {emEdicao && (
                  <div className="mt-3 flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditando(null)}>
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={salvar} disabled={salvando}>
                      {salvando ? 'Salvando...' : `Salvar meta (${rascunho.planos.reduce((sm, p) => sm + (p.quantidade || 0), 0)} vendas)`}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Realizado = vendas do funil marcadas como Fechado neste mês, com o sistema escolhido na venda.
      </p>
    </div>
  );
}
