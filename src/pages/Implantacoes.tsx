import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, CheckCircle, Clock, AlertCircle, Calendar, Edit, Trash2, Send, History, List, GitBranch } from 'lucide-react';
import TetrisLoading from '@/components/ui/tetris-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { format, isAfter, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Cliente {
  id: string;
  nome_empresa: string;
}

interface Usuario {
  id: string;
  nome: string | null;
  email: string | null;
}

interface ChecklistItem {
  id: string;
  descricao: string;
  concluido: boolean;
  ordem: number;
}

interface Comentario {
  id: string;
  texto: string;
  created_at: string;
  usuario: Usuario | null;
}

interface Historico {
  id: string;
  acao: string;
  created_at: string;
  usuario: Usuario | null;
}

interface Implantacao {
  id: string;
  cliente_id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  prioridade: string;
  responsavel_id: string | null;
  data_meta: string | null;
  data_prazo: string | null;
  progresso: number;
  created_at: string;
  cliente?: Cliente;
  responsavel?: Usuario | null;
  checklist?: ChecklistItem[];
}

const statusOptions = [
  { value: 'nao_iniciado', label: 'Não Iniciado', color: 'bg-muted text-muted-foreground' },
  { value: 'em_andamento', label: 'Em Andamento', color: 'bg-blue-500/20 text-blue-400' },
  { value: 'pendente', label: 'Pendente', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'concluido', label: 'Concluído', color: 'bg-green-500/20 text-green-400' },
];

const prioridadeOptions = [
  { value: 'baixa', label: 'Baixa', color: 'bg-muted text-muted-foreground' },
  { value: 'media', label: 'Média', color: 'bg-yellow-500/20 text-yellow-400' },
  { value: 'alta', label: 'Alta', color: 'bg-orange-500/20 text-orange-400' },
  { value: 'urgente', label: 'Urgente', color: 'bg-red-500/20 text-red-400' },
];

