import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, GripVertical, Calendar, DollarSign, Edit, Trash2, Settings2, ChevronDown, X, FileText, Tag } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Revenda = {
  id: string;
  cliente_id: string;
  empresa_id: string | null;
  revendedor_id: string | null;
  pipeline_id: string | null;
  sistema: string | null;
  status_venda: string;
  temperatura: string | null;
  valor_estimado: number | null;
  data_venda: string | null;
  data_proxima_acao: string | null;
  proxima_acao: string | null;
  observacoes: string | null;
  origem: string | null;
  tags: string[] | null;
  created_at: string | null;
  cliente?: { nome_empresa: string };
};

type Cliente = { id: string; nome_empresa: string };

type Pipeline = {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  empresa_id: string | null;
};

const COLUNAS = [
  { id: 'lead', label: 'Lead', color: 'bg-[hsl(var(--info))]' },
  { id: 'contato', label: 'Contato', color: 'bg-[hsl(var(--warning))]' },
  { id: 'proposta', label: 'Proposta', color: 'bg-primary' },
  { id: 'negociacao', label: 'Negociação', color: 'bg-purple-500' },
  { id: 'fechado', label: 'Fechado', color: 'bg-[hsl(var(--success))]' },
  { id: 'perdido', label: 'Perdido', color: 'bg-destructive' },
];

const ORIGENS = [
  'Indicação', 'Site', 'Instagram', 'Facebook', 'LinkedIn',
  'Google Ads', 'WhatsApp', 'Evento', 'Prospecção ativa', 'Outro',
];

