import { useEffect, useState } from 'react';
import { Plus, Trash2, StickyNote, Calculator, Save } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type Anotacao = {
  id: string;
  data: string;
  autor?: string;
  texto: string;
};

export type ValoresDetalhados = {
  valor_produto?: number;
  valor_implantacao?: number;
  valor_servicos?: number;
  valor_mensalidade?: number;
  desconto?: number;
  custo?: number;
  forma_pagamento?: string;
  parcelas?: number;
  observacao_financeira?: string;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  revendaId: string | null;
  clienteNome?: string;
  onSaved?: () => void;
};

const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n || 0);

export default function DetalhesVendaDialog({ open, onOpenChange, revendaId, clienteNome, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [anotacoes, setAnotacoes] = useState<Anotacao[]>([]);
  const [novaAnotacao, setNovaAnotacao] = useState('');
  const [valores, setValores] = useState<ValoresDetalhados>({});
  const [autorNome, setAutorNome] = useState<string>('');

  useEffect(() => {
    if (!open || !revendaId) return;
    (async () => {
      setLoading(true);
      try {
        const { data: rv, error } = await supabase
          .from('revendas')
          .select('anotacoes,valores_detalhados')
          .eq('id', revendaId)
          .maybeSingle();
        if (error) throw error;
        const r = rv as any;
        setAnotacoes(Array.isArray(r?.anotacoes) ? r.anotacoes : []);
        setValores((r?.valores_detalhados && typeof r.valores_detalhados === 'object') ? r.valores_detalhados : {});
        const { data: auth } = await supabase.auth.getUser();
        setAutorNome(auth?.user?.email || '');
      } catch (e: any) {
        toast.error(e.message || 'Erro ao carregar detalhes');
      } finally {
        setLoading(false);
      }
    })();
  }, [open, revendaId]);

  const adicionarAnotacao = () => {
    const t = novaAnotacao.trim();
    if (!t) return;
    setAnotacoes(prev => [
      { id: crypto.randomUUID(), data: new Date().toISOString(), autor: autorNome, texto: t },
      ...prev,
    ]);
    setNovaAnotacao('');
  };

  const removerAnotacao = (id: string) => {
    setAnotacoes(prev => prev.filter(a => a.id !== id));
  };

  const total = (Number(valores.valor_produto) || 0)
    + (Number(valores.valor_implantacao) || 0)
    + (Number(valores.valor_servicos) || 0)
    - (Number(valores.desconto) || 0);
  const margem = total - (Number(valores.custo) || 0);

  const salvar = async () => {
    if (!revendaId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('revendas')
        .update({ anotacoes: anotacoes as any, valores_detalhados: valores as any })
        .eq('id', revendaId);
      if (error) throw error;
      toast.success('Salvo!');
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const setNum = (k: keyof ValoresDetalhados) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValores(v => ({ ...v, [k]: e.target.value === '' ? undefined : parseFloat(e.target.value) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Detalhes da oportunidade</DialogTitle>
          <DialogDescription>{clienteNome || 'Cliente'}</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex justify-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : (
          <Tabs defaultValue="anotacoes" className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="self-start">
              <TabsTrigger value="anotacoes" className="gap-2">
                <StickyNote className="h-4 w-4" /> Anotações
                {anotacoes.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">{anotacoes.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="valores" className="gap-2">
                <Calculator className="h-4 w-4" /> Valores detalhados
              </TabsTrigger>
            </TabsList>

            <TabsContent value="anotacoes" className="flex-1 overflow-hidden flex flex-col mt-4">
              <div className="space-y-2">
                <Label>Nova anotação</Label>
                <Textarea
                  value={novaAnotacao}
                  onChange={e => setNovaAnotacao(e.target.value)}
                  placeholder="Reunião, ligação, follow-up, contexto..."
                  rows={3}
                  onKeyDown={e => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      adicionarAnotacao();
                    }
                  }}
                />
                <div className="flex justify-end">
                  <Button size="sm" type="button" onClick={adicionarAnotacao} disabled={!novaAnotacao.trim()}>
                    <Plus className="h-4 w-4 mr-1" /> Adicionar
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex-1 overflow-hidden">
                <ScrollArea className="h-[280px] pr-3">
                  {anotacoes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Nenhuma anotação ainda.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {anotacoes.map(a => (
                        <li key={a.id} className="group rounded-lg border border-border/60 p-3 bg-muted/20">
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-xs text-muted-foreground">
                              {format(new Date(a.data), "dd 'de' MMM yyyy 'às' HH:mm", { locale: ptBR })}
                              {a.autor && <span> · {a.autor}</span>}
                            </div>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive"
                              onClick={() => removerAnotacao(a.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-sm mt-1 whitespace-pre-wrap">{a.texto}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="valores" className="flex-1 overflow-auto mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor do produto/licença</Label>
                  <Input type="number" step="0.01" min="0" value={valores.valor_produto ?? ''} onChange={setNum('valor_produto')} />
                </div>
                <div className="space-y-2">
                  <Label>Valor da implantação</Label>
                  <Input type="number" step="0.01" min="0" value={valores.valor_implantacao ?? ''} onChange={setNum('valor_implantacao')} />
                </div>
                <div className="space-y-2">
                  <Label>Serviços adicionais</Label>
                  <Input type="number" step="0.01" min="0" value={valores.valor_servicos ?? ''} onChange={setNum('valor_servicos')} />
                </div>
                <div className="space-y-2">
                  <Label>Mensalidade recorrente</Label>
                  <Input type="number" step="0.01" min="0" value={valores.valor_mensalidade ?? ''} onChange={setNum('valor_mensalidade')} />
                </div>
                <div className="space-y-2">
                  <Label>Desconto</Label>
                  <Input type="number" step="0.01" min="0" value={valores.desconto ?? ''} onChange={setNum('desconto')} />
                </div>
                <div className="space-y-2">
                  <Label>Custo</Label>
                  <Input type="number" step="0.01" min="0" value={valores.custo ?? ''} onChange={setNum('custo')} />
                </div>
                <div className="space-y-2">
                  <Label>Forma de pagamento</Label>
                  <Input value={valores.forma_pagamento ?? ''} onChange={e => setValores(v => ({ ...v, forma_pagamento: e.target.value }))} placeholder="Ex: Boleto, Pix, Cartão" />
                </div>
                <div className="space-y-2">
                  <Label>Parcelas</Label>
                  <Input type="number" min="1" step="1" value={valores.parcelas ?? ''} onChange={e => setValores(v => ({ ...v, parcelas: e.target.value === '' ? undefined : parseInt(e.target.value) }))} />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Observação financeira</Label>
                  <Textarea
                    value={valores.observacao_financeira ?? ''}
                    onChange={e => setValores(v => ({ ...v, observacao_financeira: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Total da venda</p>
                  <p className="text-lg font-semibold">{fmtBRL(total)}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">Margem estimada</p>
                  <p className={`text-lg font-semibold ${margem < 0 ? 'text-destructive' : 'text-[hsl(var(--success))]'}`}>
                    {fmtBRL(margem)}
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t mt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button type="button" onClick={salvar} disabled={saving || loading}>
            <Save className="h-4 w-4 mr-1" /> {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
