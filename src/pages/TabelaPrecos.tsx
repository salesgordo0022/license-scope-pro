import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Edit, Trash2, MoreHorizontal, Check, ChevronDown, ChevronRight, Package, X, Eye, Settings, Copy } from '@/components/icons';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

interface TabelaPreco {
  id: string;
  nome: string;
  descricao: string | null;
  valor_mensalidade: number;
  valor_implantacao: number;
  recursos: string[] | null;
  ativo: boolean;
  ordem: number;
  created_at: string;
}

const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

const etapasImplantacao = [
  {
    numero: 1,
    titulo: 'Diagnóstico',
    itens: ['Perfil do cliente', 'Regime e natureza', 'Estrutura fiscal', 'Controles esperados', 'Software anterior'],
    cor: 'bg-primary'
  },
  {
    numero: 2,
    titulo: 'Parametrização',
    itens: ['Dados da empresa', 'Dados do contador', 'Naturezas fiscais', 'Usuários e permissões'],
    cor: 'bg-info'
  },
  {
    numero: 3,
    titulo: 'Cadastros',
    itens: ['NCM', 'Fornecedores', 'Produtos/Serviços', 'Grupo de tributos', 'Etiquetas'],
    cor: 'bg-success'
  },
  {
    numero: 4,
    titulo: 'Treinamento',
    itens: ['Ordem de serviço', 'Fluxo comercial', 'Emissão NFe', 'NFC-e / CF-e', 'Relatórios'],
    cor: 'bg-warning'
  },
  {
    numero: 5,
    titulo: 'Acompanhamento',
    itens: ['Suporte intensivo', 'Ajustes e dúvidas', 'Validação final'],
    cor: 'bg-destructive'
  }
];

