import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Target, Trophy, TrendingUp, Edit, Trash2, CheckCircle2, Zap, Calendar, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, differenceInDays, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type Meta = {
  id: string;
  titulo: string;
  descricao: string | null;
  tipo: string;
  valor_meta: number;
  valor_atual: number;
  data_inicio: string;
  data_fim: string;
  status: string;
  created_at: string;
  cliente_id: string | null;
  cliente_nome: string | null;
  cliente_cnpj: string | null;
  cliente_contato: string | null;
};

type ClienteOption = {
  id: string;
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
};

const TIPOS_META = [
  { id: 'vendas_fechadas', label: 'Vendas Fechadas (R$)', icon: '💰' },
  { id: 'novos_leads', label: 'Novos Leads (qtd)', icon: '🎯' },
  { id: 'propostas_enviadas', label: 'Propostas Enviadas (qtd)', icon: '📋' },
  { id: 'taxa_conversao', label: 'Taxa de Conversão (%)', icon: '📈' },
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function MetasVendas() {
  const [metas, setMetas] = useState<Meta[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMeta, setEditingMeta] = useState<Meta | null>(null);

  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    tipo: 'vendas_fechadas',
    valor_meta: 0,
    valor_atual: 0,
    data_inicio: new Date().toISOString().split('T')[0],
    data_fim: '',
    status: 'em_andamento',
    cliente_id: '' as string,
    cliente_nome: '',
    cliente_cnpj: '',
    cliente_contato: '',
  });

  const fetchMetas = async () => {
    try {
      const { data, error } = await supabase
        .from('metas_vendas')
        .select('*')
        .order('data_fim', { ascending: true });
      if (error) throw error;
      setMetas((data as Meta[]) || []);
    } catch (error) {
      console.error('Error fetching metas:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchClientes = async () => {
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('id, nome_empresa, cnpj, telefone, email')
        .order('nome_empresa', { ascending: true });
      if (error) throw error;
      setClientes(
        (data || []).map((c: any) => ({
          id: c.id,
          nome: c.nome_empresa,
          cnpj: c.cnpj,
          telefone: c.telefone,
          email: c.email,
        }))
      );
    } catch (e) {
      console.error('Error fetching clientes:', e);
    }
  };

  useEffect(() => { fetchMetas(); fetchClientes(); }, []);

  const resetForm = () => {
    setFormData({
      titulo: '', descricao: '', tipo: 'vendas_fechadas',
      valor_meta: 0, valor_atual: 0,
      data_inicio: new Date().toISOString().split('T')[0],
      data_fim: '', status: 'em_andamento',
      cliente_id: '', cliente_nome: '', cliente_cnpj: '', cliente_contato: '',
    });
  };

  const handleClienteSelect = (clienteId: string) => {
    if (clienteId === '__none__') {
      setFormData((prev) => ({
        ...prev,
        cliente_id: '',
        cliente_nome: '',
        cliente_cnpj: '',
        cliente_contato: '',
      }));
      return;
    }
    const c = clientes.find((x) => x.id === clienteId);
    if (!c) return;
    setFormData((prev) => ({
      ...prev,
      cliente_id: c.id,
      cliente_nome: c.nome,
      cliente_cnpj: c.cnpj || '',
      cliente_contato: c.telefone || c.email || '',
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingMeta) {
        const { error } = await supabase
          .from('metas_vendas')
          .update({ ...formData, updated_at: new Date().toISOString() })
          .eq('id', editingMeta.id);
        if (error) throw error;
        toast.success('Meta atualizada!');
      } else {
        const { data: profile } = await supabase
          .from('usuario_perfil')
          .select('empresa_id')
          .maybeSingle();
        const { error } = await supabase.from('metas_vendas').insert({
          ...formData,
          empresa_id: profile?.empresa_id || null,
        });
        if (error) throw error;
        toast.success('Meta criada!');
      }
      setDialogOpen(false);
      setEditingMeta(null);
      resetForm();
      fetchMetas();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar');
    }
  };

  const handleEdit = (meta: Meta) => {
    setEditingMeta(meta);
    setFormData({
      titulo: meta.titulo,
      descricao: meta.descricao || '',
      tipo: meta.tipo,
      valor_meta: meta.valor_meta,
      valor_atual: meta.valor_atual,
      data_inicio: meta.data_inicio,
      data_fim: meta.data_fim,
      status: meta.status,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta meta?')) return;
    try {
      const { error } = await supabase.from('metas_vendas').delete().eq('id', id);
      if (error) throw error;
      toast.success('Meta excluída!');
      fetchMetas();
    } catch { toast.error('Erro ao excluir'); }
  };

  const handleConcluir = async (id: string) => {
    try {
      const { error } = await supabase
        .from('metas_vendas')
        .update({ status: 'concluida', updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast.success('Meta concluída! 🎉');
      fetchMetas();
    } catch { toast.error('Erro ao concluir'); }
  };

  const getProgresso = (meta: Meta) => {
    if (meta.valor_meta <= 0) return 0;
    return Math.min(Math.round((meta.valor_atual / meta.valor_meta) * 100), 100);
  };

  const metasEmAndamento = metas.filter(m => m.status === 'em_andamento');
  const metasConcluidas = metas.filter(m => m.status === 'concluida');

  const formatValue = (value: number, tipo: string) => {
    if (tipo === 'vendas_fechadas') return formatCurrency(value);
    if (tipo === 'taxa_conversao') return `${value}%`;
    return value.toString();
  };

  const getProgressColor = (progresso: number, isOverdue: boolean) => {
    if (isOverdue && progresso < 100) return 'bg-destructive';
    if (progresso >= 100) return 'bg-[hsl(var(--success))]';
    if (progresso >= 70) return 'bg-primary';
    if (progresso >= 40) return 'bg-[hsl(var(--warning))]';
    return 'bg-[hsl(var(--info))]';
  };

  const getDaysRemaining = (dataFim: string) => {
    const days = differenceInDays(new Date(dataFim), new Date());
    if (days < 0) return { text: `${Math.abs(days)}d atrasada`, urgent: true };
    if (days === 0) return { text: 'Vence hoje!', urgent: true };
    if (days <= 7) return { text: `${days}d restantes`, urgent: true };
    return { text: `${days}d restantes`, urgent: false };
  };

  const avgProgress = metasEmAndamento.length > 0
    ? Math.round(metasEmAndamento.reduce((s, m) => s + getProgresso(m), 0) / metasEmAndamento.length)
    : 0;

  const metasAtingidas = metasEmAndamento.filter(m => getProgresso(m) >= 100).length;

  return (
    <div className="space-y-6">
      {/* Hero Summary */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          {
            icon: Target, label: 'Metas Ativas', value: metasEmAndamento.length,
            gradient: 'from-primary/10 to-primary/5', iconColor: 'text-primary', borderColor: 'border-primary/20',
          },
          {
            icon: Zap, label: 'Prontas p/ Concluir', value: metasAtingidas,
            gradient: 'from-[hsl(var(--warning))]/10 to-[hsl(var(--warning))]/5', iconColor: 'text-[hsl(var(--warning))]', borderColor: 'border-[hsl(var(--warning))]/20',
          },
          {
            icon: Trophy, label: 'Concluídas', value: metasConcluidas.length,
            gradient: 'from-[hsl(var(--success))]/10 to-[hsl(var(--success))]/5', iconColor: 'text-[hsl(var(--success))]', borderColor: 'border-[hsl(var(--success))]/20',
          },
          {
            icon: BarChart3, label: 'Progresso Médio', value: `${avgProgress}%`,
            gradient: 'from-[hsl(var(--info))]/10 to-[hsl(var(--info))]/5', iconColor: 'text-[hsl(var(--info))]', borderColor: 'border-[hsl(var(--info))]/20',
          },
        ].map((item, i) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
          >
            <Card className={`border ${item.borderColor} bg-gradient-to-br ${item.gradient} hover:shadow-md transition-shadow`}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className={`p-2.5 rounded-xl bg-background/80 shadow-sm`}>
                  <item.icon className={`h-5 w-5 ${item.iconColor}`} />
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{item.label}</p>
                  <p className="text-2xl font-bold tracking-tight">{item.value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Metas em Andamento</h3>
          <p className="text-sm text-muted-foreground">Acompanhe o progresso dos seus objetivos</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => { setEditingMeta(null); resetForm(); }}>
              <Plus className="mr-2 h-4 w-4" /> Nova Meta
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>{editingMeta ? 'Editar Meta' : 'Nova Meta'}</DialogTitle>
              <DialogDescription>Defina um objetivo para acompanhar</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  placeholder="Ex: Fechar R$ 50.000 em vendas"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Detalhes da meta..."
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_META.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.icon} {t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="em_andamento">Em Andamento</SelectItem>
                      <SelectItem value="concluida">Concluída</SelectItem>
                      <SelectItem value="cancelada">Cancelada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Valor Meta</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={formData.valor_meta}
                    onChange={(e) => setFormData({ ...formData, valor_meta: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Valor Atual</Label>
                  <Input
                    type="number" step="0.01" min="0"
                    value={formData.valor_atual}
                    onChange={(e) => setFormData({ ...formData, valor_atual: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Data Início</Label>
                  <Input type="date" value={formData.data_inicio}
                    onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Data Fim *</Label>
                  <Input type="date" value={formData.data_fim} required
                    onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                <Button type="submit">{editingMeta ? 'Salvar' : 'Criar'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active Metas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence>
          {metasEmAndamento.map((meta, index) => {
            const progresso = getProgresso(meta);
            const isOverdue = isPast(new Date(meta.data_fim)) && meta.status === 'em_andamento';
            const daysInfo = getDaysRemaining(meta.data_fim);
            const tipoMeta = TIPOS_META.find(t => t.id === meta.tipo);
            const progressColor = getProgressColor(progresso, isOverdue);

            return (
              <motion.div
                key={meta.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={`group relative overflow-hidden hover:shadow-lg transition-all duration-300 ${
                  isOverdue ? 'border-destructive/40 bg-destructive/[0.02]' : 
                  progresso >= 100 ? 'border-[hsl(var(--success))]/40 bg-[hsl(var(--success))]/[0.02]' : 
                  'hover:border-primary/30'
                }`}>
                  {/* Top accent bar */}
                  <div className={`h-1 w-full ${progressColor}`} />

                  {progresso >= 100 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-3 right-3 bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))] text-xs px-2.5 py-1 rounded-full font-semibold shadow-sm flex items-center gap-1"
                    >
                      🎯 Atingida!
                    </motion.div>
                  )}

                  <CardContent className="p-5">
                    {/* Type badge + actions */}
                    <div className="flex items-start justify-between mb-3">
                      <Badge variant="secondary" className="text-xs font-medium gap-1">
                        {tipoMeta?.icon} {tipoMeta?.label || meta.tipo}
                      </Badge>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {progresso >= 100 && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-[hsl(var(--success))]"
                            onClick={() => handleConcluir(meta.id)} title="Marcar como concluída">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          onClick={() => handleEdit(meta)}>
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(meta.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Title + description */}
                    <h4 className="font-semibold text-sm leading-tight mb-1">{meta.titulo}</h4>
                    {meta.descricao && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{meta.descricao}</p>
                    )}

                    {/* Progress section */}
                    <div className="space-y-2 mt-3">
                      <div className="flex justify-between items-baseline">
                        <span className="text-xs text-muted-foreground">
                          {formatValue(meta.valor_atual, meta.tipo)}
                        </span>
                        <span className="text-xs font-bold">{formatValue(meta.valor_meta, meta.tipo)}</span>
                      </div>
                      
                      {/* Custom progress bar */}
                      <div className="relative h-2.5 w-full bg-secondary rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${progressColor}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${progresso}%` }}
                          transition={{ duration: 1, ease: 'easeOut', delay: index * 0.1 }}
                        />
                      </div>

                      <div className="flex justify-between items-center">
                        <span className={`text-lg font-bold ${
                          progresso >= 100 ? 'text-[hsl(var(--success))]' : 
                          isOverdue ? 'text-destructive' : 'text-foreground'
                        }`}>
                          {progresso}%
                        </span>
                        <span className={`text-xs flex items-center gap-1 ${
                          daysInfo.urgent ? 'text-destructive font-medium' : 'text-muted-foreground'
                        }`}>
                          <Calendar className="h-3 w-3" />
                          {daysInfo.text}
                        </span>
                      </div>
                    </div>

                    {/* Footer date */}
                    <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground flex justify-between">
                      <span>{format(new Date(meta.data_inicio), 'dd MMM', { locale: ptBR })}</span>
                      <span className="font-medium">{format(new Date(meta.data_fim), 'dd MMM yyyy', { locale: ptBR })}</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {metasEmAndamento.length === 0 && !loading && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Target className="h-8 w-8 text-primary" />
          </div>
          <h4 className="font-semibold mb-1">Nenhuma meta ativa</h4>
          <p className="text-sm text-muted-foreground mb-4">Crie sua primeira meta para começar a acompanhar seus objetivos</p>
          <Button size="sm" variant="outline" onClick={() => { setEditingMeta(null); resetForm(); setDialogOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Criar Meta
          </Button>
        </motion.div>
      )}

      {/* Completed Metas */}
      {metasConcluidas.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Trophy className="h-4 w-4 text-[hsl(var(--success))]" />
            Metas Concluídas ({metasConcluidas.length})
          </h3>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {metasConcluidas.map((meta, i) => (
              <motion.div
                key={meta.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
              >
                <Card className="border-[hsl(var(--success))]/20 bg-[hsl(var(--success))]/[0.02]">
                  <CardContent className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-1.5 rounded-lg bg-[hsl(var(--success))]/10 shrink-0">
                        <Trophy className="h-4 w-4 text-[hsl(var(--success))]" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{meta.titulo}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatValue(meta.valor_meta, meta.tipo)}
                        </p>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/60 hover:text-destructive shrink-0"
                      onClick={() => handleDelete(meta.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
