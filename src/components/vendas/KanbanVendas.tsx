import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, GripVertical, Thermometer, Calendar, DollarSign, User, Edit, Trash2, Building2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Revenda = {
  id: string;
  cliente_id: string;
  empresa_id: string | null;
  revendedor_id: string | null;
  sistema: string | null;
  status_venda: string;
  temperatura: string | null;
  valor_estimado: number | null;
  data_venda: string | null;
  data_proxima_acao: string | null;
  proxima_acao: string | null;
  created_at: string | null;
  cliente?: { nome_empresa: string };
};

type Cliente = { id: string; nome_empresa: string };

const COLUNAS = [
  { id: 'lead', label: 'Lead', color: 'bg-[hsl(var(--info))]', bgColor: 'bg-[hsl(var(--info))]/10' },
  { id: 'contato', label: 'Contato', color: 'bg-[hsl(var(--warning))]', bgColor: 'bg-[hsl(var(--warning))]/10' },
  { id: 'proposta', label: 'Proposta', color: 'bg-primary', bgColor: 'bg-primary/10' },
  { id: 'negociacao', label: 'Negociação', color: 'bg-purple-500', bgColor: 'bg-purple-500/10' },
  { id: 'fechado', label: 'Fechado', color: 'bg-[hsl(var(--success))]', bgColor: 'bg-[hsl(var(--success))]/10' },
  { id: 'perdido', label: 'Perdido', color: 'bg-destructive', bgColor: 'bg-destructive/10' },
];

const TEMPERATURAS = [
  { id: 'frio', label: '❄️ Frio', color: 'text-blue-500' },
  { id: 'morno', label: '🌤️ Morno', color: 'text-amber-500' },
  { id: 'quente', label: '🔥 Quente', color: 'text-red-500' },
];

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

