import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, DollarSign, Calendar, MoreHorizontal, Edit, Trash2, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

interface Pagamento {
  id: string;
  empresa_id: string;
  cliente_id: string;
  tipo: string;
  valor: number;
  desconto: number;
  valor_final: number;
  data_vencimento: string;
  data_pagamento: string | null;
  status: string;
  metodo_pagamento: string | null;
  observacoes: string | null;
  referencia_mes: number | null;
  referencia_ano: number | null;
  created_at: string;
  clientes?: { nome_empresa: string } | null;
}

interface Cliente {
  id: string;
  nome_empresa: string;
  valor_mensalidade: number | null;
  valor_implantacao: number | null;
  desconto_percentual: number | null;
}

const tiposPagamento = [
  { value: 'mensalidade', label: 'Mensalidade' },
  { value: 'implantacao', label: 'Implantação' },
  { value: 'avulso', label: 'Avulso' },
];

const metodosPagamento = ['PIX', 'Boleto', 'Cartão de Crédito', 'Cartão de Débito', 'Transferência', 'Dinheiro'];

const meses = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function Pagamentos() {
  const { isAdmin } = useAuth();
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTipo, setFilterTipo] = useState<string>('all');
  const [filterMes, setFilterMes] = useState<number>(new Date().getMonth() + 1);
  const [filterAno, setFilterAno] = useState<number>(new Date().getFullYear());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [batchDialogOpen, setBatchDialogOpen] = useState(false);
  const [editingPagamento, setEditingPagamento] = useState<Pagamento | null>(null);

  const currentYear = new Date().getFullYear();
  const anos = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  const [formData, setFormData] = useState({
    cliente_id: '',
    tipo: 'mensalidade',
    valor: 0,
    desconto: 0,
    data_vencimento: new Date().toISOString().split('T')[0],
    data_pagamento: '',
    status: 'pendente',
    metodo_pagamento: '',
    observacoes: '',
    referencia_mes: new Date().getMonth() + 1,
    referencia_ano: currentYear,
  });

  const fetchData = async () => {
    try {
      const [pagamentosRes, clientesRes] = await Promise.all([
        supabase
          .from('pagamentos')
          .select('*, clientes(nome_empresa)')
          .order('data_vencimento', { ascending: false }),
        supabase.from('clientes').select('id, nome_empresa, valor_mensalidade, valor_implantacao, desconto_percentual').eq('status', 'ativo'),
      ]);

      if (pagamentosRes.error) throw pagamentosRes.error;
      if (clientesRes.error) throw clientesRes.error;

      setPagamentos(pagamentosRes.data || []);
      setClientes(clientesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const resetForm = () => {
    setFormData({
      cliente_id: '',
      tipo: 'mensalidade',
      valor: 0,
      desconto: 0,
      data_vencimento: new Date().toISOString().split('T')[0],
      data_pagamento: '',
      status: 'pendente',
      metodo_pagamento: '',
      observacoes: '',
      referencia_mes: new Date().getMonth() + 1,
      referencia_ano: currentYear,
    });
  };

  const handleClienteChange = (clienteId: string) => {
    const cliente = clientes.find(c => c.id === clienteId);
    if (cliente) {
      let valor = 0;
      if (formData.tipo === 'mensalidade') {
        valor = Number(cliente.valor_mensalidade) || 0;
      } else if (formData.tipo === 'implantacao') {
        valor = Number(cliente.valor_implantacao) || 0;
      }
      setFormData({
        ...formData,
        cliente_id: clienteId,
        valor,
        desconto: Number(cliente.desconto_percentual) || 0,
      });
    } else {
      setFormData({ ...formData, cliente_id: clienteId });
    }
  };

  const handleTipoChange = (tipo: string) => {
    const cliente = clientes.find(c => c.id === formData.cliente_id);
    let valor = formData.valor;
    if (cliente) {
      if (tipo === 'mensalidade') {
        valor = Number(cliente.valor_mensalidade) || 0;
      } else if (tipo === 'implantacao') {
        valor = Number(cliente.valor_implantacao) || 0;
      }
    }
    setFormData({ ...formData, tipo, valor });
  };

  const calcularValorFinal = () => {
    return formData.valor - (formData.valor * formData.desconto / 100);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const valorFinal = calcularValorFinal();

      if (editingPagamento) {
        const { error } = await supabase
          .from('pagamentos')
          .update({
            cliente_id: formData.cliente_id,
            tipo: formData.tipo,
            valor: formData.valor,
            desconto: formData.desconto,
            valor_final: valorFinal,
            data_vencimento: formData.data_vencimento,
            data_pagamento: formData.data_pagamento || null,
            status: formData.status,
            metodo_pagamento: formData.metodo_pagamento || null,
            observacoes: formData.observacoes || null,
            referencia_mes: formData.referencia_mes,
            referencia_ano: formData.referencia_ano,
          })
          .eq('id', editingPagamento.id);

        if (error) throw error;
        toast.success('Pagamento atualizado com sucesso!');
      } else {
        // Pegar empresa_id do usuário (pode ser null para admins sem empresa)
        const { data: profile } = await supabase
          .from('usuario_perfil')
          .select('empresa_id')
          .single();

        // Pegar empresa_id do cliente selecionado
        const { data: cliente } = await supabase
          .from('clientes')
          .select('empresa_id')
          .eq('id', formData.cliente_id)
          .single();

        const { error } = await supabase.from('pagamentos').insert({
          empresa_id: cliente?.empresa_id || profile?.empresa_id || null,
          cliente_id: formData.cliente_id,
          tipo: formData.tipo,
          valor: formData.valor,
          desconto: formData.desconto,
          valor_final: valorFinal,
          data_vencimento: formData.data_vencimento,
          data_pagamento: formData.data_pagamento || null,
          status: formData.status,
          metodo_pagamento: formData.metodo_pagamento || null,
          observacoes: formData.observacoes || null,
          referencia_mes: formData.referencia_mes,
          referencia_ano: formData.referencia_ano,
        });

        if (error) throw error;
        toast.success('Pagamento criado com sucesso!');
      }

      setDialogOpen(false);
      setEditingPagamento(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error saving pagamento:', error);
      toast.error(error.message || 'Erro ao salvar pagamento');
    }
  };

  const handleEdit = (pagamento: Pagamento) => {
    setEditingPagamento(pagamento);
    setFormData({
      cliente_id: pagamento.cliente_id,
      tipo: pagamento.tipo,
      valor: pagamento.valor,
      desconto: pagamento.desconto,
      data_vencimento: pagamento.data_vencimento,
      data_pagamento: pagamento.data_pagamento || '',
      status: pagamento.status,
      metodo_pagamento: pagamento.metodo_pagamento || '',
      observacoes: pagamento.observacoes || '',
      referencia_mes: pagamento.referencia_mes || new Date().getMonth() + 1,
      referencia_ano: pagamento.referencia_ano || currentYear,
    });
    setDialogOpen(true);
  };

  const handleMarcarPago = async (pagamento: Pagamento) => {
    try {
      const { error } = await supabase
        .from('pagamentos')
        .update({
          status: 'pago',
          data_pagamento: new Date().toISOString().split('T')[0],
        })
        .eq('id', pagamento.id);

      if (error) throw error;
      toast.success('Pagamento marcado como pago!');
      fetchData();
    } catch (error) {
      console.error('Error updating pagamento:', error);
      toast.error('Erro ao atualizar pagamento');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este pagamento?')) return;

    try {
      const { error } = await supabase.from('pagamentos').delete().eq('id', id);
      if (error) throw error;
      toast.success('Pagamento excluído com sucesso!');
      fetchData();
    } catch (error) {
      console.error('Error deleting pagamento:', error);
      toast.error('Erro ao excluir pagamento');
    }
  };

  const handleBatchGenerate = async (mes: number, ano: number, diaVencimento: number) => {
    try {
      setLoading(true);
      
      // Obter clientes ativos com mensalidade > 0
      const { data: activeClients, error: clientsError } = await supabase
        .from('clientes')
        .select('*')
        .eq('status', 'ativo')
        .gt('valor_mensalidade', 0);

      if (clientsError) throw clientsError;

      if (!activeClients || activeClients.length === 0) {
        toast.info('Nenhum cliente ativo com mensalidade configurada encontrado.');
        return;
      }

      // Obter pagamentos já existentes para este mês/ano/tipo mensalidade
      const { data: existingPayments, error: paymentsError } = await supabase
        .from('pagamentos')
        .select('cliente_id')
        .eq('tipo', 'mensalidade')
        .eq('referencia_mes', mes)
        .eq('referencia_ano', ano);

      if (paymentsError) throw paymentsError;

      const existingClientIds = new Set(existingPayments?.map(p => p.cliente_id) || []);
      
      const clientsToGenerate = activeClients.filter(c => !existingClientIds.has(c.id));

      if (clientsToGenerate.length === 0) {
        toast.info('Todos os pagamentos para este mês já foram gerados.');
        return;
      }

      // Preparar inserts
      const vDate = new Date(ano, mes - 1, diaVencimento);
      const formattedVDate = vDate.toISOString().split('T')[0];

      const inserts = clientsToGenerate.map(cliente => {
        const valor = Number(cliente.valor_mensalidade) || 0;
        const desconto = Number(cliente.desconto_percentual) || 0;
        const valorFinal = valor - (valor * desconto / 100);

        return {
          empresa_id: cliente.empresa_id,
          cliente_id: cliente.id,
          tipo: 'mensalidade',
          valor,
          desconto,
          valor_final: valorFinal,
          data_vencimento: formattedVDate,
          status: 'pendente',
          referencia_mes: mes,
          referencia_ano: ano,
        };
      });

      const { error: insertError } = await supabase.from('pagamentos').insert(inserts);

      if (insertError) throw insertError;

      toast.success(`${inserts.length} pagamentos gerados com sucesso!`);
      setBatchDialogOpen(false);
      fetchData();
    } catch (error: any) {
      console.error('Error generating batch payments:', error);
      toast.error(error.message || 'Erro ao gerar pagamentos em lote');
    } finally {
      setLoading(false);
    }
  };

  const filteredPagamentos = pagamentos.filter((pagamento) => {
    const matchesSearch = !searchTerm || pagamento.clientes?.nome_empresa?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || pagamento.status === filterStatus;
    const matchesTipo = filterTipo === 'all' || pagamento.tipo === filterTipo;
    const matchesMes = pagamento.referencia_mes === filterMes || (!pagamento.referencia_mes && new Date(pagamento.data_vencimento).getMonth() + 1 === filterMes);
    const matchesAno = pagamento.referencia_ano === filterAno || (!pagamento.referencia_ano && new Date(pagamento.data_vencimento).getFullYear() === filterAno);
    return matchesSearch && matchesStatus && matchesTipo && matchesMes && matchesAno;
  });

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; icon: React.ReactNode; className: string }> = {
      pago: { label: 'Pago', icon: <CheckCircle className="h-3 w-3" />, className: 'bg-success/10 text-success border-success/20' },
      pendente: { label: 'Pendente', icon: <Clock className="h-3 w-3" />, className: 'bg-warning/10 text-warning border-warning/20' },
      atrasado: { label: 'Atrasado', icon: <AlertTriangle className="h-3 w-3" />, className: 'bg-destructive/10 text-destructive border-destructive/20' },
      cancelado: { label: 'Cancelado', icon: null, className: 'bg-muted text-muted-foreground' },
    };
    const statusConfig = config[status] || config.pendente;
    return (
      <Badge variant="outline" className={`flex items-center gap-1 ${statusConfig.className}`}>
        {statusConfig.icon}
        {statusConfig.label}
      </Badge>
    );
  };

  // Calcular totais
  const totalRecebido = filteredPagamentos.filter(p => p.status === 'pago').reduce((acc, p) => acc + p.valor_final, 0);
  const totalPendente = filteredPagamentos.filter(p => p.status === 'pendente').reduce((acc, p) => acc + p.valor_final, 0);
  const totalAtrasado = filteredPagamentos.filter(p => p.status === 'atrasado').reduce((acc, p) => acc + p.valor_final, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="page-header">
          <h1 className="page-title">Pagamentos</h1>
          <p className="page-description">Controle financeiro de mensalidades e implantações</p>
        </div>

        {isAdmin && (
          <div className="flex gap-2">
            <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <DollarSign className="mr-2 h-4 w-4" />
                  Gerar Mensalidades
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>Gerar Mensalidades em Lote</DialogTitle>
                  <DialogDescription>
                    Gera automaticamente cobranças de mensalidade para todos os clientes ativos com base no valor configurado em seus perfis.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Mês de Referência</Label>
                      <Select defaultValue={String(new Date().getMonth() + 1)} id="batch-month">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {meses.map((mes) => (
                            <SelectItem key={mes.value} value={String(mes.value)}>{mes.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Ano de Referência</Label>
                      <Select defaultValue={String(new Date().getFullYear())} id="batch-year">
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {anos.map((ano) => (
                            <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Dia de Vencimento</Label>
                    <Input type="number" min="1" max="31" defaultValue="10" id="batch-day" />
                    <p className="text-xs text-muted-foreground">O sistema criará apenas pagamentos que ainda não existem para o mês/ano selecionado.</p>
                  </div>
                </div>
                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setBatchDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={() => {
                    const mes = parseInt((document.getElementById('batch-month') as any)?.value || new Date().getMonth() + 1);
                    const ano = parseInt((document.getElementById('batch-year') as any)?.value || new Date().getFullYear());
                    const dia = parseInt((document.getElementById('batch-day') as any)?.value || 10);
                    handleBatchGenerate(mes, ano, dia);
                  }}>Gerar Agora</Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingPagamento(null); resetForm(); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Pagamento
                </Button>
              </DialogTrigger>
            <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingPagamento ? 'Editar Pagamento' : 'Novo Pagamento'}</DialogTitle>
                <DialogDescription>
                  {editingPagamento ? 'Atualize as informações do pagamento' : 'Registre um novo pagamento'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <Select value={formData.cliente_id} onValueChange={handleClienteChange} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cliente" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes.map((cliente) => (
                        <SelectItem key={cliente.id} value={cliente.id}>
                          {cliente.nome_empresa}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tipo *</Label>
                    <Select value={formData.tipo} onValueChange={handleTipoChange}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposPagamento.map((tipo) => (
                          <SelectItem key={tipo.value} value={tipo.value}>{tipo.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={formData.status} onValueChange={(v) => setFormData({ ...formData, status: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pendente">Pendente</SelectItem>
                        <SelectItem value="pago">Pago</SelectItem>
                        <SelectItem value="atrasado">Atrasado</SelectItem>
                        <SelectItem value="cancelado">Cancelado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.valor}
                      onChange={(e) => setFormData({ ...formData, valor: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Desconto (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.desconto}
                      onChange={(e) => setFormData({ ...formData, desconto: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Valor Final</Label>
                    <div className="h-10 flex items-center px-3 rounded-md border bg-muted text-sm font-medium">
                      {formatCurrency(calcularValorFinal())}
                    </div>
                  </div>
                </div>

                {formData.tipo === 'mensalidade' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Mês Referência</Label>
                      <Select
                        value={String(formData.referencia_mes)}
                        onValueChange={(v) => setFormData({ ...formData, referencia_mes: parseInt(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {meses.map((mes) => (
                            <SelectItem key={mes.value} value={String(mes.value)}>{mes.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Ano Referência</Label>
                      <Select
                        value={String(formData.referencia_ano)}
                        onValueChange={(v) => setFormData({ ...formData, referencia_ano: parseInt(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {anos.map((ano) => (
                            <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data Vencimento *</Label>
                    <Input
                      type="date"
                      value={formData.data_vencimento}
                      onChange={(e) => setFormData({ ...formData, data_vencimento: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data Pagamento</Label>
                    <Input
                      type="date"
                      value={formData.data_pagamento}
                      onChange={(e) => setFormData({ ...formData, data_pagamento: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Método de Pagamento</Label>
                  <Select value={formData.metodo_pagamento} onValueChange={(v) => setFormData({ ...formData, metodo_pagamento: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {metodosPagamento.map((metodo) => (
                        <SelectItem key={metodo} value={metodo}>{metodo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Observações</Label>
                  <Textarea
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingPagamento ? 'Salvar' : 'Criar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
            </Dialog>
          </div>
        )}
      </motion.div>

      {/* Summary Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid gap-4 md:grid-cols-3"
      >
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Recebido</p>
                <p className="text-2xl font-bold text-success">{formatCurrency(totalRecebido)}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-success/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pendente</p>
                <p className="text-2xl font-bold text-warning">{formatCurrency(totalPendente)}</p>
              </div>
              <Clock className="h-8 w-8 text-warning/20" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Atrasado</p>
                <p className="text-2xl font-bold text-destructive">{formatCurrency(totalAtrasado)}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-destructive/20" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por cliente..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={String(filterMes)} onValueChange={(v) => setFilterMes(parseInt(v))}>
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {meses.map((mes) => (
                      <SelectItem key={mes.value} value={String(mes.value)}>{mes.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(filterAno)} onValueChange={(v) => setFilterAno(parseInt(v))}>
                  <SelectTrigger className="w-full sm:w-[120px]">
                    <SelectValue placeholder="Ano" />
                  </SelectTrigger>
                  <SelectContent>
                    {anos.map((ano) => (
                      <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col sm:flex-row gap-4">
                <Select value={filterTipo} onValueChange={setFilterTipo}>
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos tipos</SelectItem>
                    {tiposPagamento.map((tipo) => (
                      <SelectItem key={tipo.value} value={tipo.value}>{tipo.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full sm:w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="pago">Pago</SelectItem>
                    <SelectItem value="atrasado">Atrasado</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Referência</th>
                    <th>Valor</th>
                    <th>Vencimento</th>
                    <th>Status</th>
                    <th className="w-[50px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted-foreground">
                        Carregando...
                      </td>
                    </tr>
                  ) : filteredPagamentos.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-muted-foreground">
                        Nenhum pagamento encontrado
                      </td>
                    </tr>
                  ) : (
                    filteredPagamentos.map((pagamento) => (
                      <tr key={pagamento.id}>
                        <td className="font-medium">{pagamento.clientes?.nome_empresa || '-'}</td>
                        <td>
                          <Badge variant="outline">
                            {tiposPagamento.find(t => t.value === pagamento.tipo)?.label}
                          </Badge>
                        </td>
                        <td>
                          {pagamento.tipo === 'mensalidade' && pagamento.referencia_mes && pagamento.referencia_ano ? (
                            <span className="text-sm">
                              {meses.find(m => m.value === pagamento.referencia_mes)?.label}/{pagamento.referencia_ano}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                        <td>
                          <div className="text-sm">
                            <span className="font-medium">{formatCurrency(pagamento.valor_final)}</span>
                            {pagamento.desconto > 0 && (
                              <span className="text-xs text-muted-foreground ml-1">
                                (-{pagamento.desconto}%)
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-2 text-sm">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            {format(new Date(pagamento.data_vencimento), 'dd/MM/yyyy', { locale: ptBR })}
                          </div>
                        </td>
                        <td>{getStatusBadge(pagamento.status)}</td>
                        <td>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {pagamento.status === 'pendente' && (
                                <DropdownMenuItem onClick={() => handleMarcarPago(pagamento)}>
                                  <CheckCircle className="mr-2 h-4 w-4 text-success" />
                                  Marcar como Pago
                                </DropdownMenuItem>
                              )}
                              {isAdmin && (
                                <>
                                  <DropdownMenuItem onClick={() => handleEdit(pagamento)}>
                                    <Edit className="mr-2 h-4 w-4" />
                                    Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleDelete(pagamento.id)}
                                    className="text-destructive"
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Excluir
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!loading && filteredPagamentos.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/50 font-semibold border-t-2">
                      <td colSpan={3} className="text-right pr-4">
                        Total ({filteredPagamentos.length} pagamentos):
                      </td>
                      <td className="text-success">
                        {formatCurrency(filteredPagamentos.reduce((acc, p) => acc + p.valor_final, 0))}
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