const sistemasCompletos = [
  {
    id: 'mb',
    nome: 'Sistema MB',
    cor: 'from-orange-500 to-orange-600',
    borderColor: 'border-orange-500',
    bgColor: 'bg-orange-500',
    resumo: 'PDV simples e NFC-e/CF-e para pequenos varejos',
    recursos: ['Cadastro de clientes', 'PDV simples', 'NFC-e / CF-e'],
    detalhes: [
      {
        titulo: '1. Cadastros',
        itens: ['Cadastro de produtos/serviços', 'Cadastro de clientes', 'Grupos de produtos', 'NCM pré-configurado', 'Cadastro de vendedores', 'Locais de armazenamento', 'Cadastro de fornecedores', 'Departamentos', 'Grupo de tributos', 'Fabricantes/marcas', 'Ramo de atividade', 'Condições de pagamento', 'Formas de pagamento', 'Locais de cobrança', 'Planos de conta']
      },
      {
        titulo: '2. Entradas (Compras)',
        itens: ['Digitação simples', 'Importação XML do fornecedor', 'Importação NFe do cliente p/ devolução']
      },
      {
        titulo: '3. Saídas (Vendas)',
        itens: ['Venda rápida (PDV)', 'Venda detalhada', 'Cupom SAT', 'NFC-e (nota fiscal de consumidor)', 'NFe para NFCe (Recife, Manaus, etc.)', 'Vale presente / Vales NFC']
      },
      {
        titulo: '4. Financeiro',
        itens: ['Contas a pagar', 'Contas a receber', 'Caixa/Banco', 'Fluxo de caixa']
      },
      {
        titulo: '5. Auditoria e Gestão',
        itens: ['Histórico de operações', 'Metas de vendas', 'Relatórios gerenciais', 'Consulta XML', 'Carta de correção']
      },
      {
        titulo: '6. Recursos Extra e Integrações',
        itens: ['Backup local', 'Suporte por email', 'Atualizações mensais']
      }
    ]
  },
  {
    id: 'gerencial',
    nome: 'Sistema Gerencial',
    cor: 'from-blue-500 to-blue-600',
    borderColor: 'border-blue-500',
    bgColor: 'bg-blue-500',
    resumo: 'Gestão completa com estoque, comissões e orçamentos',
    recursos: ['Estoque completo', 'Comissões', 'Orçamentos', 'NFe detalhada'],
    detalhes: [
      {
        titulo: '1. Cadastros',
        itens: ['Todos os cadastros do MB', 'Transportadoras', 'Centros de custo', 'Representantes', 'Grade de produtos', 'Tabelas de preço']
      },
      {
        titulo: '2. Entradas (Compras e Estoque)',
        itens: ['Pré-análise XML', 'Pedido de compra', 'Conferência de mercadorias', 'Movimentação de estoque', 'Requisição de materiais', 'Inventário completo', 'Controle de lotes/validade']
      },
      {
        titulo: '3. Saídas (Vendas e Faturamento)',
        itens: ['Orçamento', 'Pedido de venda', 'NFe detalhada', 'Integração com balança / impressoras', 'Comissionamento', 'Devolução de vendas', 'Troca de mercadorias']
      },
      {
        titulo: '4. Financeiro',
        itens: ['Conciliação bancária', 'Boleto integrado', 'PIX integrado', 'DRE / Demonstrativos', 'Fluxo de caixa detalhado']
      },
      {
        titulo: '5. Fiscal / Contábil',
        itens: ['SPED Fiscal', 'SPED Contribuições', 'Relatório de impostos', 'Integração contábil', 'Livros fiscais']
      },
      {
        titulo: '6. Auditoria e Relatórios',
        itens: ['Dashboard gerencial', 'ABC de vendas/produtos', 'Curva ABC clientes', 'Relatórios customizados', 'Exportação Excel/PDF']
      },
      {
        titulo: '7. Aplicativo Mobile',
        itens: ['Consulta de produtos', 'Consulta de clientes', 'Pedidos mobile']
      }
    ]
  },
  {
    id: 'comercial',
    nome: 'Sistema Comercial',
    cor: 'from-green-500 to-green-600',
    borderColor: 'border-green-500',
    bgColor: 'bg-green-500',
    resumo: 'Multi-empresa com CRM e BI integrado',
    recursos: ['Multi-empresa', 'CRM', 'BI integrado', 'Gateway pagamento'],
    detalhes: [
      {
        titulo: '1. Cadastros',
        itens: ['Todos os cadastros anteriores', 'Cadastro de técnicos / Manutenção', 'Cadastro de veículos', 'Rotas de entrega', 'Tabelas de preço múltiplas', 'Perfis de clientes', 'Segmentação avançada']
      },
      {
        titulo: '2. Entradas (Compras)',
        itens: ['Cotação de fornecedores', 'Ordem de compra com aprovação', 'Conferência por lote/série/validade', 'Curva ABC de fornecedores', 'Sugestão de compra automática']
      },
      {
        titulo: '3. Saídas (Vendas)',
        itens: ['Orçamento avançado', 'Venda consignada', 'Romaneio de entrega', 'Controle de frota', 'CRM de vendas', 'Follow-up automático', 'Propostas comerciais']
      },
      {
        titulo: '4. Financeiro',
        itens: ['Multi-empresa', 'Fluxo de caixa projetado', 'Conciliação automática', 'Boletos bancários com registro', 'Gateway de pagamento', 'Cobrança automática', 'Análise de crédito']
      },
      {
        titulo: '5. Auditoria e Relatórios',
        itens: ['BI integrado', 'Dashboards personalizados', 'Exportação Excel/PDF avançada', 'Alertas e notificações', 'KPIs de vendas', 'Metas por equipe']
      },
      {
        titulo: '6. Integrações e Recursos Extra',
        itens: ['E-commerce', 'Marketplace integrado', 'API para terceiros', 'Backup na nuvem', 'WhatsApp integrado', 'Email marketing']
      }
    ]
  },
  {
    id: 'industrial',
    nome: 'Sistema Industrial',
    cor: 'from-purple-500 to-purple-600',
    borderColor: 'border-purple-500',
    bgColor: 'bg-purple-500',
    resumo: 'Produção/MRP com ordem de produção e rastreabilidade',
    recursos: ['Produção/MRP', 'Ordem de produção', 'Rastreabilidade', 'Bloco K'],
    detalhes: [
      {
        titulo: '1. Cadastros',
        itens: ['Todos os cadastros anteriores', 'Linha de produção', 'Operações/etapas', 'Fichas técnicas', 'Centro de trabalho', 'Controle de qualidade', 'Máquinas e equipamentos', 'Turnos de produção']
      },
      {
        titulo: '2. Entradas (Compras e Suprimentos)',
        itens: ['Requisição de compras', 'Explosão de matéria-prima (MRP)', 'Cotação automatizada', 'Romaneio de conferência', 'Controle de qualidade entrada']
      },
      {
        titulo: '3. Produção Industrial',
        itens: ['Ordem de produção', 'Explosão de insumos', 'Apontamento de produção', 'Controle de perdas', 'Rastreabilidade de lotes', 'Custo de produção', 'Ficha técnica', 'Subprodutos', 'Produção em lote', 'Produção contínua']
      },
      {
        titulo: '4. Saídas (Vendas e Faturamento)',
        itens: ['Venda por projeto/contrato', 'Entrega programada', 'Faturamento por etapa', 'Romaneio industrial', 'Pedidos sob encomenda']
      },
      {
        titulo: '5. Financeiro',
        itens: ['Custeio por absorção', 'Centro de custo por produto', 'Análise de margens', 'Precificação dinâmica', 'Rateio de custos indiretos']
      },
      {
        titulo: '6. Fiscal / Contábil',
        itens: ['SPED completo', 'Bloco K (produção e estoque)', 'Livros fiscais', 'Integração ECD/ECF', 'CIAP', 'Ressarcimento ICMS']
      },
      {
        titulo: '7. Auditoria e Relatórios',
        itens: ['OEE (eficiência operacional)', 'Indicadores de produção', 'Kanban visual', 'Relatórios de qualidade', 'Gráficos de Pareto', 'Análise de refugo']
      },
      {
        titulo: '8. Aplicativo Mobile Integrado',
        itens: ['Consultas', 'Pedidos de venda', 'Apontamento de produção mobile', 'Inventário mobile', 'Conferência de estoque']
      },
      {
        titulo: '9. Módulos Especiais',
        itens: ['Módulo de Balança Comercial', 'Módulo de produção avançado', 'Integração SAP', 'Integração com máquinas CNC', 'IoT industrial']
      }
    ]
  }
];

