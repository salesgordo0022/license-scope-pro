import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronUp, ChevronRight, Plus, Trash2, X } from '@/components/icons';
import { cn } from '@/lib/utils';
import { ETAPAS_PADRAO, type EtapaModelo } from '@/lib/implantacaoPadrao';
import { etapasEscolhidas, validarNomeEtapa, type SelecaoEtapa } from '@/lib/selecaoEtapas';

/** Formulário de etapa (nome, itens um por linha, resultado esperado). */
export function FormEtapa({
  inicial,
  nomesExistentes,
  podeSalvarModelo,
  mostrarSalvarModelo = true,
  rotuloBotao = 'Adicionar etapa',
  onSalvar,
  onCancelar,
}: {
  inicial?: EtapaModelo;
  nomesExistentes: string[];
  podeSalvarModelo: boolean;
  mostrarSalvarModelo?: boolean;
  rotuloBotao?: string;
  onSalvar: (etapa: EtapaModelo, salvarComoModelo: boolean) => void | Promise<void>;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial?.nome || '');
  const [itensTexto, setItensTexto] = useState((inicial?.itens || []).join('\n'));
  const [resultado, setResultado] = useState(inicial?.resultado || '');
  const [salvarModelo, setSalvarModelo] = useState(podeSalvarModelo);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const outros = nomesExistentes.filter((n) => n.trim().toLowerCase() !== (inicial?.nome || '').trim().toLowerCase());
    const e = validarNomeEtapa(nome, outros);
    const itens = itensTexto
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (e) return setErro(e);
    if (itens.length === 0) return setErro('Coloque pelo menos um item (um por linha)');
    setSalvando(true);
    try {
      await onSalvar({ ...inicial, nome: nome.trim(), titulo: nome.trim(), itens, resultado: resultado.trim() || null }, mostrarSalvarModelo && salvarModelo);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
      <div className="grid gap-1.5">
        <Label className="text-xs">Nome da etapa *</Label>
        <Input value={nome} onChange={(e) => {
          setNome(e.target.value);
          setErro(null);
        }} placeholder="Ex.: Migração de dados, Configuração fiscal..." />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Itens (um por linha) *</Label>
        <Textarea
          value={itensTexto}
          onChange={(e) => {
            setItensTexto(e.target.value);
            setErro(null);
          }}
          rows={4}
          placeholder={'Exportar dados do sistema antigo.\nConferir saldos de estoque.\nValidar com o cliente.'}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Resultado esperado</Label>
        <Input value={resultado} onChange={(e) => setResultado(e.target.value)} placeholder="Ex.: Dados migrados e conferidos." />
      </div>
      {mostrarSalvarModelo && (
        <label className={cn('flex items-center gap-2 text-sm', !podeSalvarModelo && 'opacity-60')}>
          <Checkbox checked={salvarModelo && podeSalvarModelo} disabled={!podeSalvarModelo} onCheckedChange={(v) => setSalvarModelo(!!v)} />
          Salvar como modelo para as próximas implantações
        </label>
      )}
      {mostrarSalvarModelo && !podeSalvarModelo && (
        <p className="text-[11px] text-amber-700">Para salvar modelos é preciso aplicar a atualização do banco (etapas_implantacao). A etapa vale só para esta implantação.</p>
      )}
      {erro && <p className="text-xs font-medium text-destructive">{erro}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="button" size="sm" onClick={salvar} disabled={salvando}>
          {rotuloBotao}
        </Button>
      </div>
    </div>
  );
}

/**
 * Escolha das etapas na criação da implantação: marcar/desmarcar etapas e
 * itens, mudar a ordem e criar etapas novas na hora.
 */
export function SeletorEtapas({
  valor,
  onChange,
  podeSalvarModelo,
  onNovaEtapa,
}: {
  valor: SelecaoEtapa[];
  onChange: (v: SelecaoEtapa[]) => void;
  podeSalvarModelo: boolean;
  /** Chamado quando a etapa nova deve virar modelo; devolve o modelo salvo (com id) ou null. */
  onNovaEtapa: (etapa: EtapaModelo, salvarComoModelo: boolean) => Promise<EtapaModelo | null>;
}) {
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const [criando, setCriando] = useState(false);

  const atualizar = (chave: string, f: (s: SelecaoEtapa) => SelecaoEtapa) => onChange(valor.map((s) => (s.chave === chave ? f(s) : s)));
  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= valor.length) return;
    const nova = [...valor];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    onChange(nova);
  };

  const totalItens = etapasEscolhidas(valor).reduce((s, e) => s + e.itens.length, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Etapas da implantação</Label>
        <span className="text-xs text-muted-foreground">
          {valor.filter((s) => s.marcada).length} etapa(s) · {totalItens} passo(s)
        </span>
      </div>

      <div className="space-y-1.5">
        {valor.map((s, i) => {
          const marcados = s.itens.filter((x) => x.marcado).length;
          const aberta = abertas[s.chave];
          return (
            <div key={s.chave} className={cn('rounded-lg border', s.marcada ? 'border-primary/40 bg-card' : 'border-border bg-muted/30')}>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <Checkbox checked={s.marcada} onCheckedChange={(v) => atualizar(s.chave, (x) => ({ ...x, marcada: !!v }))} />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => setAbertas((a) => ({ ...a, [s.chave]: !a[s.chave] }))}
                >
                  {aberta ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  <span className={cn('truncate text-sm font-medium', !s.marcada && 'text-muted-foreground')}>{s.modelo.nome}</span>
                  <Badge variant="outline" className="h-4 shrink-0 px-1.5 text-[10px]">
                    {s.modelo.padrao ? 'Padrão' : s.avulsa ? 'Só nesta' : 'Personalizada'}
                  </Badge>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {marcados}/{s.itens.length}
                  </span>
                </button>
                <div className="flex shrink-0 items-center">
                  <button type="button" title="Subir" disabled={i === 0} onClick={() => mover(i, -1)} className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    title="Descer"
                    disabled={i === valor.length - 1}
                    onClick={() => mover(i, 1)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {s.avulsa && (
                    <button type="button" title="Remover" onClick={() => onChange(valor.filter((x) => x.chave !== s.chave))} className="rounded p-1 text-muted-foreground hover:bg-muted">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {aberta && (
                <div className="space-y-0.5 border-t px-3 py-2">
                  {s.itens.map((it, k) => (
                    <label key={k} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                      <Checkbox
                        checked={it.marcado}
                        onCheckedChange={(v) =>
                          atualizar(s.chave, (x) => ({ ...x, marcada: true, itens: x.itens.map((y, z) => (z === k ? { ...y, marcado: !!v } : y)) }))
                        }
                      />
                      <span className={cn(!it.marcado && 'text-muted-foreground line-through')}>{it.texto}</span>
                    </label>
                  ))}
                  {s.modelo.resultado && <p className="pt-1 text-[11px] italic text-muted-foreground">Resultado esperado: {s.modelo.resultado}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {criando ? (
        <FormEtapa
          nomesExistentes={valor.map((s) => s.modelo.nome)}
          podeSalvarModelo={podeSalvarModelo}
          onCancelar={() => setCriando(false)}
          onSalvar={async (etapa, salvarModelo) => {
            const salvo = salvarModelo ? await onNovaEtapa(etapa, true) : null;
            const modelo = salvo || etapa;
            onChange([
              ...valor,
              {
                chave: salvo?.id ? `c:${salvo.id}` : `a:${Date.now()}`,
                modelo,
                marcada: true,
                avulsa: !salvo,
                itens: modelo.itens.map((t) => ({ texto: t, marcado: true })),
              },
            ]);
            setCriando(false);
          }}
        />
      ) : (
        <Button type="button" variant="outline" size="sm" className="w-full gap-2 border-dashed" onClick={() => setCriando(true)}>
          <Plus className="h-4 w-4" />
          Criar nova etapa
        </Button>
      )}
    </div>
  );
}

/** Lista de etapas salvas, com edição e exclusão das personalizadas. */
export function GerenciadorEtapas({
  personalizadas,
  disponivel,
  onSalvar,
  onExcluir,
}: {
  personalizadas: EtapaModelo[];
  disponivel: boolean;
  onSalvar: (etapa: EtapaModelo) => Promise<void>;
  onExcluir: (etapa: EtapaModelo) => Promise<void>;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const nomes = [...ETAPAS_PADRAO, ...personalizadas].map((e) => e.nome);

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold">Etapas padrão (do modelo de documento)</p>
        <div className="space-y-1.5">
          {ETAPAS_PADRAO.map((e, i) => (
            <div key={e.nome} className="rounded-lg border bg-muted/30 px-3 py-2">
              <p className="text-sm font-medium">
                {i + 1}. {e.titulo}
                <Badge variant="outline" className="ml-2 h-4 px-1.5 text-[10px]">
                  Padrão
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground">{e.itens.join(' · ')}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">Etapas personalizadas</p>
          {disponivel && editando !== 'nova' && (
            <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setEditando('nova')}>
              <Plus className="h-4 w-4" /> Nova etapa
            </Button>
          )}
        </div>
        {!disponivel && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            O banco ainda não tem a tabela de etapas personalizadas. Aplique a atualização (migration <code>etapas_implantacao</code>) para salvar etapas. Enquanto
            isso, dá para criar etapas só para uma implantação.
          </p>
        )}
        {editando === 'nova' && (
          <FormEtapa
            nomesExistentes={nomes}
            podeSalvarModelo
            mostrarSalvarModelo={false}
            rotuloBotao="Salvar etapa"
            onCancelar={() => setEditando(null)}
            onSalvar={async (etapa) => {
              await onSalvar(etapa);
              setEditando(null);
            }}
          />
        )}
        <div className="mt-2 space-y-1.5">
          {disponivel && personalizadas.length === 0 && editando !== 'nova' && (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma etapa personalizada ainda.</p>
          )}
          {personalizadas.map((e) =>
            editando === e.id ? (
              <FormEtapa
                key={e.id}
                inicial={e}
                nomesExistentes={nomes}
                podeSalvarModelo
                mostrarSalvarModelo={false}
                rotuloBotao="Salvar alterações"
                onCancelar={() => setEditando(null)}
                onSalvar={async (etapa) => {
                  await onSalvar({ ...etapa, id: e.id });
                  setEditando(null);
                }}
              />
            ) : (
              <div key={e.id} className="flex items-start gap-2 rounded-lg border px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{e.nome}</p>
                  <p className="text-xs text-muted-foreground">{e.itens.join(' · ')}</p>
                  {e.resultado && <p className="text-[11px] italic text-muted-foreground">Resultado esperado: {e.resultado}</p>}
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(e.id!)}>
                  Editar
                </Button>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => onExcluir(e)} title="Excluir etapa">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            )
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">Mudar ou excluir uma etapa salva não altera implantações já criadas.</p>
      </div>
    </div>
  );
}
