import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Search, Filter, MoreHorizontal, Mail, Edit, Trash2, DollarSign, FileText, Loader2, MessageCircle, Users, Download, Tag, Monitor, Pencil, Check, X, Building2 } from '@/components/icons';
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
import * as XLSX from 'xlsx';

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

/** Formata um número como moeda brasileira; devolve traço quando nulo. */
const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

/**
 * CRM de clientes: cadastro, busca, filtros por segmento/status, vínculo com
 * sistemas e grupos, exportação para Excel e atalho de contato por WhatsApp.
 */
/** Pontotel é controlado por vidas (quantidade de funcionários no ponto). */
const ehPontotel = (nomeSistema: string | null | undefined) => (nomeSistema || '').toUpperCase().includes('PONTOTEL');

export default function Clientes() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [vidasPorCliente, setVidasPorCliente] = useState<Record<string, number>>({});
  const [exportando, setExportando] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  // Edição rápida do nome direto na tabela (clique no nome).
  const [editandoNomeId, setEditandoNomeId] = useState<string | null>(null);
  const [nomeTemp, setNomeTemp] = useState('');
  const [salvandoNome, setSalvandoNome] = useState(false);
  // A coluna cep entra por migration; enquanto não existir no banco, o campo
  // aparece mas não é enviado (senão o insert/update falharia).
  const [cepNoBanco, setCepNoBanco] = useState(true);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [whatsappOpen, setWhatsappOpen] = useState(false);
  const [whatsappCliente, setWhatsappCliente] = useState<Cliente | null>(null);
  const [whatsappMsg, setWhatsappMsg] = useState('');
  const [enviandoWhatsapp, setEnviandoWhatsapp] = useState(false);

  /** Aplica a máscara 00.000.000/0000-00 conforme o usuário digita. */
  const formatCnpj = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };

  /** Aplica a máscara 00000-000 conforme o usuário digita. */
  const formatCep = (value: string) => value.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

  /** Completa cidade, UF e endereço pelo CEP (ViaCEP), sem sobrescrever o que já foi digitado. */
  const buscarCep = async (cepRaw: string) => {
    const digits = cepRaw.replace(/\D/g, '');
    if (digits.length !== 8) return;
    setBuscandoCep(true);
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await resp.json();
      if (!resp.ok || data.erro) {
        toast.error('CEP não encontrado');
        return;
      }
      setFormData((prev) => ({
        ...prev,
        cidade: prev.cidade || data.localidade || '',
        estado: prev.estado || data.uf || '',
        endereco: prev.endereco || [data.logradouro, data.bairro].filter(Boolean).join(', '),
      }));
    } catch {
      toast.error('Não foi possível consultar o CEP');
    } finally {
      setBuscandoCep(false);
    }
  };

  /** Aplica a máscara 000.000.000-00 conforme o usuário digita. */
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
        cep: data.cep ? formatCep(String(data.cep)) : prev.cep,
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
    cep: '',
    data_entrada: '',
    regime_tributario: '',
    sistemasSelecionados: [] as string[], // nomes dos sistemas
    vidasPontotel: 1, // vai para licencas.quantidade da licença Pontotel
  });


  /** Carrega os segmentos disponíveis para o seletor do formulário. */
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

  /** Carrega o catálogo de sistemas que podem ser vinculados ao cliente. */
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

  /** Carrega os grupos de clientes da empresa. */
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

  /** Carrega os clientes do banco. O RLS já limita o retorno à empresa do usuário. */
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
          .select('cliente_id, tipo, quantidade')
          .eq('status', 'ativo' as StatusType)
          .in('cliente_id', ids);
        const map: Record<string, string[]> = {};
        const vidas: Record<string, number> = {};
        (lics || []).forEach((l: any) => {
          if (ehPontotel(l.tipo)) vidas[l.cliente_id] = (vidas[l.cliente_id] || 0) + (l.quantidade || 0);
          if (!map[l.cliente_id]) map[l.cliente_id] = [];
          if (l.tipo && !map[l.cliente_id].includes(l.tipo)) {
            map[l.cliente_id].push(l.tipo);
          }
        });
        setSistemasPorCliente(map);
        setVidasPorCliente(vidas);
      }
    } catch (error) {
      console.error('Error fetching clientes:', error);
      toast.error('Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    supabase
      .from('clientes')
      .select('cep')
      .limit(1)
      .then(({ error }) => setCepNoBanco(!error));
    fetchClientes();
    fetchSegmentos();
    fetchSistemas();
    fetchGrupos();
  }, []);

  // Atalhos vindos de outras telas (busca da barra superior e ações do
  // dashboard): ?busca=termo, ?novo=1 e ?editar=<id>. Depois de aplicados, os
  // parâmetros saem da URL para não reabrirem o diálogo num refresh.
  useEffect(() => {
    const busca = searchParams.get('busca');
    const novo = searchParams.get('novo');
    const editar = searchParams.get('editar');
    if (busca === null && novo === null && editar === null) return;

    if (busca !== null) {
      setSearchTerm(busca);
      setFilterStatus('all');
    }
    if (novo !== null) {
      setEditingCliente(null);
      resetForm();
      setDialogOpen(true);
    }
    if (editar !== null) {
      if (loading) return; // espera a lista carregar para achar o cliente
      const alvo = clientes.find((cl) => cl.id === editar);
      if (alvo) handleEdit(alvo);
      else toast.error('Cliente não encontrado');
    }
    setSearchParams({}, { replace: true });
  }, [searchParams, loading]);

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
      cep: '',
      data_entrada: '',
      regime_tributario: '',
      sistemasSelecionados: [],
      vidasPontotel: 1,
    });

  };

  /** Cria/remove as licenças conforme os sistemas marcados. As vidas digitadas
   *  no cadastro vão para a quantidade da licença Pontotel, que é a mesma que
   *  aparece (e pode ser editada) na aba Licenças. */
  const sincronizarSistemas = async (clienteId: string, empresaId: string | null, sistemasNomes: string[], vidasPontotel: number) => {
    // Remove licenças que não estão mais selecionadas
    const { data: existentes } = await supabase
      .from('licencas')
      .select('id, tipo, quantidade')
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
          quantidade: ehPontotel(nome) ? vidasPontotel : 1,
          modelo_cobranca: 'saas',
          status: 'ativo' as StatusType,
        }))
      );
    }

    // Pontotel que já existia: atualiza as vidas se mudaram.
    const pontotelExistentes = (existentes || []).filter(
      (l: any) => ehPontotel(l.tipo) && sistemasNomes.includes(l.tipo) && l.quantidade !== vidasPontotel
    );
    if (pontotelExistentes.length > 0) {
      await supabase.from('licencas').update({ quantidade: vidasPontotel }).in('id', pontotelExistentes.map((l: any) => l.id));
    }
  };

  /** Grava o cliente (novo ou editado) junto com seus sistemas vinculados. */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const { sistemasSelecionados, vidasPontotel, cep, ...clienteDataSemCep } = formData;
      const clienteDataRaw = cepNoBanco ? { ...clienteDataSemCep, cep: cep || null } : clienteDataSemCep;
      if (sistemasSelecionados.some(ehPontotel) && (!vidasPontotel || vidasPontotel < 1)) {
        toast.error('Informe a quantidade de vidas do Pontotel');
        return;
      }
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
        await sincronizarSistemas(editingCliente.id, editingCliente.empresa_id, sistemasSelecionados, vidasPontotel);
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
          await sincronizarSistemas(novoCliente.id, empresaId, sistemasSelecionados, vidasPontotel);
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

  /** Preenche o formulário com o registro escolhido e abre o diálogo de edição. */
  const handleEdit = async (cliente: Cliente) => {
    setEditingCliente(cliente);
    // Buscar sistemas atuais do cliente
    const { data: lics } = await supabase
      .from('licencas')
      .select('tipo, quantidade')
      .eq('cliente_id', cliente.id);
    const sistemasAtuais = Array.from(new Set((lics || []).map((l: any) => l.tipo).filter(Boolean)));
    const licPontotel = (lics || []).find((l: any) => ehPontotel(l.tipo));

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
      cep: (cliente as any).cep || '',
      data_entrada: (cliente as any).data_entrada || '',
      regime_tributario: (cliente as any).regime_tributario || '',
      sistemasSelecionados: sistemasAtuais,
      vidasPontotel: licPontotel?.quantidade || 1,

    });
    setDialogOpen(true);
  };

  /** Exclui o registro após confirmação do usuário. */
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

  /** Abre a tela de Mensagens já com o cliente selecionado para envio. */
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

  const iniciarEdicaoNome = (cliente: Cliente) => {
    setEditandoNomeId(cliente.id);
    setNomeTemp(cliente.nome_empresa);
  };

  const cancelarEdicaoNome = () => {
    setEditandoNomeId(null);
    setNomeTemp('');
  };

  /** Grava o novo nome do cliente editado na própria linha da tabela. */
  const salvarNome = async (cliente: Cliente) => {
    const novo = nomeTemp.trim().replace(/s+/g, ' ');
    if (salvandoNome) return;
    if (!novo) {
      toast.error('O nome do cliente não pode ficar vazio');
      return;
    }
    if (novo === cliente.nome_empresa) {
      cancelarEdicaoNome();
      return;
    }
    setSalvandoNome(true);
    const { error } = await supabase.from('clientes').update({ nome_empresa: novo }).eq('id', cliente.id);
    setSalvandoNome(false);
    if (error) {
      toast.error('Erro ao renomear cliente', { description: error.message });
      return;
    }
    setClientes((lista) => lista.map((cl) => (cl.id === cliente.id ? { ...cl, nome_empresa: novo } : cl)));
    cancelarEdicaoNome();
    toast.success('Nome atualizado');
  };

  /** Aplica busca textual e filtros de segmento/status sobre a lista carregada. */
  const filteredClientes = clientes.filter((cliente) => {
    const termo = searchTerm.toLowerCase().trim();
    const termoDigitos = termo.replace(/D/g, '');
    const matchesSearch =
      !termo ||
      cliente.nome_empresa.toLowerCase().includes(termo) ||
      cliente.email?.toLowerCase().includes(termo) ||
      cliente.segmento?.toLowerCase().includes(termo) ||
      (sistemasPorCliente[cliente.id] || []).some((s) => s.toLowerCase().includes(termo)) ||
      (termoDigitos.length >= 3 && (cliente as any).cnpj?.replace(/D/g, '').includes(termoDigitos));
    const matchesSegmento = filterSegmento === 'all' || cliente.segmento === filterSegmento;
    const matchesGrupo = filterGrupo === 'all' || (cliente as any).grupo_id === filterGrupo;
    const matchesStatus = filterStatus === 'all' || cliente.status === filterStatus;
    const matchesSistema = filterSistema === 'all' || (sistemasPorCliente[cliente.id] || []).includes(filterSistema);
    return matchesSearch && matchesSegmento && matchesGrupo && matchesStatus && matchesSistema;
  });

  /** Devolve o selo visual correspondente ao status do cliente. */
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

  /** Aplica o desconto percentual sobre o valor do sistema contratado. */
  const calcularValorComDesconto = (valor: number, desconto: number) => {
    return valor - (valor * desconto / 100);
  };

  /**
   * Exporta a carteira de clientes para .xlsx com três abas: clientes,
   * sistemas por cliente e resumo por sistema.
   *
   * Aqui a biblioteca xlsx só ESCREVE arquivos. As falhas conhecidas dela
   * (prototype pollution e ReDoS) estão no caminho de LEITURA, que este projeto
   * não usa — por isso a dependência segue sem atualização disponível.
   */
  const exportarRelatorio = async (status: 'ativo' | 'inativo' | 'all') => {
    const lista = status === 'all' ? clientes : clientes.filter(c => (c.status || 'ativo') === status);
    if (lista.length === 0) {
      toast.error('Nenhum cliente para exportar');
      return;
    }
    setExportando(true);
    try {
      // Licenças = sistemas contratados por cliente (tipo = nome do sistema)
      const ids = lista.map((c) => c.id);
      const licencas: any[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase
          .from('licencas')
          .select('cliente_id, tipo, status, modelo_cobranca, quantidade, valor_venda, valor_custo, dia_vencimento, data_inicio, validade, data_pagamento_sistema')
          .in('cliente_id', ids.slice(i, i + 200));
        if (error) throw error;
        licencas.push(...(data || []));
      }

      const licencasPorCliente: Record<string, any[]> = {};
      for (const l of licencas) {
        (licencasPorCliente[l.cliente_id] ||= []).push(l);
      }
      const nomeGrupo = (id: string | null) => grupos.find((g) => g.id === id)?.nome ?? '';
      const fmtData = (d: string | null) => (d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR') : '');
      const num = (v: number | null | undefined) => (v === null || v === undefined ? null : Number(v));

      // Colunas fixas de sistemas: todos cadastrados + qualquer tipo de licença não cadastrado
      const nomesSistemas = Array.from(
        new Set([...sistemas.map((sis) => sis.nome), ...licencas.map((l) => l.tipo).filter(Boolean)])
      ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

      // Aba 1: dados do cliente + sistemas
      const linhasClientes = lista.map((c) => {
        const lics = licencasPorCliente[c.id] || [];
        const ativos = Array.from(new Set(lics.filter((l) => (l.status || 'ativo') === 'ativo').map((l) => l.tipo).filter(Boolean)));
        const todos = Array.from(new Set(lics.map((l) => l.tipo).filter(Boolean)));
        const linha: Record<string, unknown> = {
          'Empresa': c.nome_empresa,
          'CNPJ': c.cnpj ?? '',
          'Nome do Dono': c.nome_dono ?? '',
          'CPF do Dono': c.cpf_dono ?? '',
          'Segmento': c.segmento ?? '',
          'Grupo': nomeGrupo(c.grupo_id),
          'Regime Tributário': c.regime_tributario ?? '',
          'Email': c.email ?? '',
          'Telefone': c.telefone ?? '',
          'Endereço': c.endereco ?? '',
          'Cidade': c.cidade ?? '',
          'CEP': (c as any).cep ?? '',
          'Estado': c.estado ?? '',
          'Data Entrada': fmtData(c.data_entrada),
          'Status': c.status || 'ativo',
          'Mensalidade (R$)': num(c.valor_mensalidade),
          'Implantação (R$)': num(c.valor_implantacao),
          'Desconto (%)': num(c.desconto_percentual),
          'Mensalidade c/ Desconto (R$)': c.valor_mensalidade != null ? Number(calcularValorComDesconto(c.valor_mensalidade, c.desconto_percentual || 0).toFixed(2)) : null,
          'Qtd Sistemas Ativos': ativos.length,
          'Sistemas Ativos': ativos.join(', '),
          'Sistemas (todos, inclusive inativos)': todos.join(', '),
          'Valor Total Licenças (R$)': Number(lics.filter((l) => (l.status || 'ativo') === 'ativo').reduce((acc, l) => acc + (Number(l.valor_venda) || 0), 0).toFixed(2)),
          'Observações': c.observacoes ?? '',
        };
        for (const nome of nomesSistemas) {
          const lic = lics.find((l) => l.tipo === nome);
          linha[`Sistema: ${nome}`] = lic ? ((lic.status || 'ativo') === 'ativo' ? 'SIM' : `SIM (${lic.status})`) : '';
        }
        return linha;
      });

      // Aba 2: uma linha por sistema/licença de cada cliente
      const linhasSistemas = lista.flatMap((c) =>
        (licencasPorCliente[c.id] || [])
          .slice()
          .sort((a, b) => String(a.tipo).localeCompare(String(b.tipo), 'pt-BR'))
          .map((l) => ({
            'Empresa': c.nome_empresa,
            'CNPJ': c.cnpj ?? '',
            'Telefone': c.telefone ?? '',
            'Cidade': c.cidade ?? '',
            'Status Cliente': c.status || 'ativo',
            'Sistema': l.tipo,
            'Status Sistema': l.status || 'ativo',
            'Modelo de Cobrança': l.modelo_cobranca ?? '',
            'Quantidade': num(l.quantidade),
            'Valor Venda (R$)': num(l.valor_venda),
            'Valor Custo (R$)': num(l.valor_custo),
            'Dia Vencimento': num(l.dia_vencimento),
            'Data Início': fmtData(l.data_inicio),
            'Validade': fmtData(l.validade),
            'Pagamento do Sistema': fmtData(l.data_pagamento_sistema),
          }))
      );

      // Aba 3: resumo por sistema
      const resumo = nomesSistemas.map((nome) => {
        const doSistema = lista.filter((c) => (licencasPorCliente[c.id] || []).some((l) => l.tipo === nome));
        const ativosNoSistema = lista.filter((c) =>
          (licencasPorCliente[c.id] || []).some((l) => l.tipo === nome && (l.status || 'ativo') === 'ativo')
        );
        return {
          'Sistema': nome,
          'Clientes com o Sistema': doSistema.length,
          'Clientes Ativos no Sistema': ativosNoSistema.length,
          'Receita Mensal Licenças (R$)': Number(
            licencas
              .filter((l) => l.tipo === nome && (l.status || 'ativo') === 'ativo' && ids.includes(l.cliente_id))
              .reduce((acc, l) => acc + (Number(l.valor_venda) || 0), 0)
              .toFixed(2)
          ),
          'Clientes': doSistema.map((c) => c.nome_empresa).join(', '),
        };
      });

      const larguras = (rows: Record<string, unknown>[], max = 50) => {
        if (rows.length === 0) return [];
        return Object.keys(rows[0]).map((k) => ({
          wch: Math.min(max, Math.max(k.length, ...rows.map((r) => String(r[k] ?? '').length)) + 2),
        }));
      };

      const wb = XLSX.utils.book_new();
      const wsClientes = XLSX.utils.json_to_sheet(linhasClientes);
      wsClientes['!cols'] = larguras(linhasClientes);
      wsClientes['!autofilter'] = { ref: wsClientes['!ref'] as string };
      XLSX.utils.book_append_sheet(wb, wsClientes, 'Clientes');

      const wsSistemas = XLSX.utils.json_to_sheet(
        linhasSistemas.length > 0 ? linhasSistemas : [{ 'Empresa': '', 'Sistema': 'Nenhum sistema vinculado aos clientes exportados' }]
      );
      wsSistemas['!cols'] = larguras(linhasSistemas);
      if (linhasSistemas.length > 0) wsSistemas['!autofilter'] = { ref: wsSistemas['!ref'] as string };
      XLSX.utils.book_append_sheet(wb, wsSistemas, 'Sistemas por Cliente');

      if (resumo.length > 0) {
        const wsResumo = XLSX.utils.json_to_sheet(resumo);
        wsResumo['!cols'] = larguras(resumo, 80);
        XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo por Sistema');
      }

      const label = status === 'all' ? 'todos' : status === 'ativo' ? 'ativos' : 'inativos';
      XLSX.writeFile(wb, `clientes-${label}-${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(`Relatório Excel exportado (${lista.length} clientes, ${linhasSistemas.length} sistemas vinculados)`);
    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast.error('Erro ao exportar relatório');
    } finally {
      setExportando(false);
    }
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

        <div className="flex flex-wrap gap-2 items-center">
          <GrupoClienteManager onGroupsChange={fetchGrupos} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exportando}>
                {exportando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Exportar Excel
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
                {formData.sistemasSelecionados.some(ehPontotel) && (
                  <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                    <Users className="h-5 w-5 text-blue-600" />
                    <div className="flex-1">
                      <Label htmlFor="vidas_pontotel" className="text-sm font-semibold text-blue-900">
                        Quantidade de vidas (Pontotel) *
                      </Label>
                      <p className="text-xs text-blue-900/70">Funcionários no ponto. Vai para a aba Licenças.</p>
                    </div>
                    <Input
                      id="vidas_pontotel"
                      type="number"
                      min={1}
                      value={formData.vidasPontotel}
                      onChange={(e) => setFormData((prev) => ({ ...prev, vidasPontotel: parseInt(e.target.value) || 0 }))}
                      className="w-24 bg-white"
                    />
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
                  <div className="col-span-2 grid grid-cols-[140px_1fr_80px] gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="cep">CEP</Label>
                      <div className="relative">
                        <Input
                          id="cep"
                          value={formData.cep}
                          onChange={(e) => setFormData({ ...formData, cep: formatCep(e.target.value) })}
                          onBlur={(e) => buscarCep(e.target.value)}
                          placeholder="00000-000"
                          maxLength={9}
                        />
                        {buscandoCep && <Loader2 className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cidade">Cidade</Label>
                      <Input
                        id="cidade"
                        value={formData.cidade}
                        onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                        placeholder="Ex: Grajaú"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="estado">UF</Label>
                      <Input
                        id="estado"
                        value={formData.estado}
                        onChange={(e) => setFormData({ ...formData, estado: e.target.value.toUpperCase() })}
                        placeholder="MA"
                        maxLength={2}
                      />
                    </div>
                    {!cepNoBanco && (
                      <p className="col-span-3 text-[11px] text-amber-700">
                        O CEP ainda não é gravado: falta aplicar a atualização do banco (coluna clientes.cep).
                      </p>
                    )}
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
                    {/* Coluna fixa: ao rolar a tabela para o lado o nome continua visível. */}
                    <th className="sticky left-0 z-20 bg-card shadow-[6px_0_8px_-6px_rgba(15,27,61,0.18)]">Empresa</th>
                    <th>Grupo</th>
                    <th>Segmento</th>
                    <th>CNPJ / E-mail</th>
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
                        <td className="sticky left-0 z-10 min-w-[150px] max-w-[170px] bg-card sm:min-w-[260px] sm:max-w-[340px] shadow-[6px_0_8px_-6px_rgba(15,27,61,0.18)] group-hover:bg-muted">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                              <Users className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              {editandoNomeId === cliente.id ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    autoFocus
                                    value={nomeTemp}
                                    disabled={salvandoNome}
                                    onChange={(e) => setNomeTemp(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') salvarNome(cliente);
                                      if (e.key === 'Escape') cancelarEdicaoNome();
                                    }}
                                    className="h-8 text-sm font-semibold"
                                    aria-label="Nome do cliente"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => salvarNome(cliente)}
                                    disabled={salvandoNome}
                                    title="Salvar (Enter)"
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
                                  >
                                    {salvandoNome ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={cancelarEdicaoNome}
                                    disabled={salvandoNome}
                                    title="Cancelar (Esc)"
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => iniciarEdicaoNome(cliente)}
                                  title="Clique para editar o nome"
                                  className="group/nome flex max-w-full items-center gap-1.5 text-left font-semibold text-foreground hover:text-primary"
                                >
                                  <span className="truncate">{cliente.nome_empresa}</span>
                                  <Pencil className="h-3.5 w-3.5 shrink-0 opacity-0 transition group-hover/nome:opacity-100" />
                                </button>
                              )}
                              {sistemasPorCliente[cliente.id]?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {sistemasPorCliente[cliente.id].map((sis) => (
                                    <Badge key={sis} variant="secondary" className="text-[10px] h-4 px-1.5 uppercase font-bold tracking-wider">
                                      {sis.trim()}
                                      {ehPontotel(sis) && vidasPorCliente[cliente.id] ? ` · ${vidasPorCliente[cliente.id]} vida${vidasPorCliente[cliente.id] === 1 ? '' : 's'}` : ''}
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
                            {(() => {
                              // CNPJ no lugar do telefone (o WhatsApp continua no menu ⋯).
                              const digitos = (cliente.cnpj || '').replace(/D/g, '');
                              if (!digitos) {
                                return <span className="text-xs italic text-muted-foreground">Sem CNPJ</span>;
                              }
                              const documento = digitos.length === 11 ? formatCpf(digitos) : formatCnpj(digitos);
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard?.writeText(documento).then(
                                      () => toast.success('CNPJ copiado', { description: documento }),
                                      () => toast.error('Não foi possível copiar')
                                    );
                                  }}
                                  title="Clique para copiar"
                                  className="group/item flex items-center gap-2 text-sm text-muted-foreground hover:text-primary"
                                >
                                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/5 transition-colors group-hover/item:bg-primary/10">
                                    <Building2 className="h-3 w-3 text-primary" />
                                  </span>
                                  <span className="whitespace-nowrap font-medium tabular-nums text-foreground/80">{documento}</span>
                                </button>
                              );
                            })()}
                            {cliente.email && (
                              <div className="group/item flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors cursor-default">
                                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/5 group-hover/item:bg-primary/10 transition-colors">
                                  <Mail className="h-3 w-3" />
                                </div>
                                <span className="truncate max-w-[150px]">{cliente.email}</span>
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
