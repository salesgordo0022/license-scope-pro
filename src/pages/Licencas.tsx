import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Key, Calendar, MoreHorizontal, Edit, Trash2, DollarSign } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type StatusType = Database['public']['Enums']['status_type'];
type Cliente = Database['public']['Tables']['clientes']['Row'];

interface Licenca {
  id: string;
  empresa_id: string | null;
  cliente_id: string;
  tipo: string;
  quantidade: number | null;
  validade: string | null;
  status: StatusType | null;
  created_at: string | null;
  data_inicio: string | null;
  dia_vencimento: number | null;
  valor_custo: number | null;
  valor_venda: number | null;
  data_pagamento_sistema: string | null;
  modelo_cobranca: string | null;
  clientes?: { nome_empresa: string } | null;
}

const tiposLicenca = ['Anual', 'Mensal', 'Perpétua', 'Trial', 'Enterprise'];

export default function Licencas() {
  const [licencas, setLicencas] = useState<Licenca[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLicenca, setEditingLicenca] = useState<Licenca | null>(null);

  const [formData, setFormData] = useState({
    cliente_id: '',
    tipo: '',
    quantidade: 1,
    validade: '',
    status: 'ativo' as StatusType,
    data_inicio: new Date().toISOString().split('T')[0],
    dia_vencimento: 10,
    valor_custo: 0,
    valor_venda: 0,
    data_pagamento_sistema: '',
    modelo_cobranca: 'saas_full',
  });

  const fetchData = async () => {
    try {
      const [licencasRes, clientesRes] = await Promise.all([
        supabase
          .from('licencas')
          .select('*, clientes(nome_empresa)')
          .order('created_at', { ascending: false }),
        supabase.from('clientes').select('*').eq('status', 'ativo'),
      ]);

      if (licencasRes.error) throw licencasRes.error;
      if (clientesRes.error) throw clientesRes.error;

      // Cast to include new fields
      setLicencas((licencasRes.data || []) as unknown as Licenca[]);
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

  const gerarPagamentoMensal = async (licenca: {
    cliente_id: string;
    empresa_id: string | null;
    valor_venda: number;
    dia_vencimento: number;
  }) => {
    const hoje = new Date();
    const mesAtual = hoje.getMonth() + 1;
    const anoAtual = hoje.getFullYear();
    const diaVenc = licenca.dia_vencimento;

    // Gerar vencimento para o mês atual
    const dataVencimento = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-${String(diaVenc).padStart(2, '0')}`;

    const { error } = await supabase.from('pagamentos').insert({
      cliente_id: licenca.cliente_id,
      empresa_id: licenca.empresa_id,
      tipo: 'mensalidade',
      valor: licenca.valor_venda,
      desconto: 0,
      valor_final: licenca.valor_venda,
      data_vencimento: dataVencimento,
      status: 'pendente',
      referencia_mes: mesAtual,
      referencia_ano: anoAtual,
    });

    if (error) {
      console.error('Erro ao gerar pagamento:', error);
      toast.error('Licença criada, mas houve erro ao gerar pagamento');
    } else {
      toast.success('Pagamento mensal gerado automaticamente!');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingLicenca) {
        const { error } = await supabase
          .from('licencas')
          .update({
            cliente_id: formData.cliente_id,
            tipo: formData.tipo,
            quantidade: formData.quantidade,
            validade: formData.validade || null,
            status: formData.status,
            data_inicio: formData.data_inicio || null,
            dia_vencimento: formData.dia_vencimento,
            valor_custo: formData.valor_custo,
            valor_venda: formData.valor_venda,
            data_pagamento_sistema: formData.data_pagamento_sistema || null,
            modelo_cobranca: formData.modelo_cobranca,
          } as any)
          .eq('id', editingLicenca.id);

        if (error) throw error;
        toast.success('Licença atualizada com sucesso!');
      } else {
        const { data: profile } = await supabase
          .from('usuario_perfil')
          .select('empresa_id')
          .single();

        const { data: cliente } = await supabase
          .from('clientes')
          .select('empresa_id')
          .eq('id', formData.cliente_id)
          .single();

        const empresaId = cliente?.empresa_id || profile?.empresa_id || null;

        const { error } = await supabase.from('licencas').insert({
          empresa_id: empresaId,
          cliente_id: formData.cliente_id,
          tipo: formData.tipo,
          quantidade: formData.quantidade,
          validade: formData.validade || null,
          status: formData.status,
          data_inicio: formData.data_inicio || null,
          dia_vencimento: formData.dia_vencimento,
          valor_custo: formData.valor_custo,
          valor_venda: formData.valor_venda,
          data_pagamento_sistema: formData.data_pagamento_sistema || null,
          modelo_cobranca: formData.modelo_cobranca,
        } as any);

        if (error) throw error;
        toast.success('Licença criada com sucesso!');

        // Gerar pagamento automaticamente com valor de venda
        if (formData.valor_venda > 0) {
          await gerarPagamentoMensal({
            cliente_id: formData.cliente_id,
            empresa_id: empresaId,
            valor_venda: formData.valor_venda,
            dia_vencimento: formData.dia_vencimento,
          });
        }
      }

      setDialogOpen(false);
      setEditingLicenca(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      console.error('Error saving licenca:', error);
      toast.error(error.message || 'Erro ao salvar licença');
    }
  };

  const resetForm = () => {
    setFormData({
      cliente_id: '',
      tipo: '',
      quantidade: 1,
      validade: '',
      status: 'ativo',
      data_inicio: new Date().toISOString().split('T')[0],
      dia_vencimento: 10,
      valor_custo: 0,
      valor_venda: 0,
      data_pagamento_sistema: '',
      modelo_cobranca: 'saas_full',
    });
  };

  const handleEdit = (licenca: Licenca) => {
    setEditingLicenca(licenca);
    setFormData({
      cliente_id: licenca.cliente_id,
      tipo: licenca.tipo,
      quantidade: licenca.quantidade || 1,
      validade: licenca.validade || '',
      status: licenca.status || 'ativo',
      data_inicio: licenca.data_inicio || '',
      dia_vencimento: licenca.dia_vencimento || 10,
      valor_custo: licenca.valor_custo || 0,
      valor_venda: licenca.valor_venda || 0,
      data_pagamento_sistema: licenca.data_pagamento_sistema || '',
      modelo_cobranca: licenca.modelo_cobranca || 'saas_full',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta licença?')) return;

    try {
      const { error } = await supabase.from('licencas').delete().eq('id', id);
      if (error) throw error;
      toast.success('Licença excluída com sucesso!');
      fetchData();
    } catch (error) {
      console.error('Error deleting licenca:', error);
      toast.error('Erro ao excluir licença');
    }
  };

  const filteredLicencas = licencas.filter((licenca) => {
    const matchesSearch =
      licenca.clientes?.nome_empresa?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      licenca.tipo.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || licenca.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string | null, validade: string | null) => {
    if (validade) {
      const hoje = new Date();
      const dataValidade = new Date(validade);
      if (dataValidade < hoje && status === 'ativo') {
        return <span className="status-badge status-vencido">vencido</span>;
      }
    }
    const statusConfig: Record<string, string> = {
      ativo: 'status-ativo',
      inativo: 'status-inativo',
      pendente: 'status-pendente',
      vencido: 'status-vencido',
    };
    return (
      <span className={`status-badge ${statusConfig[status || 'ativo']}`}>
        {status || 'ativo'}
      </span>
    );
  };

  const isExpiringSoon = (validade: string | null) => {
    if (!validade) return false;
    const hoje = new Date();
    const dataValidade = new Date(validade);
    const diff = dataValidade.getTime() - hoje.getTime();
    const dias = diff / (1000 * 60 * 60 * 24);
    return dias > 0 && dias <= 30;
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="page-header">
          <h1 className="page-title">Licenças</h1>
          <p className="page-description">Gerencie as licenças de software dos seus clientes</p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingLicenca(null); resetForm(); }}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Licença
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingLicenca ? 'Editar Licença' : 'Nova Licença'}</DialogTitle>
              <DialogDescription>
                {editingLicenca ? 'Atualize as informações da licença' : 'Crie uma nova licença para um cliente. Um pagamento será gerado automaticamente.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="cliente">Cliente *</Label>
                <Select
                  value={formData.cliente_id}
                  onValueChange={(value) => setFormData({ ...formData, cliente_id: value })}
                  required
                >
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
                  <Label htmlFor="tipo">Tipo *</Label>
                  <Select
                    value={formData.tipo}
                    onValueChange={(value) => setFormData({ ...formData, tipo: value })}
                    required
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {tiposLicenca.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantidade">Quantidade</Label>
                  <Input
                    id="quantidade"
                    type="number"
                    min={1}
                    value={formData.quantidade}
                    onChange={(e) => setFormData({ ...formData, quantidade: parseInt(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="data_inicio">Data Início *</Label>
                  <Input
                    id="data_inicio"
                    type="date"
                    value={formData.data_inicio}
                    onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validade">Validade</Label>
                  <Input
                    id="validade"
                    type="date"
                    value={formData.validade}
                    onChange={(e) => setFormData({ ...formData, validade: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="dia_vencimento">Dia Vencimento (mês)</Label>
                  <Input
                    id="dia_vencimento"
                    type="number"
                    min={1}
                    max={28}
                    value={formData.dia_vencimento}
                    onChange={(e) => setFormData({ ...formData, dia_vencimento: parseInt(e.target.value) || 10 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="valor_custo">Valor Custo (R$)</Label>
                  <Input
                    id="valor_custo"
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.valor_custo}
                    onChange={(e) => setFormData({ ...formData, valor_custo: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="valor_venda">Valor Venda (R$)</Label>
                <Input
                  id="valor_venda"
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.valor_venda}
                  onChange={(e) => setFormData({ ...formData, valor_venda: parseFloat(e.target.value) || 0 })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="modelo_cobranca">Modelo de Cobrança *</Label>
                  <Select
                    value={formData.modelo_cobranca}
                    onValueChange={(value) => setFormData({ ...formData, modelo_cobranca: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pre_pago">Pré-pago</SelectItem>
                      <SelectItem value="saas_full">SaaS Full</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="data_pagamento_sistema">Data de Pagamento do Sistema</Label>
                  <Input
                    id="data_pagamento_sistema"
                    type="date"
                    value={formData.data_pagamento_sistema}
                    onChange={(e) => setFormData({ ...formData, data_pagamento_sistema: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as StatusType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ativo">Ativo</SelectItem>
                    <SelectItem value="inativo">Inativo</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="vencido">Vencido</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingLicenca ? 'Salvar' : 'Criar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por cliente ou tipo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="vencido">Vencido</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Tipo</th>
                    <th>Qtd</th>
                    <th>Início</th>
                    <th>Dia Venc.</th>
                    <th>Valor Custo</th>
                    <th>Valor Venda</th>
                    <th>Validade</th>
                    <th>Status</th>
                    <th className="w-[50px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="text-center py-8 text-muted-foreground">
                        Carregando...
                      </td>
                    </tr>
                  ) : filteredLicencas.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-8 text-muted-foreground">
                        Nenhuma licença encontrada
                      </td>
                    </tr>
                  ) : (
                    filteredLicencas.map((licenca) => (
                      <tr key={licenca.id}>
                        <td className="font-medium">{licenca.clientes?.nome_empresa || '-'}</td>
                        <td>
                          <div className="flex items-center gap-2">
                            <Key className="h-4 w-4 text-muted-foreground" />
                            <Badge variant="outline">{licenca.tipo}</Badge>
                          </div>
                        </td>
                        <td>{licenca.quantidade}</td>
                        <td>
                          {licenca.data_inicio
                            ? format(new Date(licenca.data_inicio), 'dd/MM/yyyy', { locale: ptBR })
                            : '-'}
                        </td>
                        <td>
                          <Badge variant="secondary">Dia {licenca.dia_vencimento || 10}</Badge>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{formatCurrency(licenca.valor_custo)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{formatCurrency(licenca.valor_venda)}</span>
                          </div>
                        </td>
                        <td>
                          {licenca.validade ? (
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className={isExpiringSoon(licenca.validade) ? 'text-warning font-medium' : ''}>
                                {format(new Date(licenca.validade), 'dd/MM/yyyy', { locale: ptBR })}
                              </span>
                              {isExpiringSoon(licenca.validade) && (
                                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                                  Vencendo
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Sem validade</span>
                          )}
                        </td>
                        <td>{getStatusBadge(licenca.status, licenca.validade)}</td>
                        <td>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(licenca)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(licenca.id)}
                                className="text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {!loading && filteredLicencas.length > 0 && (
                  <tfoot>
                    <tr className="bg-muted/50 font-semibold border-t-2">
                      <td colSpan={2} className="text-right pr-4">
                        Total ({filteredLicencas.length} licenças):
                      </td>
                      <td>
                        {filteredLicencas.reduce((acc, l) => acc + (l.quantidade || 0), 0)} unid.
                      </td>
                      <td colSpan={2}></td>
                      <td>
                        {formatCurrency(filteredLicencas.reduce((acc, l) => acc + (l.valor_custo || 0), 0))}
                      </td>
                      <td>
                        {formatCurrency(filteredLicencas.reduce((acc, l) => acc + (l.valor_venda || 0), 0))}
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