export default function TabelaPrecos() {
  const { isSuperAdmin } = useAuth();
  const [precos, setPrecos] = useState<TabelaPreco[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPreco, setEditingPreco] = useState<TabelaPreco | null>(null);
  const [selectedSistema, setSelectedSistema] = useState<typeof sistemasCompletos[0] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    valor_mensalidade: 0,
    valor_implantacao: 0,
    recursos: '',
    ativo: true,
    ordem: 0,
  });

  const fetchPrecos = async () => {
    try {
      const { data, error } = await supabase
        .from('tabela_precos')
        .select('*')
        .order('ordem');

      if (error) throw error;
      setPrecos(data || []);
    } catch (error) {
      console.error('Error fetching precos:', error);
      toast.error('Erro ao carregar tabela de preços');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrecos();
  }, []);

  const resetForm = () => {
    setFormData({
      nome: '',
      descricao: '',
      valor_mensalidade: 0,
      valor_implantacao: 0,
      recursos: '',
      ativo: true,
      ordem: precos.length + 1,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSuperAdmin) {
      toast.error('Apenas super admins podem gerenciar a tabela de preços');
      return;
    }

    try {
      const recursos = formData.recursos
        .split('\n')
        .map(r => r.trim())
        .filter(r => r.length > 0);

      if (editingPreco) {
        const { error } = await supabase
          .from('tabela_precos')
          .update({
            nome: formData.nome,
            descricao: formData.descricao || null,
            valor_mensalidade: formData.valor_mensalidade,
            valor_implantacao: formData.valor_implantacao,
            recursos,
            ativo: formData.ativo,
            ordem: formData.ordem,
          })
          .eq('id', editingPreco.id);

        if (error) throw error;
        toast.success('Plano atualizado com sucesso!');
      } else {
        const { error } = await supabase.from('tabela_precos').insert({
          nome: formData.nome,
          descricao: formData.descricao || null,
          valor_mensalidade: formData.valor_mensalidade,
          valor_implantacao: formData.valor_implantacao,
          recursos,
          ativo: formData.ativo,
          ordem: formData.ordem,
        });

        if (error) throw error;
        toast.success('Plano criado com sucesso!');
      }

      setDialogOpen(false);
      setEditingPreco(null);
      resetForm();
      fetchPrecos();
    } catch (error: any) {
      console.error('Error saving preco:', error);
      toast.error(error.message || 'Erro ao salvar plano');
    }
  };

  const handleEdit = (preco: TabelaPreco) => {
    setEditingPreco(preco);
    setFormData({
      nome: preco.nome,
      descricao: preco.descricao || '',
      valor_mensalidade: preco.valor_mensalidade,
      valor_implantacao: preco.valor_implantacao,
      recursos: preco.recursos?.join('\n') || '',
      ativo: preco.ativo,
      ordem: preco.ordem,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!isSuperAdmin) {
      toast.error('Apenas super admins podem excluir planos');
      return;
    }

    if (!confirm('Tem certeza que deseja excluir este plano?')) return;

    try {
      const { error } = await supabase.from('tabela_precos').delete().eq('id', id);
      if (error) throw error;
      toast.success('Plano excluído com sucesso!');
      fetchPrecos();
    } catch (error) {
      console.error('Error deleting preco:', error);
      toast.error('Erro ao excluir plano');
    }
  };

  const handleDuplicate = async (preco: TabelaPreco) => {
    if (!isSuperAdmin) {
      toast.error('Apenas super admins podem duplicar planos');
      return;
    }

    try {
      const { error } = await supabase.from('tabela_precos').insert({
        nome: `${preco.nome} (Cópia)`,
        descricao: preco.descricao,
        valor_mensalidade: preco.valor_mensalidade,
        valor_implantacao: preco.valor_implantacao,
        recursos: preco.recursos,
        ativo: false,
        ordem: precos.length + 1,
      });

      if (error) throw error;
      toast.success('Plano duplicado com sucesso!');
      fetchPrecos();
    } catch (error: any) {
      console.error('Error duplicating preco:', error);
      toast.error(error.message || 'Erro ao duplicar plano');
    }
  };

  const handleViewSistema = (sistema: typeof sistemasCompletos[0]) => {
    setSelectedSistema(sistema);
    setSheetOpen(true);
  };

  const handleCreateFromSistema = (sistema: typeof sistemasCompletos[0]) => {
    const allRecursos = sistema.detalhes.flatMap(d => d.itens);
    setFormData({
      nome: sistema.nome,
      descricao: sistema.resumo,
      valor_mensalidade: 0,
      valor_implantacao: 0,
      recursos: allRecursos.join('\n'),
      ativo: true,
      ordem: precos.length + 1,
    });
    setEditingPreco(null);
    setDialogOpen(true);
    setSheetOpen(false);
  };

  const precosAtivos = precos.filter(p => p.ativo);
  const precosInativos = precos.filter(p => !p.ativo);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="page-header mb-0">
          <h1 className="page-title">Tabela de Preços</h1>
          <p className="page-description">Gerencie planos e valores para clientes</p>
        </div>

        {isSuperAdmin && (
          <div className="flex gap-2">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingPreco(null); resetForm(); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Plano
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingPreco ? 'Editar Plano' : 'Novo Plano'}</DialogTitle>
                  <DialogDescription>
                    {editingPreco ? 'Atualize as informações do plano' : 'Crie um novo plano de preços para oferecer aos clientes'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nome do Plano *</Label>
                      <Input
                        value={formData.nome}
                        onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                        placeholder="Ex: Sistema Gerencial"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Ordem de Exibição</Label>
                      <Input
                        type="number"
                        min="0"
                        value={formData.ordem}
                        onChange={(e) => setFormData({ ...formData, ordem: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      placeholder="Breve descrição do plano"
                    />
                  </div>

                  <Separator />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Valor Implantação (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.valor_implantacao}
                        onChange={(e) => setFormData({ ...formData, valor_implantacao: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mensalidade (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.valor_mensalidade}
                        onChange={(e) => setFormData({ ...formData, valor_mensalidade: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Recursos Incluídos (um por linha)</Label>
                    <Textarea
                      value={formData.recursos}
                      onChange={(e) => setFormData({ ...formData, recursos: e.target.value })}
                      placeholder="Cadastro de clientes&#10;PDV simples&#10;NFC-e / CF-e&#10;Suporte por email"
                      rows={8}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Cada linha será exibida como um item de recurso do plano
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <Switch
                      checked={formData.ativo}
                      onCheckedChange={(checked) => setFormData({ ...formData, ativo: checked })}
                    />
                    <div>
                      <Label className="font-medium">Plano Ativo</Label>
                      <p className="text-xs text-muted-foreground">Planos ativos ficam visíveis para seleção</p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit">
                      {editingPreco ? 'Salvar Alterações' : 'Criar Plano'}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </motion.div>

      {/* Tabs */}
      <Tabs defaultValue="planos" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="planos">Planos Ativos</TabsTrigger>
          <TabsTrigger value="sistemas">Modelos de Sistema</TabsTrigger>
          <TabsTrigger value="etapas">Etapas Implantação</TabsTrigger>
        </TabsList>

        {/* Planos Ativos Tab */}
        <TabsContent value="planos" className="mt-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {loading ? (
              <Card className="p-12 text-center text-muted-foreground">
                Carregando planos...
              </Card>
            ) : precosAtivos.length === 0 ? (
              <Card className="p-12 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhum plano ativo</h3>
                <p className="text-muted-foreground mb-4">
                  Crie um novo plano ou ative um plano existente
                </p>
                {isSuperAdmin && (
                  <Button onClick={() => { setEditingPreco(null); resetForm(); setDialogOpen(true); }}>
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Primeiro Plano
                  </Button>
                )}
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {precosAtivos.map((preco, index) => (
                  <motion.div
                    key={preco.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className={`h-full flex flex-col relative overflow-hidden ${
                      index === 1 ? 'border-primary shadow-lg ring-2 ring-primary/20' : ''
                    }`}>
                      {index === 1 && (
                        <div className="absolute top-0 right-0">
                          <Badge className="rounded-none rounded-bl-lg bg-primary">Popular</Badge>
                        </div>
                      )}
                      
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{preco.nome}</CardTitle>
                            {preco.descricao && (
                              <CardDescription className="mt-1">{preco.descricao}</CardDescription>
                            )}
                          </div>
                          {isSuperAdmin && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8 -mt-1 -mr-2">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleEdit(preco)}>
                                  <Edit className="mr-2 h-4 w-4" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDuplicate(preco)}>
                                  <Copy className="mr-2 h-4 w-4" />
                                  Duplicar
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleDelete(preco.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </CardHeader>
                      
                      <CardContent className="flex-1 flex flex-col">
                        <div className="mb-4">
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold text-primary">
                              {formatCurrency(preco.valor_mensalidade)}
                            </span>
                            <span className="text-muted-foreground">/mês</span>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Implantação: {formatCurrency(preco.valor_implantacao)}
                          </p>
                        </div>

                        <Separator className="my-4" />

                        {preco.recursos && preco.recursos.length > 0 && (
                          <ScrollArea className="flex-1 max-h-48">
                            <ul className="space-y-2">
                              {preco.recursos.slice(0, 10).map((recurso, i) => (
                                <li key={i} className="flex items-start gap-2 text-sm">
                                  <Check className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                                  <span>{recurso}</span>
                                </li>
                              ))}
                              {preco.recursos.length > 10 && (
                                <li className="text-sm text-muted-foreground pl-6">
                                  +{preco.recursos.length - 10} recursos adicionais
                                </li>
                              )}
                            </ul>
                          </ScrollArea>
                        )}

                        <Button 
                          className="w-full mt-4" 
                          variant={index === 1 ? 'default' : 'outline'}
                        >
                          Selecionar Plano
                        </Button>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Planos Inativos */}
            {isSuperAdmin && precosInativos.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mt-8"
              >
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Planos Inativos ({precosInativos.length})
                </h3>
                <Card>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>Descrição</th>
                            <th className="text-right">Mensalidade</th>
                            <th className="text-right">Implantação</th>
                            <th className="w-[100px]">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {precosInativos.map((preco) => (
                            <tr key={preco.id}>
                              <td className="font-medium">{preco.nome}</td>
                              <td className="text-muted-foreground">{preco.descricao || '-'}</td>
                              <td className="text-right">{formatCurrency(preco.valor_mensalidade)}</td>
                              <td className="text-right">{formatCurrency(preco.valor_implantacao)}</td>
                              <td>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(preco)}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(preco.id)}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </motion.div>
        </TabsContent>

        {/* Modelos de Sistema Tab */}
        <TabsContent value="sistemas" className="mt-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-6 md:grid-cols-2 lg:grid-cols-4"
          >
            {sistemasCompletos.map((sistema, index) => (
              <motion.div
                key={sistema.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`h-full flex flex-col border-t-4 ${sistema.borderColor} hover:shadow-lg transition-shadow cursor-pointer`}
                  onClick={() => handleViewSistema(sistema)}
                >
                  <CardHeader className={`bg-gradient-to-br ${sistema.cor} text-white rounded-t-lg -mt-px -mx-px`}>
                    <div className="flex items-center gap-3">
                      <Package className="h-6 w-6" />
                      <CardTitle className="text-lg">{sistema.nome}</CardTitle>
                    </div>
                    <CardDescription className="text-white/80 mt-2">
                      {sistema.resumo}
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent className="flex-1 flex flex-col p-4">
                    <div className="mb-4">
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Recursos Principais</h4>
                      <ul className="space-y-1.5">
                        {sistema.recursos.map((recurso, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm">
                            <Check className="h-3.5 w-3.5 text-success flex-shrink-0" />
                            <span>{recurso}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-auto pt-4">
                      <p className="text-xs text-muted-foreground mb-3">
                        {sistema.detalhes.length} categorias • {sistema.detalhes.reduce((acc, d) => acc + d.itens.length, 0)} funcionalidades
                      </p>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); handleViewSistema(sistema); }}>
                          <Eye className="mr-1 h-3 w-3" />
                          Ver Tudo
                        </Button>
                        {isSuperAdmin && (
                          <Button size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); handleCreateFromSistema(sistema); }}>
                            <Plus className="mr-1 h-3 w-3" />
                            Criar Plano
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </motion.div>
        </TabsContent>

        {/* Etapas de Implantação Tab */}
        <TabsContent value="etapas" className="mt-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Processo de Implantação</CardTitle>
                <CardDescription>Etapas padrão para todos os sistemas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {etapasImplantacao.map((etapa, index) => (
                    <motion.div
                      key={etapa.numero}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="relative"
                    >
                      <div className="rounded-lg p-4 border border-border bg-card hover:shadow-md transition-shadow h-full">
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`w-8 h-8 rounded-full ${etapa.cor} flex items-center justify-center text-white text-sm font-bold`}>
                            {etapa.numero}
                          </div>
                          <h3 className="font-semibold text-sm text-foreground">{etapa.titulo}</h3>
                        </div>
                        <ul className="space-y-1.5">
                          {etapa.itens.map((item, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <span className="text-primary mt-0.5">•</span>
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      {index < etapasImplantacao.length - 1 && (
                        <div className="hidden md:flex absolute top-1/2 -right-2 transform -translate-y-1/2 z-10">
                          <ChevronRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TabsContent>
      </Tabs>

      {/* Sheet para visualizar todas as funções do sistema */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedSistema && (
            <>
              <SheetHeader>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${selectedSistema.bgColor} text-white w-fit`}>
                  <Package className="h-4 w-4" />
                  <span className="font-medium">{selectedSistema.nome}</span>
                </div>
                <SheetTitle className="text-xl mt-3">Todas as Funcionalidades</SheetTitle>
                <SheetDescription>{selectedSistema.resumo}</SheetDescription>
              </SheetHeader>
              
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4 p-3 bg-muted/50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium">{selectedSistema.detalhes.length} categorias</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedSistema.detalhes.reduce((acc, d) => acc + d.itens.length, 0)} funcionalidades no total
                    </p>
                  </div>
                  {isSuperAdmin && (
                    <Button size="sm" onClick={() => handleCreateFromSistema(selectedSistema)}>
                      <Plus className="mr-1 h-3 w-3" />
                      Criar Plano
                    </Button>
                  )}
                </div>

                <Accordion type="multiple" className="w-full" defaultValue={selectedSistema.detalhes.map((_, i) => `item-${i}`)}>
                  {selectedSistema.detalhes.map((detalhe, i) => (
                    <AccordionItem key={i} value={`item-${i}`}>
                      <AccordionTrigger className="py-3 hover:no-underline">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{detalhe.titulo}</span>
                          <Badge variant="secondary" className="text-xs">
                            {detalhe.itens.length}
                          </Badge>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="space-y-2 pl-1">
                          {detalhe.itens.map((item, j) => (
                            <li key={j} className="flex items-start gap-2 text-sm">
                              <Check className="h-4 w-4 text-success flex-shrink-0 mt-0.5" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