const TAG_COLORS = [
  'bg-blue-500/15 text-blue-600 border-blue-500/30',
  'bg-green-500/15 text-green-600 border-green-500/30',
  'bg-amber-500/15 text-amber-600 border-amber-500/30',
  'bg-purple-500/15 text-purple-600 border-purple-500/30',
  'bg-pink-500/15 text-pink-600 border-pink-500/30',
  'bg-cyan-500/15 text-cyan-600 border-cyan-500/30',
];
const tagColor = (t: string) => TAG_COLORS[Math.abs(t.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % TAG_COLORS.length];

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
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Revenda | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  // Pipeline dialog
  const [pipelineDialogOpen, setPipelineDialogOpen] = useState(false);
  const [editingPipeline, setEditingPipeline] = useState<Pipeline | null>(null);
  const [pipelineForm, setPipelineForm] = useState({ nome: '', descricao: '', cor: '#3B82F6' });

  const [form, setForm] = useState({
    cliente_id: '',
    sistema: '',
    status_venda: 'lead',
    temperatura: 'morno',
    valor_estimado: 0,
    data_proxima_acao: '',
    proxima_acao: '',
    observacoes: '',
    origem: '',
    tags: [] as string[],
  });
  const [tagInput, setTagInput] = useState('');

  const fetchData = async () => {
    try {
      const [{ data: rv }, { data: cl }, { data: pl }] = await Promise.all([
        supabase.from('revendas').select('*, cliente:clientes(nome_empresa)').order('created_at', { ascending: false }),
        supabase.from('clientes').select('id, nome_empresa').order('nome_empresa'),
        supabase.from('pipelines_vendas').select('*').eq('ativo', true).order('ordem').order('created_at'),
      ]);
      const pipelinesList = (pl as Pipeline[]) || [];
      setRevendas((rv as Revenda[]) || []);
      setClientes((cl as Cliente[]) || []);
      setPipelines(pipelinesList);
      setActivePipelineId(prev => {
        if (prev && pipelinesList.some(p => p.id === prev)) return prev;
        return pipelinesList[0]?.id || null;
      });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const resetForm = () => {
    setForm({
      cliente_id: '', sistema: '', status_venda: 'lead', temperatura: 'morno',
      valor_estimado: 0, data_proxima_acao: '', proxima_acao: '',
      observacoes: '', origem: '', tags: [],
    });
    setTagInput('');
  };

  const ensurePipeline = async (): Promise<string | null> => {
    if (activePipelineId) return activePipelineId;
    const { data: profile } = await supabase.from('usuario_perfil').select('empresa_id').maybeSingle();
    const { data, error } = await supabase
      .from('pipelines_vendas')
      .insert({ nome: 'Padrão', empresa_id: profile?.empresa_id || null })
      .select()
      .single();
    if (error) { toast.error('Crie um pipeline primeiro'); return null; }
    await fetchData();
    setActivePipelineId(data.id);
    return data.id;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const pipelineId = await ensurePipeline();
      if (!pipelineId) return;

      if (editing) {
        const { error } = await supabase.from('revendas').update({ ...form, pipeline_id: pipelineId }).eq('id', editing.id);
        if (error) throw error;
        toast.success('Venda atualizada!');
      } else {
        const { data: profile } = await supabase.from('usuario_perfil').select('id, empresa_id').maybeSingle();
        const { error } = await supabase.from('revendas').insert({
          ...form,
          pipeline_id: pipelineId,
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
      observacoes: r.observacoes || '',
      origem: r.origem || '',
      tags: r.tags || [],
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

  // Pipeline CRUD
  const openCreatePipeline = () => {
    setEditingPipeline(null);
    setPipelineForm({ nome: '', descricao: '', cor: '#3B82F6' });
    setPipelineDialogOpen(true);
  };

  const openEditPipeline = (p: Pipeline) => {
    setEditingPipeline(p);
    setPipelineForm({ nome: p.nome, descricao: p.descricao || '', cor: p.cor || '#3B82F6' });
    setPipelineDialogOpen(true);
  };

  const handleSavePipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pipelineForm.nome.trim()) { toast.error('Nome obrigatório'); return; }
    try {
      if (editingPipeline) {
        const { error } = await supabase.from('pipelines_vendas')
          .update({ nome: pipelineForm.nome, descricao: pipelineForm.descricao, cor: pipelineForm.cor })
          .eq('id', editingPipeline.id);
        if (error) throw error;
        toast.success('Pipeline atualizado!');
      } else {
        const { data: profile } = await supabase.from('usuario_perfil').select('empresa_id').maybeSingle();
        const { data, error } = await supabase.from('pipelines_vendas').insert({
          nome: pipelineForm.nome,
          descricao: pipelineForm.descricao,
          cor: pipelineForm.cor,
          empresa_id: profile?.empresa_id || null,
        }).select().single();
        if (error) throw error;
        toast.success('Pipeline criado!');
        setActivePipelineId(data.id);
      }
      setPipelineDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar pipeline');
    }
  };

  const handleDeletePipeline = async (p: Pipeline) => {
    const count = revendas.filter(r => r.pipeline_id === p.id).length;
    if (!confirm(`Excluir pipeline "${p.nome}"?${count ? ` ${count} oportunidade(s) ficarão sem pipeline.` : ''}`)) return;
    try {
      const { error } = await supabase.from('pipelines_vendas').delete().eq('id', p.id);
      if (error) throw error;
      toast.success('Pipeline excluído!');
      if (activePipelineId === p.id) setActivePipelineId(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir');
    }
  };

  const activePipeline = pipelines.find(p => p.id === activePipelineId);
  const filteredRevendas = revendas.filter(r => r.pipeline_id === activePipelineId);
  const getColumnItems = (status: string) => filteredRevendas.filter(r => r.status_venda === status);
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
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: activePipeline?.cor || '#3B82F6' }}
                />
                <span className="font-semibold">{activePipeline?.nome || 'Selecionar pipeline'}</span>
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Meus pipelines</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {pipelines.length === 0 && (
                <div className="px-2 py-3 text-sm text-muted-foreground">Nenhum pipeline criado</div>
              )}
              {pipelines.map(p => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => setActivePipelineId(p.id)}
                  className="flex items-center gap-2"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: p.cor || '#3B82F6' }}
                  />
                  <span className="flex-1 truncate">{p.nome}</span>
                  {p.id === activePipelineId && <span className="text-xs text-primary">●</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={openCreatePipeline}>
                <Plus className="h-4 w-4 mr-2" /> Novo pipeline
              </DropdownMenuItem>
              {activePipeline && (
                <>
                  <DropdownMenuItem onClick={() => openEditPipeline(activePipeline)}>
                    <Edit className="h-4 w-4 mr-2" /> Editar atual
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDeletePipeline(activePipeline)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Excluir atual
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {activePipeline?.descricao && (
            <p className="text-sm text-muted-foreground">{activePipeline.descricao}</p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openCreatePipeline}>
            <Settings2 className="mr-2 h-4 w-4" /> Pipelines
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); resetForm(); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Nova Venda
          </Button>
        </div>
      </div>

      {pipelines.length === 0 ? (
        <div className="border border-dashed rounded-xl p-12 text-center">
          <p className="text-muted-foreground mb-4">Você ainda não tem nenhum pipeline de vendas.</p>
          <Button onClick={openCreatePipeline}>
            <Plus className="mr-2 h-4 w-4" /> Criar primeiro pipeline
          </Button>
        </div>
      ) : (
        /* Kanban Board */
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

                              {item.origem && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Tag className="h-3 w-3" />
                                  <span>{item.origem}</span>
                                </div>
                              )}

                              {item.observacoes && (
                                <div className="flex items-start gap-1 text-xs text-muted-foreground">
                                  <FileText className="h-3 w-3 mt-0.5 shrink-0" />
                                  <p className="line-clamp-2">{item.observacoes}</p>
                                </div>
                              )}

                              {item.tags && item.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {item.tags.map(t => (
                                    <span key={t} className={`text-[10px] px-1.5 py-0.5 rounded border ${tagColor(t)}`}>
                                      {t}
                                    </span>
                                  ))}
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
      )}

      {/* Venda Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Venda' : 'Nova Venda'}</DialogTitle>
            <DialogDescription>
              Pipeline: <span className="font-medium">{activePipeline?.nome || 'Padrão (será criado)'}</span>
            </DialogDescription>
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

            <div className="space-y-2">
              <Label>Origem do Lead</Label>
              <Select value={form.origem || '__none__'} onValueChange={v => setForm({ ...form, origem: v === '__none__' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Nenhuma —</SelectItem>
                  {ORIGENS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const t = tagInput.trim();
                      if (t && !form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] });
                      setTagInput('');
                    }
                  }}
                  placeholder="Digite e pressione Enter"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const t = tagInput.trim();
                    if (t && !form.tags.includes(t)) setForm({ ...form, tags: [...form.tags, t] });
                    setTagInput('');
                  }}
                >
                  Adicionar
                </Button>
              </div>
              {form.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.tags.map(t => (
                    <span key={t} className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${tagColor(t)}`}>
                      {t}
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, tags: form.tags.filter(x => x !== t) })}
                        className="hover:opacity-70"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea
                value={form.observacoes}
                onChange={e => setForm({ ...form, observacoes: e.target.value })}
                placeholder="Anotações sobre a oportunidade, histórico, contexto..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={!form.cliente_id}>{editing ? 'Salvar' : 'Criar'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pipeline Dialog */}
      <Dialog open={pipelineDialogOpen} onOpenChange={setPipelineDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editingPipeline ? 'Editar Pipeline' : 'Novo Pipeline'}</DialogTitle>
            <DialogDescription>Organize suas vendas em diferentes funis</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSavePipeline} className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={pipelineForm.nome}
                onChange={e => setPipelineForm({ ...pipelineForm, nome: e.target.value })}
                placeholder="Ex: Vendas B2B, Renovação, Upsell"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={pipelineForm.descricao}
                onChange={e => setPipelineForm({ ...pipelineForm, descricao: e.target.value })}
                placeholder="Opcional"
              />
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="color"
                  value={pipelineForm.cor}
                  onChange={e => setPipelineForm({ ...pipelineForm, cor: e.target.value })}
                  className="h-10 w-16 p-1 cursor-pointer"
                />
                <Input
                  value={pipelineForm.cor}
                  onChange={e => setPipelineForm({ ...pipelineForm, cor: e.target.value })}
                  className="flex-1 font-mono text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPipelineDialogOpen(false)}>Cancelar</Button>
              <Button type="submit">{editingPipeline ? 'Salvar' : 'Criar'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