export default function Implantacoes() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [implantacoes, setImplantacoes] = useState<Implantacao[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedImplantacao, setSelectedImplantacao] = useState<Implantacao | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [novoComentario, setNovoComentario] = useState('');
  const [novoChecklistItem, setNovoChecklistItem] = useState('');
  const [viewMode, setViewMode] = useState<'lista' | 'processo'>('lista');
  
  const [formData, setFormData] = useState({
    cliente_id: '',
    titulo: '',
    descricao: '',
    status: 'nao_iniciado',
    prioridade: 'media',
    responsavel_id: '',
    data_meta: '',
    data_prazo: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [implantacoesRes, clientesRes, usuariosRes] = await Promise.all([
        supabase
          .from('implantacoes')
          .select(`
            *,
            cliente:clientes(id, nome_empresa),
            responsavel:usuario_perfil(id, nome, email)
          `)
          .order('created_at', { ascending: false }),
        supabase.from('clientes').select('id, nome_empresa').order('nome_empresa'),
        supabase.from('usuario_perfil').select('id, nome, email').order('nome'),
      ]);

      if (implantacoesRes.error) throw implantacoesRes.error;
      if (clientesRes.error) throw clientesRes.error;
      if (usuariosRes.error) throw usuariosRes.error;

      setImplantacoes(implantacoesRes.data || []);
      setClientes(clientesRes.data || []);
      setUsuarios(usuariosRes.data || []);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const fetchImplantacaoDetails = async (id: string) => {
    try {
      const [checklistRes, comentariosRes, historicoRes] = await Promise.all([
        supabase
          .from('implantacao_checklist')
          .select('*')
          .eq('implantacao_id', id)
          .order('ordem'),
        supabase
          .from('implantacao_comentarios')
          .select('*, usuario:usuario_perfil(id, nome, email)')
          .eq('implantacao_id', id)
          .order('created_at', { ascending: false }),
        supabase
          .from('implantacao_historico')
          .select('*, usuario:usuario_perfil(id, nome, email)')
          .eq('implantacao_id', id)
          .order('created_at', { ascending: false }),
      ]);

      setChecklist(checklistRes.data || []);
      setComentarios(comentariosRes.data || []);
      setHistorico(historicoRes.data || []);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleCreate = async () => {
    try {
      const { error } = await supabase.from('implantacoes').insert({
        cliente_id: formData.cliente_id,
        titulo: formData.titulo,
        descricao: formData.descricao || null,
        status: formData.status,
        prioridade: formData.prioridade,
        responsavel_id: formData.responsavel_id || null,
        data_meta: formData.data_meta || null,
        data_prazo: formData.data_prazo || null,
        progresso: 0,
      });

      if (error) throw error;

      toast({ title: 'Sucesso', description: 'Implantação criada!' });
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleUpdate = async () => {
    if (!selectedImplantacao) return;

    try {
      const { error } = await supabase
        .from('implantacoes')
        .update({
          titulo: formData.titulo,
          descricao: formData.descricao || null,
          status: formData.status,
          prioridade: formData.prioridade,
          responsavel_id: formData.responsavel_id || null,
          data_meta: formData.data_meta || null,
          data_prazo: formData.data_prazo || null,
        })
        .eq('id', selectedImplantacao.id);

      if (error) throw error;

      // Registrar histórico
      await supabase.from('implantacao_historico').insert({
        implantacao_id: selectedImplantacao.id,
        usuario_id: profile?.id,
        acao: 'Atualizou a implantação',
      });

      toast({ title: 'Sucesso', description: 'Implantação atualizada!' });
      setIsEditDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta implantação?')) return;

    try {
      const { error } = await supabase.from('implantacoes').delete().eq('id', id);
      if (error) throw error;

      toast({ title: 'Sucesso', description: 'Implantação excluída!' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleAddChecklistItem = async () => {
    if (!selectedImplantacao || !novoChecklistItem.trim()) return;

    try {
      const { error } = await supabase.from('implantacao_checklist').insert({
        implantacao_id: selectedImplantacao.id,
        descricao: novoChecklistItem,
        ordem: checklist.length,
      });

      if (error) throw error;

      setNovoChecklistItem('');
      fetchImplantacaoDetails(selectedImplantacao.id);
      updateProgress(selectedImplantacao.id);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleToggleChecklistItem = async (item: ChecklistItem) => {
    if (!selectedImplantacao) return;

    try {
      const { error } = await supabase
        .from('implantacao_checklist')
        .update({ concluido: !item.concluido })
        .eq('id', item.id);

      if (error) throw error;

      fetchImplantacaoDetails(selectedImplantacao.id);
      updateProgress(selectedImplantacao.id);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleDeleteChecklistItem = async (id: string) => {
    if (!selectedImplantacao) return;

    try {
      const { error } = await supabase.from('implantacao_checklist').delete().eq('id', id);
      if (error) throw error;

      fetchImplantacaoDetails(selectedImplantacao.id);
      updateProgress(selectedImplantacao.id);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const updateProgress = async (implantacaoId: string) => {
    const { data } = await supabase
      .from('implantacao_checklist')
      .select('concluido')
      .eq('implantacao_id', implantacaoId);

    if (data && data.length > 0) {
      const concluidos = data.filter((item) => item.concluido).length;
      const progresso = Math.round((concluidos / data.length) * 100);

      await supabase
        .from('implantacoes')
        .update({ progresso })
        .eq('id', implantacaoId);

      fetchData();
    }
  };

  const handleAddComentario = async () => {
    if (!selectedImplantacao || !novoComentario.trim()) return;

    try {
      const { error } = await supabase.from('implantacao_comentarios').insert({
        implantacao_id: selectedImplantacao.id,
        usuario_id: profile?.id,
        texto: novoComentario,
      });

      if (error) throw error;

      setNovoComentario('');
      fetchImplantacaoDetails(selectedImplantacao.id);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const openEditDialog = (implantacao: Implantacao) => {
    setSelectedImplantacao(implantacao);
    setFormData({
      cliente_id: implantacao.cliente_id,
      titulo: implantacao.titulo,
      descricao: implantacao.descricao || '',
      status: implantacao.status,
      prioridade: implantacao.prioridade,
      responsavel_id: implantacao.responsavel_id || '',
      data_meta: implantacao.data_meta || '',
      data_prazo: implantacao.data_prazo || '',
    });
    fetchImplantacaoDetails(implantacao.id);
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      cliente_id: '',
      titulo: '',
      descricao: '',
      status: 'nao_iniciado',
      prioridade: 'media',
      responsavel_id: '',
      data_meta: '',
      data_prazo: '',
    });
  };

  const filteredImplantacoes = implantacoes.filter((item) =>
    item.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.cliente?.nome_empresa?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const stats = {
    total: implantacoes.length,
    concluidas: implantacoes.filter((i) => i.status === 'concluido').length,
    emAndamento: implantacoes.filter((i) => i.status === 'em_andamento').length,
    pendentes: implantacoes.filter((i) => i.status === 'pendente').length,
    atrasadas: implantacoes.filter((i) => i.data_prazo && isAfter(new Date(), parseISO(i.data_prazo)) && i.status !== 'concluido').length,
  };

  const progressoGeral = implantacoes.length > 0
    ? Math.round(implantacoes.reduce((acc, i) => acc + i.progresso, 0) / implantacoes.length)
    : 0;

  const getStatusBadge = (status: string) => {
    const option = statusOptions.find((o) => o.value === status);
    return <Badge className={option?.color}>{option?.label}</Badge>;
  };

  const getPrioridadeBadge = (prioridade: string) => {
    const option = prioridadeOptions.find((o) => o.value === prioridade);
    return <Badge className={option?.color}>{option?.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <TetrisLoading size="sm" speed="fast" loadingText="Carregando..." />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Implantações</h1>
          <p className="text-muted-foreground">Gerencie o processo de implantação dos clientes</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Implantação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Nova Implantação</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Cliente *</Label>
                <Select value={formData.cliente_id} onValueChange={(v) => setFormData({ ...formData, cliente_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nome_empresa}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Título *</Label>
                <Input
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  placeholder="Ex: Implantação módulo fiscal"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Prioridade</Label>
                  <Select value={formData.prioridade} onValueChange={(v) => setFormData({ ...formData, prioridade: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {prioridadeOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Responsável</Label>
                  <Select value={formData.responsavel_id} onValueChange={(v) => setFormData({ ...formData, responsavel_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {usuarios.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.nome || u.email}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>Data Meta</Label>
                  <Input
                    type="date"
                    value={formData.data_meta}
                    onChange={(e) => setFormData({ ...formData, data_meta: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Prazo</Label>
                  <Input
                    type="date"
                    value={formData.data_prazo}
                    onChange={(e) => setFormData({ ...formData, data_prazo: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Descrição</Label>
                <Textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Descreva a implantação..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={!formData.cliente_id || !formData.titulo}>
                Criar Implantação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total de Atividades</p>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Concluídas</p>
            <p className="text-2xl font-bold text-green-500">{stats.concluidas}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Em Andamento</p>
            <p className="text-2xl font-bold text-blue-500">{stats.emAndamento}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold text-foreground">{stats.pendentes}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Atrasadas</p>
            <p className="text-2xl font-bold text-red-500">{stats.atrasadas}</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-foreground">Progresso Geral</h3>
            <span className="text-sm text-muted-foreground">{progressoGeral}% concluído</span>
          </div>
          <Progress value={progressoGeral} className="h-3" />
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>0%</span>
            <span>100%</span>
          </div>
        </CardContent>
      </Card>

      {/* Search and View Toggle */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Atividades de Implantação</CardTitle>
              <p className="text-sm text-muted-foreground">Gerencie as atividades dos clientes</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Buscar atividades..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-64"
                />
              </div>
            </div>
          </div>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'lista' | 'processo')} className="mt-4">
            <TabsList className="grid w-48 grid-cols-2">
              <TabsTrigger value="lista" className="gap-2">
                <List className="h-4 w-4" />
                Lista
              </TabsTrigger>
              <TabsTrigger value="processo" className="gap-2">
                <GitBranch className="h-4 w-4" />
                Processo
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {viewMode === 'lista' ? (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="min-w-[180px]">Atividade</th>
                    <th className="min-w-[140px]">Cliente</th>
                    <th className="min-w-[140px]">Responsável</th>
                    <th className="min-w-[100px]">Prioridade</th>
                    <th className="min-w-[110px]">Status</th>
                    <th className="min-w-[120px]">Progresso</th>
                    <th className="min-w-[100px]">Meta</th>
                    <th className="min-w-[100px]">Prazo</th>
                    <th className="w-[80px]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredImplantacoes.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <span className="font-medium text-foreground">{item.titulo}</span>
                      </td>
                      <td>
                        <span className="text-sm text-muted-foreground">{item.cliente?.nome_empresa}</span>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-medium text-primary">
                            {(item.responsavel?.nome || item.responsavel?.email || '?')[0].toUpperCase()}
                          </div>
                          <span className="text-sm text-muted-foreground truncate max-w-[120px]">
                            {item.responsavel?.nome || item.responsavel?.email || '-'}
                          </span>
                        </div>
                      </td>
                      <td>{getPrioridadeBadge(item.prioridade)}</td>
                      <td>{getStatusBadge(item.status)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Progress value={item.progresso} className="h-2 w-20" />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{item.progresso}%</span>
                        </div>
                      </td>
                      <td className="text-sm text-muted-foreground whitespace-nowrap">
                        {item.data_meta ? format(parseISO(item.data_meta), 'dd/MM/yyyy') : '-'}
                      </td>
                      <td className="text-sm text-muted-foreground whitespace-nowrap">
                        {item.data_prazo ? format(parseISO(item.data_prazo), 'dd/MM/yyyy') : '-'}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(item.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredImplantacoes.length === 0 && (
                <div className="py-12 text-center text-muted-foreground">
                  Nenhuma implantação encontrada.
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-4">
              {statusOptions.map((status) => (
                <div key={status.value} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge className={status.color}>{status.label}</Badge>
                    <span className="text-sm text-muted-foreground">
                      {filteredImplantacoes.filter((i) => i.status === status.value).length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {filteredImplantacoes
                      .filter((i) => i.status === status.value)
                      .map((item) => (
                        <Card
                          key={item.id}
                          className="cursor-pointer bg-card border-border hover:bg-muted/50"
                          onClick={() => openEditDialog(item)}
                        >
                          <CardContent className="p-3">
                            <p className="font-medium text-foreground text-sm">{item.titulo}</p>
                            <p className="text-xs text-muted-foreground mt-1">{item.cliente?.nome_empresa}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Progress value={item.progresso} className="h-1 flex-1" />
                              <span className="text-xs text-muted-foreground">{item.progresso}%</span>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-muted-foreground">Editar Atividade /</span>
              {selectedImplantacao?.cliente?.nome_empresa}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6 py-4">
              {/* Título */}
              <div>
                <Input
                  value={formData.titulo}
                  onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                  className="text-xl font-semibold border-none p-0 focus-visible:ring-0"
                />
              </div>

              {/* Info Grid */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-4 w-4 text-muted-foreground" />
                  <Label className="w-24 text-muted-foreground">Status</Label>
                  <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  <Label className="w-24 text-muted-foreground">Prioridade</Label>
                  <Select value={formData.prioridade} onValueChange={(v) => setFormData({ ...formData, prioridade: v })}>
                    <SelectTrigger className="flex-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {prioridadeOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Label className="w-24 text-muted-foreground">Meta</Label>
                  <Input
                    type="date"
                    value={formData.data_meta}
                    onChange={(e) => setFormData({ ...formData, data_meta: e.target.value })}
                    className="flex-1"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Label className="w-24 text-muted-foreground">Prazo</Label>
                  <Input
                    type="date"
                    value={formData.data_prazo}
                    onChange={(e) => setFormData({ ...formData, data_prazo: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>

              {/* Descrição */}
              <div>
                <Label className="text-muted-foreground mb-2 flex items-center gap-2">
                  <Edit className="h-4 w-4" />
                  Descrição
                </Label>
                <Textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  placeholder="Adicione uma descrição detalhada..."
                  rows={3}
                />
              </div>

              {/* Checklist */}
              <div>
                <Label className="text-muted-foreground mb-2 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Checklist - Passos da Atividade
                </Label>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={novoChecklistItem}
                    onChange={(e) => setNovoChecklistItem(e.target.value)}
                    placeholder="Adicionar novo passo..."
                    onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                  />
                  <Button variant="outline" size="icon" onClick={handleAddChecklistItem}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {checklist.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum passo adicionado</p>
                  ) : (
                    checklist.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                        <Checkbox
                          checked={item.concluido}
                          onCheckedChange={() => handleToggleChecklistItem(item)}
                        />
                        <span className={`flex-1 ${item.concluido ? 'line-through text-muted-foreground' : ''}`}>
                          {item.descricao}
                        </span>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteChecklistItem(item.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Comentários */}
              <div>
                <Label className="text-muted-foreground mb-2 flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Comentários
                </Label>
                <div className="flex gap-2 mb-3">
                  <Input
                    value={novoComentario}
                    onChange={(e) => setNovoComentario(e.target.value)}
                    placeholder="Adicionar comentário... (@ para mencionar alguém)"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddComentario()}
                  />
                  <Button variant="outline" size="icon" onClick={handleAddComentario}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {comentarios.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum comentário ainda</p>
                  ) : (
                    comentarios.map((c) => (
                      <div key={c.id} className="p-3 rounded-lg bg-muted/30">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                            {(c.usuario?.nome || c.usuario?.email || '?')[0].toUpperCase()}
                          </div>
                          <span className="text-sm font-medium">{c.usuario?.nome || c.usuario?.email}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(parseISO(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </span>
                        </div>
                        <p className="text-sm">{c.texto}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Histórico */}
              <div>
                <Label className="text-muted-foreground mb-2 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Histórico de Alterações
                </Label>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {historico.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma alteração registrada</p>
                  ) : (
                    historico.map((h) => (
                      <div key={h.id} className="flex items-center gap-2 text-sm">
                        <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                          {(h.usuario?.nome || h.usuario?.email || '?')[0].toUpperCase()}
                        </div>
                        <span className="font-medium">{h.usuario?.nome || h.usuario?.email}</span>
                        <span className="text-muted-foreground">{h.acao}</span>
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(h.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdate}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
