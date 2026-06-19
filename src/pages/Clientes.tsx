import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Filter, MoreHorizontal, Mail, Phone, Edit, Trash2, DollarSign, FileText, Loader2, MessageCircle, Users, Download, Tag, Monitor } from 'lucide-react';
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
import type { Database } from '@/integrations/supabase/types';
import { GrupoClienteManager } from '@/components/GrupoClienteManager';

interface Grupo {
  id: string;
  nome: string;
  cor: string;
}

type Cliente = Database['public']['Tables']['clientes']['Row'];
type StatusType = Database['public']['Enums']['status_type'];

interface Segmento {
  id: string;
  nome: string;
}

interface Sistema {
  id: string;
  nome: string;
}

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

export default function Clientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [sistemas, setSistemas] = useState<Sistema[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSegmento, setFilterSegmento] = useState<string>('all');
  const [filterGrupo, setFilterGrupo] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('ativo');
  const [filterSistema, setFilterSistema] = useState<string>('all');
  const [sistemasPorCliente, setSistemasPorCliente] = useState<Record<string, string[]>>({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappCliente, setWhatsappCliente] = useState<Cliente | null>(null);
  const [whatsappMsg, setWhatsappMsg] = useState('');
  const [enviandoWhatsapp, setEnviandoWhatsapp] = useState(false);

  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  };

  const buscarCnpj = async (cnpjRaw: string) => {
    const digits = cnpjRaw.replace(/\D/g, '');
    if (digits.length !== 14) {
      toast.error('CNPJ deve ter 14 dígitos');
      return;
    }
    setBuscandoCnpj(true);
    try {
      const { data, error } = await supabase.functions.invoke('buscar-cnpj', {
        body: { cnpj: digits },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setFormData(prev => ({
        ...prev,
        nome_empresa: prev.nome_empresa || data.razao_social || '',
        email: prev.email || data.email || '',
        telefone: prev.telefone || data.telefone || '',
        endereco: [data.logradouro, data.numero, data.complemento, data.bairro].filter(Boolean).join(', '),
        cidade: data.municipio || '',
        estado: data.uf || '',
      }));
      toast.success('Dados do CNPJ carregados!');
    } catch {
      toast.error('Erro ao buscar CNPJ. Tente novamente.');
    } finally {
      setBuscandoCnpj(false);
    }
  };

  // Form state
  const [formData, setFormData] = useState({
    nome_empresa: '',
    segmento: '',
    grupo_id: '',
    email: '',
    telefone: '',
    status: 'ativo' as StatusType,
    observacoes: '',
    valor_mensalidade: 0,
    valor_implantacao: 0,
    desconto_percentual: 0,
    cnpj: '',
    nome_dono: '',
    cpf_dono: '',
    endereco: '',
    cidade: '',
    estado: '',
    data_entrada: '',
    regime_tributario: '',
    sistemasSelecionados: [] as string[], // nomes dos sistemas
  });


  const fetchSegmentos = async () => {
    try {
      const { data, error } = await supabase
        .from('segmentos')
        .select('id, nome')
        .order('nome');
      
      if (error) throw error;
      setSegmentos(data || []);
    } catch (error) {
      console.error('Error fetching segmentos:', error);
    }
  };

  const fetchSistemas = async () => {
    try {
      const { data, error } = await supabase
        .from('sistemas')
        .select('id, nome')
        .eq('ativo', true)
        .order('nome');
      if (error) throw error;
      setSistemas(data || []);
    } catch (error) {
      console.error('Error fetching sistemas:', error);
    }
  };

  const fetchGrupos = async () => {
    try {
      const { data, error } = await supabase
        .from('grupos_clientes')
        .select('id, nome, cor')
        .order('nome');
      if (error) throw error;
      setGrupos(data || []);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  const fetchClientes = async () => {
    try {
      let query = supabase.from('clientes').select('*').order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;
      setClientes(data || []);

      // Buscar sistemas (licenças) de cada cliente
      const ids = (data || []).map((c) => c.id);
      if (ids.length > 0) {
        const { data: lics } = await supabase
          .from('licencas')
          .select('cliente_id, tipo')
          .eq('status', 'ativo' as StatusType)
          .in('cliente_id', ids);
        const map: Record<string, string[]> = {};
        (lics || []).forEach((l: any) => {
          if (!map[l.cliente_id]) map[l.cliente_id] = [];
          if (l.tipo && !map[l.cliente_id].includes(l.tipo)) {
            map[l.cliente_id].push(l.tipo);
          }
        });
        setSistemasPorCliente(map);
      }
    } catch (error) {
      console.error('Error fetching clientes:', error);
      toast.error('Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientes();
    fetchSegmentos();
    fetchSistemas();
    fetchGrupos();
  }, []);

  const resetForm = () => {
    setFormData({
      nome_empresa: '',
      segmento: '',
      grupo_id: '',
      email: '',
      telefone: '',
      status: 'ativo',
      observacoes: '',
      valor_mensalidade: 0,
      valor_implantacao: 0,
      desconto_percentual: 0,
      cnpj: '',
      nome_dono: '',
      cpf_dono: '',
      endereco: '',
      cidade: '',
      estado: '',
      data_entrada: '',
      regime_tributario: '',
      sistemasSelecionados: [],
    });

  };

  const sincronizarSistemas = async (clienteId: string, empresaId: string | null, sistemasNomes: string[]) => {
    // Remove licenças que não estão mais selecionadas
    const { data: existentes } = await supabase
      .from('licencas')
      .select('id, tipo')
      .eq('cliente_id', clienteId);

    const aRemover = (existentes || []).filter((l: any) => !sistemasNomes.includes(l.tipo));
    const tiposExistentes = (existentes || []).map((l: any) => l.tipo);
    const aAdicionar = sistemasNomes.filter((nome) => !tiposExistentes.includes(nome));

    if (aRemover.length > 0) {
      await supabase.from('licencas').delete().in('id', aRemover.map((l: any) => l.id));
    }
    if (aAdicionar.length > 0) {
      await supabase.from('licencas').insert(
        aAdicionar.map((nome) => ({
          cliente_id: clienteId,
          empresa_id: empresaId,
          tipo: nome,
          modelo_cobranca: 'saas',
          status: 'ativo' as StatusType,
        }))
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { sistemasSelecionados, ...clienteDataRaw } = formData;
      const clienteData = {
        ...clienteDataRaw,
        grupo_id: clienteDataRaw.grupo_id === 'none' || clienteDataRaw.grupo_id === '' ? null : clienteDataRaw.grupo_id
      };

      if (editingCliente) {
        const { error } = await supabase
          .from('clientes')
          .update(clienteData)
          .eq('id', editingCliente.id);

        if (error) throw error;
        await sincronizarSistemas(editingCliente.id, editingCliente.empresa_id, sistemasSelecionados);
        toast.success('Cliente atualizado com sucesso!');
      } else {
        // Tentar pegar empresa_id do usuário, mas não é obrigatório
        const { data: profile } = await supabase
          .from('usuario_perfil')
          .select('empresa_id')
          .single();

        const empresaId = profile?.empresa_id || null;

        // Criar cliente
        const { data: novoCliente, error } = await supabase.from('clientes').insert({
          ...clienteData,
          empresa_id: empresaId,
        }).select().single();

        if (error) throw error;

        // Criar pagamentos automaticamente se houver valores
        const pagamentosParaCriar = [];
        const hoje = new Date();
        const dataVencimento = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 10); // Vencimento dia 10 do próximo mês
        const descontoDecimal = formData.desconto_percentual / 100;

        // Pagamento de implantação
        if (formData.valor_implantacao > 0) {
          const valorFinalImplantacao = formData.valor_implantacao * (1 - descontoDecimal);
          pagamentosParaCriar.push({
            cliente_id: novoCliente.id,
            empresa_id: empresaId,
            tipo: 'implantacao',
            valor: formData.valor_implantacao,
            desconto: formData.desconto_percentual,
            valor_final: valorFinalImplantacao,
            data_vencimento: dataVencimento.toISOString().split('T')[0],
            status: 'pendente',
            referencia_mes: hoje.getMonth() + 1,
            referencia_ano: hoje.getFullYear(),
          });
        }

        // Pagamento de mensalidade - sem desconto
        if (formData.valor_mensalidade > 0) {
          pagamentosParaCriar.push({
            cliente_id: novoCliente.id,
            empresa_id: empresaId,
            tipo: 'mensalidade',
            valor: formData.valor_mensalidade,
            desconto: 0,
            valor_final: formData.valor_mensalidade,
            data_vencimento: dataVencimento.toISOString().split('T')[0],
            status: 'pendente',
            referencia_mes: hoje.getMonth() + 1,
            referencia_ano: hoje.getFullYear(),
          });
        }

        // Inserir pagamentos se houver
        if (pagamentosParaCriar.length > 0) {
          const { error: pagError } = await supabase.from('pagamentos').insert(pagamentosParaCriar);
          if (pagError) {
            console.error('Erro ao criar pagamentos:', pagError);
            toast.warning('Cliente criado, mas houve erro ao gerar pagamentos');
          } else {
            toast.success(`Cliente criado com ${pagamentosParaCriar.length} pagamento(s) gerado(s)!`);
          }
        } else {
          toast.success('Cliente criado com sucesso!');
        }

        // Sincronizar sistemas selecionados (cria licenças)
        if (sistemasSelecionados.length > 0) {
          await sincronizarSistemas(novoCliente.id, empresaId, sistemasSelecionados);
        }
      }

      setDialogOpen(false);
      setEditingCliente(null);
      resetForm();
      fetchClientes();
    } catch (error: any) {
      console.error('Error saving cliente:', error);
      toast.error(error.message || 'Erro ao salvar cliente');
    }
  };

  const handleEdit = async (cliente: Cliente) => {
    setEditingCliente(cliente);
    // Buscar sistemas atuais do cliente
    const { data: lics } = await supabase
      .from('licencas')
      .select('tipo')
      .eq('cliente_id', cliente.id);
    const sistemasAtuais = Array.from(new Set((lics || []).map((l: any) => l.tipo).filter(Boolean)));

    setFormData({
      nome_empresa: cliente.nome_empresa,
      segmento: cliente.segmento || '',
      grupo_id: (cliente as any).grupo_id || '',
      email: cliente.email || '',
      telefone: cliente.telefone || '',
      status: cliente.status || 'ativo',
      observacoes: cliente.observacoes || '',
      valor_mensalidade: Number(cliente.valor_mensalidade) || 0,
      valor_implantacao: Number(cliente.valor_implantacao) || 0,
      desconto_percentual: Number(cliente.desconto_percentual) || 0,
      cnpj: (cliente as any).cnpj || '',
      nome_dono: (cliente as any).nome_dono || '',
      cpf_dono: (cliente as any).cpf_dono || '',
      endereco: (cliente as any).endereco || '',
      cidade: (cliente as any).cidade || '',
      estado: (cliente as any).estado || '',
      data_entrada: (cliente as any).data_entrada || '',
      regime_tributario: (cliente as any).regime_tributario || '',
      sistemasSelecionados: sistemasAtuais,

    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este cliente?')) return;

    try {
      const { error } = await supabase.from('clientes').delete().eq('id', id);
      if (error) throw error;
      toast.success('Cliente excluído com sucesso!');
      fetchClientes();
    } catch (error) {
      console.error('Error deleting cliente:', error);
      toast.error('Erro ao excluir cliente');
    }
  };

  const handleEnviarWhatsapp = (cliente: Cliente) => {
    if (!cliente.telefone) {
      toast.error('Cliente sem telefone cadastrado');
      return;
    }
    setWhatsappCliente(cliente);
    setWhatsappMsg(`Olá, ${cliente.nome_empresa}! `);
    setWhatsappOpen(true);
  };

  const enviarWhatsapp = async () => {
    if (!whatsappCliente || !whatsappMsg.trim()) return;
    setEnviandoWhatsapp(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          telefone: whatsappCliente.telefone,
          mensagem: whatsappMsg,
          cliente_id: whatsappCliente.id,
        },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data.error || 'Falha no envio');
      toast.success('Mensagem enviada!');
      setWhatsappOpen(false);
      setWhatsappMsg('');
      setWhatsappCliente(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar';
      toast.error(msg);
    } finally {
      setEnviandoWhatsapp(false);
    }
  };

  const filteredClientes = clientes.filter((cliente) => {
    const matchesSearch =
      cliente.nome_empresa.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cliente.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSegmento = filterSegmento === 'all' || cliente.segmento === filterSegmento;
    const matchesGrupo = filterGrupo === 'all' || (cliente as any).grupo_id === filterGrupo;
    const matchesStatus = filterStatus === 'all' || cliente.status === filterStatus;
    const matchesSistema = filterSistema === 'all' || (sistemasPorCliente[cliente.id] || []).includes(filterSistema);
    return matchesSearch && matchesSegmento && matchesGrupo && matchesStatus && matchesSistema;
  });

  const getStatusBadge = (status: string | null) => {
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

  const calcularValorComDesconto = (valor: number, desconto: number) => {
    return valor - (valor * desconto / 100);
  };

  const exportarRelatorio = (status: 'ativo' | 'inativo' | 'all') => {
    const lista = status === 'all' ? clientes : clientes.filter(c => (c.status || 'ativo') === status);
    if (lista.length === 0) {
      toast.error('Nenhum cliente para exportar');
      return;
    }
    const headers = ['Empresa', 'CNPJ', 'Segmento', 'Email', 'Telefone', 'Cidade', 'Estado', 'Data Entrada', 'Status', 'Mensalidade', 'Implantacao', 'Desconto (%)'];
    const escape = (v: any) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return `"${s}"`;
    };
    const rows = lista.map(c => [
      c.nome_empresa, c.cnpj, c.segmento, c.email, c.telefone,
      c.cidade, c.estado, c.data_entrada, c.status, c.valor_mensalidade, c.valor_implantacao, c.desconto_percentual,
    ].map(escape).join(';'));
    const csv = '\ufeff' + [headers.map(escape).join(';'), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const label = status === 'all' ? 'todos' : status === 'ativo' ? 'ativos' : 'inativos';
    a.download = `clientes-${label}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Relatório exportado (${lista.length} clientes)`);
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
          <h1 className="page-title">Clientes</h1>
          <p className="page-description">Gerencie seus clientes e informações de contato</p>
        </div>

        <div className="flex gap-2 items-center">
          <GrupoClienteManager onGroupsChange={fetchGrupos} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Download className="mr-2 h-4 w-4" />
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportarRelatorio('ativo')}>
                Clientes Ativos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportarRelatorio('inativo')}>
                Clientes Inativos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportarRelatorio('all')}>
                Todos os Clientes
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingCliente(null); resetForm(); }}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Cliente
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingCliente ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
              <DialogDescription>
                {editingCliente ? 'Atualize as informações do cliente' : 'Preencha os dados do novo cliente'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="nome_empresa">Nome da Empresa *</Label>
                <Input
                  id="nome_empresa"
                  value={formData.nome_empresa}
                  onChange={(e) => setFormData({ ...formData, nome_empresa: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grupo_id">Grupo</Label>
                <Select
                  value={formData.grupo_id}
                  onValueChange={(value) => setFormData({ ...formData, grupo_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {grupos.map((grupo) => (
                      <SelectItem key={grupo.id} value={grupo.id}>
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: grupo.cor }} />
                          {grupo.nome}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="segmento">Segmento</Label>
                  <Select
                    value={formData.segmento}
                    onValueChange={(value) => setFormData({ ...formData, segmento: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {segmentos.map((seg) => (
                        <SelectItem key={seg.id} value={seg.nome}>{seg.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="regime_tributario">Regime Tributário</Label>
                <Select
                  value={formData.regime_tributario || '__none__'}
                  onValueChange={(value) => setFormData({ ...formData, regime_tributario: value === '__none__' ? '' : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Não informado</SelectItem>
                    <SelectItem value="Simples Nacional">Simples Nacional</SelectItem>
                    <SelectItem value="MEI (Simei)">MEI (Simei)</SelectItem>
                    <SelectItem value="Regime Normal">Regime Normal</SelectItem>
                    <SelectItem value="Lucro Presumido">Lucro Presumido</SelectItem>
                    <SelectItem value="Lucro Real">Lucro Real</SelectItem>
                  </SelectContent>
                </Select>
              </div>

                <div className="space-y-2">
                  <Label htmlFor="data_entrada">Data de Entrada</Label>
                  <Input
                    id="data_entrada"
                    type="date"
                    value={formData.data_entrada}
                    onChange={(e) => setFormData({ ...formData, data_entrada: e.target.value })}
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
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telefone">Telefone</Label>
                  <Input
                    id="telefone"
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  />
                </div>
              </div>

              {/* Sistemas do Cliente */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-sm font-semibold mb-3">Sistemas Contratados</h3>
                {sistemas.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhum sistema cadastrado. Adicione na aba Sistemas.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {sistemas.map((sis) => {
                      const checked = formData.sistemasSelecionados.includes(sis.nome);
                      return (
                        <label
                          key={sis.id}
                          className="flex items-center gap-2 p-2 rounded-md border border-border hover:bg-muted/50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setFormData((prev) => ({
                                ...prev,
                                sistemasSelecionados: e.target.checked
                                  ? [...prev.sistemasSelecionados, sis.nome]
                                  : prev.sistemasSelecionados.filter((n) => n !== sis.nome),
                              }));
                            }}
                            className="h-4 w-4"
                          />
                          <span className="text-sm">{sis.nome}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Dados do Contratante */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Dados do Contratante (para contratos)
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="cnpj">CNPJ</Label>
                    <div className="flex gap-2">
                      <Input
                        id="cnpj"
                        value={formData.cnpj}
                        onChange={(e) => setFormData({ ...formData, cnpj: formatCnpj(e.target.value) })}
                        placeholder="00.000.000/0001-00"
                        maxLength={18}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        disabled={buscandoCnpj || formData.cnpj.replace(/\D/g, '').length !== 14}
                        onClick={() => buscarCnpj(formData.cnpj)}
                      >
                        {buscandoCnpj ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                        <span className="ml-1">Buscar</span>
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">Digite o CNPJ e clique em Buscar para preencher automaticamente</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nome_dono">Nome do Dono / Responsável</Label>
                    <Input
                      id="nome_dono"
                      value={formData.nome_dono}
                      onChange={(e) => setFormData({ ...formData, nome_dono: e.target.value })}
                      placeholder="Nome completo do proprietário"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cpf_dono">CPF do Dono</Label>
                    <Input
                      id="cpf_dono"
                      value={formData.cpf_dono}
                      onChange={(e) => setFormData({ ...formData, cpf_dono: formatCpf(e.target.value) })}
                      placeholder="000.000.000-00"
                      maxLength={14}
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="endereco">Endereço</Label>
                    <Input
                      id="endereco"
                      value={formData.endereco}
                      onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                      placeholder="Rua, número, bairro"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cidade">Cidade</Label>
                    <Input
                      id="cidade"
                      value={formData.cidade}
                      onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                      placeholder="Ex: São Paulo"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="estado">Estado</Label>
                    <Input
                      id="estado"
                      value={formData.estado}
                      onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
                      placeholder="Ex: MA"
                      maxLength={2}
                    />
                  </div>
                </div>
              </div>


              <div className="border-t pt-4 mt-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-success" />
                  Valores Financeiros
                </h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="valor_mensalidade">Mensalidade (R$)</Label>
                    <Input
                      id="valor_mensalidade"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.valor_mensalidade}
                      onChange={(e) => setFormData({ ...formData, valor_mensalidade: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="valor_implantacao">Implantação (R$)</Label>
                    <Input
                      id="valor_implantacao"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.valor_implantacao}
                      onChange={(e) => setFormData({ ...formData, valor_implantacao: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="desconto_percentual">Desconto (%)</Label>
                    <Input
                      id="desconto_percentual"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      value={formData.desconto_percentual}
                      onChange={(e) => setFormData({ ...formData, desconto_percentual: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                {formData.desconto_percentual > 0 && (
                  <div className="text-sm text-muted-foreground mt-2 space-y-1">
                    <p>Implantação com desconto: {formatCurrency(calcularValorComDesconto(formData.valor_implantacao, formData.desconto_percentual))}</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="observacoes">Observações</Label>
                <Textarea
                  id="observacoes"
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingCliente ? 'Salvar' : 'Criar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        </div>
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
                  placeholder="Buscar por nome ou email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterSegmento} onValueChange={setFilterSegmento}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Segmento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos segmentos</SelectItem>
                  {segmentos.map((seg) => (
                    <SelectItem key={seg.id} value={seg.nome}>{seg.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterGrupo} onValueChange={setFilterGrupo}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Tag className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos grupos</SelectItem>
                  {grupos.map((grupo) => (
                    <SelectItem key={grupo.id} value={grupo.id}>{grupo.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="ativo">Ativo</SelectItem>
                  <SelectItem value="inativo">Inativo</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSistema} onValueChange={setFilterSistema}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Monitor className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Sistema" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos sistemas</SelectItem>
                  {sistemas.map((sis) => (
                    <SelectItem key={sis.id} value={sis.nome}>{sis.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Totais */}
      {!loading && filteredClientes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6"
        >
          <Card className="bg-muted/30">
            <CardContent className="p-4 flex flex-col">
              <span className="text-sm text-muted-foreground">Total Clientes</span>
              <span className="text-lg font-bold">{filteredClientes.length}</span>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4 flex flex-col">
              <span className="text-sm text-muted-foreground">Total Mensalidade</span>
              <span className="text-lg font-bold text-success">
                {formatCurrency(filteredClientes.reduce((acc, c) => {
                  return acc + Number(c.valor_mensalidade || 0);
                }, 0))}
              </span>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="p-4 flex flex-col">
              <span className="text-sm text-muted-foreground">Total Implantação (Bruto)</span>
              <span className="text-lg font-bold">
                {formatCurrency(filteredClientes.reduce((acc, c) => {
                  const val = Number(c.valor_implantacao || 0);
                  return val > 0 ? acc + val : acc;
                }, 0))}
              </span>
            </CardContent>
          </Card>
          <Card className="bg-primary/10 border-primary/20">
            <CardContent className="p-4 flex flex-col">
              <span className="text-sm text-muted-foreground">Total Implantação com Desconto</span>
              <span className="text-lg font-bold text-primary">
                {formatCurrency(filteredClientes.reduce((acc, c) => {
                  const val = Number(c.valor_implantacao || 0);
                  const desconto = Number(c.desconto_percentual || 0);
                  const valComDesconto = val > 0 ? val - (val * desconto / 100) : 0;
                  return acc + valComDesconto;
                }, 0))}
              </span>
            </CardContent>
          </Card>
        </motion.div>
      )}

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
                    <th>Empresa</th>
                    <th>Grupo</th>
                    <th>Segmento</th>
                    <th>Contato</th>
                    <th>Data Entrada</th>
                    <th>Mensalidade</th>
                    <th>Implantação</th>
                    <th>Status</th>
                    <th className="w-[50px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-muted-foreground">
                        Carregando...
                      </td>
                    </tr>
                  ) : filteredClientes.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-center py-8 text-muted-foreground">
                        Nenhum cliente encontrado
                      </td>
                    </tr>
                  ) : (
                    filteredClientes.map((cliente) => (
                      <tr key={cliente.id} className="group transition-colors">
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                              <Users className="h-5 w-5" />
                            </div>
                            <div>
                              <div className="font-semibold text-foreground">{cliente.nome_empresa}</div>
                              {sistemasPorCliente[cliente.id]?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {sistemasPorCliente[cliente.id].map((sis) => (
                                    <Badge key={sis} variant="secondary" className="text-[10px] h-4 px-1.5 uppercase font-bold tracking-wider">
                                      {sis}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {cliente.observacoes && (
                                <div className="text-[11px] text-muted-foreground truncate max-w-[200px] mt-0.5">
                                  {cliente.observacoes}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          {(() => {
                            const grupo = grupos.find(g => g.id === (cliente as any).grupo_id);
                            return grupo ? (
                              <Badge 
                                variant="outline" 
                                className="font-semibold text-[10px]"
                                style={{ 
                                  borderColor: grupo.cor,
                                  color: grupo.cor,
                                  backgroundColor: `${grupo.cor}10`
                                }}
                              >
                                {grupo.nome}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">Sem grupo</span>
                            );
                          })()}
                        </td>
                        <td>
                          {cliente.segmento ? (
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 w-1.5 rounded-full bg-primary/60" />
                              <span className="text-sm font-medium">{cliente.segmento}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs italic">Não definido</span>
                          )}
                        </td>
                        <td>
                          <div className="flex flex-col gap-1.5 py-1">
                            {cliente.email && (
                              <div className="group/item flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors cursor-default">
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/5 group-hover/item:bg-primary/10 transition-colors">
                                  <Mail className="h-3 w-3" />
                                </div>
                                <span className="truncate max-w-[150px]">{cliente.email}</span>
                              </div>
                            )}
                            {cliente.telefone && (
                              <div className="group/item flex items-center gap-2 text-sm text-muted-foreground">
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-success/5 group-hover/item:bg-success/10 transition-colors">
                                  <Phone className="h-3 w-3 text-success" />
                                </div>
                                <span className="font-medium text-foreground/80">{cliente.telefone}</span>
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-success hover:bg-success/10"
                                  onClick={() => handleEnviarWhatsapp(cliente)}
                                  title="Enviar WhatsApp"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        </td>
                        <td>
                          {cliente.data_entrada ? (
                            <span className="text-sm text-muted-foreground">
                              {new Date(cliente.data_entrada).toLocaleDateString('pt-BR')}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </td>
                        <td>
                          <span className="text-sm font-medium text-success">
                            {formatCurrency(Number(cliente.valor_mensalidade))}
                          </span>
                        </td>
                        <td>
                          <div className="text-sm">
                            {Number(cliente.desconto_percentual) > 0 ? (
                              <>
                                <span className="font-medium">
                                  {formatCurrency(Number(cliente.valor_implantacao || 0) * (1 - Number(cliente.desconto_percentual || 0) / 100))}
                                </span>
                                <span className="text-xs text-muted-foreground ml-1 line-through">
                                  {formatCurrency(Number(cliente.valor_implantacao))}
                                </span>
                                <span className="text-xs text-muted-foreground ml-1">
                                  (-{cliente.desconto_percentual}%)
                                </span>
                              </>
                            ) : (
                              <span className="font-medium">
                                {formatCurrency(Number(cliente.valor_implantacao))}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{getStatusBadge(cliente.status)}</td>
                        <td>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(cliente)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEnviarWhatsapp(cliente)}>
                                <MessageCircle className="mr-2 h-4 w-4" />
                                Enviar WhatsApp
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleDelete(cliente.id)}
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
              </table>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={whatsappOpen} onOpenChange={setWhatsappOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar WhatsApp</DialogTitle>
            <DialogDescription>
              Para: {whatsappCliente?.nome_empresa} ({whatsappCliente?.telefone})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="whatsapp-msg">Mensagem</Label>
            <Textarea
              id="whatsapp-msg"
              value={whatsappMsg}
              onChange={(e) => setWhatsappMsg(e.target.value)}
              rows={6}
              placeholder="Digite sua mensagem..."
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setWhatsappOpen(false)} disabled={enviandoWhatsapp}>
                Cancelar
              </Button>
              <Button onClick={enviarWhatsapp} disabled={enviandoWhatsapp || !whatsappMsg.trim()}>
                {enviandoWhatsapp ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <MessageCircle className="h-4 w-4 mr-2" />}
                Enviar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