export default function KanbanVendas() {
  const [revendas, setRevendas] = useState<Revenda[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Revenda | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  const [form, setForm] = useState({
    cliente_id: '',
    sistema: '',
    status_venda: 'lead',
    temperatura: 'morno',
    valor_estimado: 0,
    data_proxima_acao: '',
    proxima_acao: '',
  });

  const fetchData = async () => {
    try {
      const [{ data: rv }, { data: cl }] = await Promise.all([
        supabase.from('revendas').select('*, cliente:clientes(nome_empresa)').order('created_at', { ascending: false }),
        supabase.from('clientes').select('id, nome_empresa').order('nome_empresa'),
      ]);
      setRevendas((rv as Revenda[]) || []);
      setClientes((cl as Cliente[]) || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => setForm({
    cliente_id: '', sistema: '', status_venda: 'lead', temperatura: 'morno',
    valor_estimado: 0, data_proxima_acao: '', proxima_acao: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editing) {
        const { error } = await supabase.from('revendas').update(form).eq('id', editing.id);
        if (error) throw error;
        toast.success('Venda atualizada!');
      } else {
        const { data: profile } = await supabase.from('usuario_perfil').select('id, empresa_id').maybeSingle();
        const { error } = await supabase.from('revendas').insert({
          ...form,
          empresa_id: profile?.empresa_id || null,
          revendedor_id: profile?.id || null,
        });
        if (error) throw error;
        toast.success('Venda criada!');
      }
      setDialogOpen(false);
      setEditing(null);
      resetForm();
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar');
    }
  };

  const handleEdit = (r: Revenda) => {
    setEditing(r);
    setForm({
      cliente_id: r.cliente_id,
      sistema: r.sistema || '',
      status_venda: r.status_venda,
      temperatura: r.temperatura || 'morno',
      valor_estimado: r.valor_estimado || 0,
      data_proxima_acao: r.data_proxima_acao || '',
      proxima_acao: r.proxima_acao || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta venda?')) return;
    try {
      const { error } = await supabase.from('revendas').delete().eq('id', id);
      if (error) throw error;
      toast.success('Excluída!');
      fetchData();
    } catch { toast.error('Erro ao excluir'); }
  };

  const handleDragStart = (id: string) => setDraggedId(id);
  const handleDragEnd = () => { setDraggedId(null); setDragOverCol(null); };

  const handleDrop = async (newStatus: string) => {
    if (!draggedId) return;
    setDragOverCol(null);
    const item = revendas.find(r => r.id === draggedId);
    if (!item || item.status_venda === newStatus) { setDraggedId(null); return; }

    // Optimistic update
    setRevendas(prev => prev.map(r => r.id === draggedId ? { ...r, status_venda: newStatus } : r));
    setDraggedId(null);

    try {
      const updateData: Record<string, any> = { status_venda: newStatus };
      if (newStatus === 'fechado') updateData.data_venda = new Date().toISOString().split('T')[0];
      const { error } = await supabase.from('revendas').update(updateData).eq('id', draggedId);
      if (error) throw error;
      toast.success(`Movido para ${COLUNAS.find(c => c.id === newStatus)?.label}`);
    } catch {
      toast.error('Erro ao mover');
      fetchData();
    }
  };

  const getColumnItems = (status: string) => revendas.filter(r => r.status_venda === status);
  const getTemp = (t: string | null) => TEMPERATURAS.find(x => x.id === t) || TEMPERATURAS[1];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Pipeline de Vendas</h3>
          <p className="text-sm text-muted-foreground">Arraste os cards entre as colunas para atualizar o status</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); resetForm(); setDialogOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Nova Venda
        </Button>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-2 px-2">
        {COLUNAS.map(col => {
          const items = getColumnItems(col.id);
          const totalValue = items.reduce((s, r) => s + (r.valor_estimado || 0), 0);
          const isOver = dragOverCol === col.id;

          return (
            <div
              key={col.id}
              className={`flex-shrink-0 w-[260px] rounded-xl border transition-all duration-200 ${
                isOver ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border bg-muted/30'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => { e.preventDefault(); handleDrop(col.id); }}
            >
              {/* Column Header */}
              <div className="p-3 border-b border-border/50">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`h-2.5 w-2.5 rounded-full ${col.color}`} />
                  <span className="text-sm font-semibold">{col.label}</span>
                  <Badge variant="secondary" className="ml-auto text-xs h-5 px-1.5">{items.length}</Badge>
                </div>
                {totalValue > 0 && (
                  <p className="text-xs text-muted-foreground">{formatCurrency(totalValue)}</p>
                )}
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 min-h-[120px]">
                <AnimatePresence>
                  {items.map(item => {
                    const temp = getTemp(item.temperatura);
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: draggedId === item.id ? 0.5 : 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        draggable
                        onDragStart={() => handleDragStart(item.id)}
                        onDragEnd={handleDragEnd}
                        className="cursor-grab active:cursor-grabbing"
                      >
                        <Card className="group border-border/60 hover:border-primary/30 hover:shadow-md transition-all">
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-start justify-between gap-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <GripVertical className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                                <p className="text-sm font-medium truncate">
                                  {item.cliente?.nome_empresa || 'Cliente'}
                                </p>
                              </div>
                              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleEdit(item)}>
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDelete(item.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>

                            {item.sistema && (
                              <p className="text-xs text-muted-foreground">{item.sistema}</p>
                            )}

                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xs font-medium ${temp.color}`}>{temp.label}</span>
                              {item.valor_estimado ? (
                                <Badge variant="outline" className="text-xs h-5 gap-1">
                                  <DollarSign className="h-2.5 w-2.5" />
                                  {formatCurrency(item.valor_estimado)}
                                </Badge>
                              ) : null}
                            </div>

                            {item.data_proxima_acao && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(item.data_proxima_acao), 'dd MMM', { locale: ptBR })}
                                {item.proxima_acao && <span>· {item.proxima_acao}</span>}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {items.length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground">
                    Arraste cards aqui
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Venda' : 'Nova Venda'}</DialogTitle>
            <DialogDescription>Gerencie oportunidades no pipeline</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Cliente *</Label>
              <Select value={form.cliente_id} onValueChange={v => setForm({ ...form, cliente_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {clientes.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.nome_empresa}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Sistema</Label>
                <Input value={form.sistema} onChange={e => setForm({ ...form, sistema: e.target.value })} placeholder="Ex: ERP" />
              </div>
              <div className="space-y-2">
                <Label>Valor Estimado</Label>
                <Input type="number" step="0.01" min="0" value={form.valor_estimado}
                  onChange={e => setForm({ ...form, valor_estimado: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={form.status_venda} onValueChange={v => setForm({ ...form, status_venda: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COLUNAS.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Temperatura</Label>
                <Select value={form.temperatura} onValueChange={v => setForm({ ...form, temperatura: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TEMPERATURAS.map(t => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Próxima Ação</Label>
                <Input value={form.proxima_acao} onChange={e => setForm({ ...form, proxima_acao: e.target.value })} placeholder="Ex: Ligar" />
              </div>
              <div className="space-y-2">
                <Label>Data Próx. Ação</Label>
                <Input type="date" value={form.data_proxima_acao}
                  onChange={e => setForm({ ...form, data_proxima_acao: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!form.cliente_id}>{editing ? 'Salvar' : 'Criar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
