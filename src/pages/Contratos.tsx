import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, FileText, MoreHorizontal, Edit, Trash2, Eye, CheckCircle, Printer, Link, ExternalLink, Settings, Building2, Save, Download, BookCopy, ShieldCheck, Upload, Key } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import ModelosContrato from '@/components/contratos/ModelosContrato';
import TituloClausula from '@/components/contratos/TituloClausula';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Cliente {
  id: string;
  nome_empresa: string;
  email: string | null;
  telefone: string | null;
  segmento: string | null;
  valor_mensalidade: number | null;
  valor_implantacao: number | null;
  cnpj: string | null;
  nome_dono?: string | null;
  cpf_dono?: string | null;
  endereco: string | null;
  cidade: string | null;
  estado: string | null;
}

interface Contrato {
  id: string;
  cliente_id: string;
  empresa_id: string | null;
  numero_contrato: string | null;
  data_inicio: string;
  data_fim: string | null;
  vigencia_meses: number | null;
  valor_software: number | null;
  valor_mensalidade: number | null;
  quantidade_licencas: number | null;
  valor_km_deslocamento: number | null;
  sistema: string | null;
  status: string;
  contratante_nome: string | null;
  contratante_endereco: string | null;
  contratante_cidade: string | null;
  contratante_estado: string | null;
  contratante_cnpj: string | null;
  contratante_nome_dono?: string | null;
  contratante_cpf_dono?: string | null;
  assinado: boolean | null;
  data_assinatura: string | null;
  observacoes: string | null;
  /** Campo livre: link externo que o usuário cola (Google Drive, etc.). */
  link_documento: string | null;
  /** Caminho do PDF assinado no bucket; a URL de acesso é gerada sob demanda. */
  documento_path?: string | null;
  is_digital_sign?: boolean | null;
  created_at: string | null;
}

interface ConfigContrato {
  id?: string;
  empresa_id?: string | null;
  contratado_nome: string;
  contratado_cnpj: string;
  contratado_endereco: string;
  contratado_cidade: string;
  contratado_estado: string;
  contratado_email: string;
  contratado_telefone: string;
  horario_atendimento: string;
  clausulas_adicionais: string;
  indice_reajuste: string;
  prazo_aviso_rescisao: number;
  foro_comarca: string;
  logo_url: string;
  mostrar_marca_dagua: boolean;
}

const defaultConfig: ConfigContrato = {
  contratado_nome: '',
  contratado_cnpj: '',
  contratado_endereco: '',
  contratado_cidade: '',
  contratado_estado: '',
  contratado_email: '',
  contratado_telefone: '',
  horario_atendimento: '08:00hs às 18:00hs, de segunda a sábado',
  clausulas_adicionais: '',
  indice_reajuste: 'IGP-M/FGV',
  prazo_aviso_rescisao: 30,
  foro_comarca: '',
  logo_url: '',
  mostrar_marca_dagua: true,
};

/** Formata um número como moeda brasileira. */
const formatCurrency = (value: number | null) => {
  if (value === null || value === undefined) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
};

/** Formata uma data ISO no padrão dd/mm/aaaa. */
const formatDate = (date: string | null) => {
  if (!date) return '-';
  return new Date(date + 'T00:00:00').toLocaleDateString('pt-BR');
};

/**
 * Contratos: emissão, visualização, impressão, exportação em PDF e assinatura
 * com certificado digital.
 *
 * A assinatura acontece na Edge Function `assinar-contrato` (o certificado e a
 * senha são enviados para lá). O PDF resultante fica num bucket privado, e o
 * link de acesso é gerado sob demanda com validade curta.
 */
export default function Contratos() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [sistemas, setSistemas] = useState<{ id: string; nome: string }[]>([]);
  const [sistemasPorCliente, setSistemasPorCliente] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ativo');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingContrato, setViewingContrato] = useState<Contrato | null>(null);
  const [editingContrato, setEditingContrato] = useState<Contrato | null>(null);
  const [activeTab, setActiveTab] = useState('contratos');
  const [config, setConfig] = useState<ConfigContrato>(defaultConfig);
  const [configId, setConfigId] = useState<string | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [isDigitalSignDialogOpen, setIsDigitalSignDialogOpen] = useState(false);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [signatures, setSignatures] = useState<any[]>([]);
  const [modelos, setModelos] = useState<{ id: string; nome: string; clausulas: { id: string; titulo: string; conteudo: string }[] }[]>([]);
  const [planos, setPlanos] = useState<{ id: string; nome: string; valor_mensalidade: number; valor_implantacao: number; recursos: string[] | null }[]>([]);

  const [formData, setFormData] = useState({
    cliente_id: '',
    numero_contrato: 'GERANDO...',
    data_inicio: new Date().toISOString().split('T')[0],
    vigencia_meses: 12,
    valor_software: 0,
    valor_mensalidade: 0,
    quantidade_licencas: 3,
    valor_km_deslocamento: 0,
    sistema: '',
    contratante_nome: '',
    contratante_endereco: '',
    contratante_cidade: '',
    contratante_estado: '',
    contratante_cnpj: '',
    contratante_nome_dono: '',
    contratante_cpf_dono: '',
    observacoes: '',
    link_documento: '',
    modelo_id: '',
    plano_id: '',
    plano_nome: '',
    plano_recursos: [] as string[],
  });

  /** Carrega contratos, clientes e configurações, tudo limitado pelo RLS. */
  const fetchData = async () => {
    try {
      const [contratosRes, clientesRes, sistemasRes, configRes, modelosRes, planosRes] = await Promise.all([
        supabase.from('contratos').select('*').order('created_at', { ascending: false }),
        supabase.from('clientes').select('id, nome_empresa, email, telefone, segmento, valor_mensalidade, valor_implantacao, cnpj, nome_dono, cpf_dono, endereco, cidade, estado'),
        supabase.from('sistemas').select('id, nome').eq('ativo', true),
        supabase.from('configuracao_contrato').select('*').maybeSingle(),
        supabase.from('modelos_contrato').select('id, nome, clausulas').eq('ativo', true).order('nome'),
        supabase.from('tabela_precos').select('id, nome, valor_mensalidade, valor_implantacao, recursos').eq('ativo', true).order('ordem'),
      ]);

      if (contratosRes.error) throw contratosRes.error;
      setContratos(contratosRes.data || []);
      setClientes(clientesRes.data || []);
      setSistemas(sistemasRes.data || []);
      setModelos(((modelosRes.data || []) as any[]).map((m) => ({
        id: m.id,
        nome: m.nome,
        clausulas: Array.isArray(m.clausulas) ? m.clausulas : [],
      })));
      setPlanos(((planosRes.data || []) as any[]).map((p) => ({
        id: p.id,
        nome: p.nome,
        valor_mensalidade: Number(p.valor_mensalidade) || 0,
        valor_implantacao: Number(p.valor_implantacao) || 0,
        recursos: p.recursos || [],
      })));
      
      // Fetch active licenses for clients to show in the table
      const clienteIds = (clientesRes.data || []).map(c => c.id);
      if (clienteIds.length > 0) {
        const { data: lics } = await supabase
          .from('licencas')
          .select('cliente_id, sistema:sistemas(nome)')
          .eq('status', 'ativo')
          .in('cliente_id', clienteIds);
        
        const map: Record<string, string[]> = {};
        (lics || []).forEach((l: any) => {
          if (!map[l.cliente_id]) map[l.cliente_id] = [];
          const sistemaNome = l.sistema?.nome;
          if (sistemaNome && !map[l.cliente_id].includes(sistemaNome)) {
            map[l.cliente_id].push(sistemaNome);
          }
        });
        setSistemasPorCliente(map);
      }

      if (configRes.data) {
        setConfigId(configRes.data.id);
        setConfig({
          contratado_nome: configRes.data.contratado_nome || '',
          contratado_cnpj: configRes.data.contratado_cnpj || '',
          contratado_endereco: configRes.data.contratado_endereco || '',
          contratado_cidade: configRes.data.contratado_cidade || '',
          contratado_estado: configRes.data.contratado_estado || '',
          contratado_email: configRes.data.contratado_email || '',
          contratado_telefone: configRes.data.contratado_telefone || '',
          horario_atendimento: configRes.data.horario_atendimento || defaultConfig.horario_atendimento,
          clausulas_adicionais: configRes.data.clausulas_adicionais || '',
          indice_reajuste: configRes.data.indice_reajuste || 'IGP-M/FGV',
          prazo_aviso_rescisao: configRes.data.prazo_aviso_rescisao || 30,
          foro_comarca: configRes.data.foro_comarca || '',
          logo_url: configRes.data.logo_url || '',
          mostrar_marca_dagua: (configRes.data as any).mostrar_marca_dagua ?? true,
        });
      }
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

  /** Sugere o próximo número sequencial de contrato a partir dos já emitidos. */
  const getProximoNumeroContrato = () => {
    if (contratos.length === 0) return "001/" + new Date().getFullYear();
    
    const nums = contratos
      .map(c => c.numero_contrato?.split('/')[0])
      .filter(n => n && !isNaN(parseInt(n)))
      .map(n => parseInt(n || "0"));
    
    const max = nums.length > 0 ? Math.max(...nums) : 0;
    const proximo = (max + 1).toString().padStart(3, '0');
    return `${proximo}/${new Date().getFullYear()}`;
  };

  useEffect(() => {
    if (!dialogOpen) return;
    if (!editingContrato) {
      setFormData(prev => ({ ...prev, numero_contrato: getProximoNumeroContrato() }));
    }
  }, [dialogOpen, editingContrato, contratos]);

  /** Salva os dados da contratada (nome, CNPJ, logo) usados no cabeçalho do PDF. */
  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const { data: profile } = await supabase.from('usuario_perfil').select('empresa_id').maybeSingle();

      if (configId) {
        const { error } = await supabase
          .from('configuracao_contrato')
          .update({ ...config, updated_at: new Date().toISOString() })
          .eq('id', configId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('configuracao_contrato')
          .insert({ ...config, empresa_id: profile?.empresa_id || null })
          .select('id')
          .single();
        if (error) throw error;
        setConfigId(data.id);
      }
      toast.success('Configurações salvas!');
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar configurações');
    } finally {
      setSavingConfig(false);
    }
  };

  const resetForm = () => {
    setFormData({
      cliente_id: '', numero_contrato: '',
      data_inicio: new Date().toISOString().split('T')[0],
      vigencia_meses: 12, valor_software: 0, valor_mensalidade: 0,
      quantidade_licencas: 3, valor_km_deslocamento: 0, sistema: '',
      contratante_nome: '', contratante_endereco: '', contratante_cidade: '',
      contratante_estado: '', contratante_cnpj: '', contratante_nome_dono: '', contratante_cpf_dono: '',
      observacoes: '', link_documento: '',
      modelo_id: '', plano_id: '', plano_nome: '', plano_recursos: [] as string[],
    });
  };

  /** Ao escolher o cliente, copia os dados cadastrais dele para o contrato. */
  const handleClienteChange = async (clienteId: string) => {
    setFormData(prev => ({ ...prev, cliente_id: clienteId }));

    const clienteLocal = clientes.find(c => c.id === clienteId);

    try {
      const { data: clienteDb, error } = await supabase
        .from('clientes')
        .select('nome_empresa, valor_mensalidade, valor_implantacao, cnpj, nome_dono, cpf_dono, endereco, cidade, estado')
        .eq('id', clienteId)
        .maybeSingle();

      if (error) throw error;

      const cliente = clienteDb || clienteLocal;
      if (!cliente) return;

      setFormData(prev => ({
        ...prev,
        cliente_id: clienteId,
        contratante_nome: cliente.nome_empresa || '',
        contratante_cnpj: cliente.cnpj || '',
        contratante_nome_dono: (cliente as any).nome_dono || '',
        contratante_cpf_dono: (cliente as any).cpf_dono || '',
        contratante_endereco: cliente.endereco || '',
        contratante_cidade: cliente.cidade || '',
        contratante_estado: cliente.estado || '',
        valor_mensalidade: Number(cliente.valor_mensalidade) || 0,
        valor_software: Number(cliente.valor_implantacao) || 0,
      }));
    } catch {
      if (!clienteLocal) {
        toast.error('Não foi possível carregar os dados completos do cliente');
        return;
      }

      setFormData(prev => ({
        ...prev,
        cliente_id: clienteId,
        contratante_nome: clienteLocal.nome_empresa || '',
        contratante_cnpj: clienteLocal.cnpj || '',
        contratante_nome_dono: (clienteLocal as any).nome_dono || '',
        contratante_cpf_dono: (clienteLocal as any).cpf_dono || '',
        contratante_endereco: clienteLocal.endereco || '',
        contratante_cidade: clienteLocal.cidade || '',
        contratante_estado: clienteLocal.estado || '',
        valor_mensalidade: Number(clienteLocal.valor_mensalidade) || 0,
        valor_software: Number(clienteLocal.valor_implantacao) || 0,
      }));
    }
  };

  /** Calcula a data de término somando a vigência em meses à data de início. */
  const calcularDataFim = (dataInicio: string, meses: number) => {
    const date = new Date(dataInicio + 'T00:00:00');
    date.setMonth(date.getMonth() + meses);
    return date.toISOString().split('T')[0];
  };

  /** Salva o contrato (novo ou editado). */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.cliente_id) { toast.error('Selecione um cliente'); return; }
    try {
      const { data: profile } = await supabase.from('usuario_perfil').select('empresa_id').maybeSingle();
      const dataFim = calcularDataFim(formData.data_inicio, formData.vigencia_meses);
      const payload = {
        ...formData,
        modelo_id: formData.modelo_id || null,
        plano_id: formData.plano_id || null,
        plano_nome: formData.plano_nome || null,
        plano_recursos: formData.plano_recursos?.length ? formData.plano_recursos : null,
        empresa_id: profile?.empresa_id || null,
        data_fim: dataFim,
        status: 'ativo',
      };

      if (editingContrato) {
        const { error } = await supabase.from('contratos').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingContrato.id);
        if (error) throw error;
        toast.success('Contrato atualizado!');
      } else {
        const { error } = await supabase.from('contratos').insert(payload);
        if (error) throw error;
        toast.success('Contrato criado com sucesso!');
      }
      setDialogOpen(false); setEditingContrato(null); resetForm(); fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar contrato');
    }
  };

  /** Abre o formulário preenchido com o contrato escolhido. */
  const handleEdit = (contrato: Contrato) => {
    setEditingContrato(contrato);
    setFormData({
      cliente_id: contrato.cliente_id,
      numero_contrato: contrato.numero_contrato || '',
      data_inicio: contrato.data_inicio,
      vigencia_meses: contrato.vigencia_meses || 12,
      valor_software: Number(contrato.valor_software) || 0,
      valor_mensalidade: Number(contrato.valor_mensalidade) || 0,
      quantidade_licencas: contrato.quantidade_licencas || 3,
      valor_km_deslocamento: Number(contrato.valor_km_deslocamento) || 0,
      sistema: contrato.sistema || '',
      contratante_nome: contrato.contratante_nome || '',
      contratante_endereco: contrato.contratante_endereco || '',
      contratante_cidade: contrato.contratante_cidade || '',
      contratante_estado: contrato.contratante_estado || '',
      contratante_cnpj: contrato.contratante_cnpj || '',
      contratante_nome_dono: (contrato as any).contratante_nome_dono || '',
      contratante_cpf_dono: (contrato as any).contratante_cpf_dono || '',
      observacoes: contrato.observacoes || '',
      link_documento: contrato.link_documento || '',
      modelo_id: (contrato as any).modelo_id || '',
      plano_id: (contrato as any).plano_id || '',
      plano_nome: (contrato as any).plano_nome || '',
      plano_recursos: ((contrato as any).plano_recursos || []) as string[],
    });
    setDialogOpen(true);
  };

  /** Exclui o contrato após confirmação. */
  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este contrato?')) return;
    try {
      const { error } = await supabase.from('contratos').delete().eq('id', id);
      if (error) throw error;
      toast.success('Contrato excluído!'); fetchData();
    } catch { toast.error('Erro ao excluir contrato'); }
  };

  /** Marca o contrato como assinado manualmente (fora do fluxo de certificado). */
  const handleAssinar = async (id: string) => {
    try {
      const { error } = await supabase.from('contratos')
        .update({ assinado: true, data_assinatura: new Date().toISOString(), is_digital_sign: false })
        .eq('id', id);
      if (error) throw error;
      toast.success('Contrato assinado!'); fetchData();
    } catch { toast.error('Erro ao assinar contrato'); }
  };

  /** Abre a visualização do contrato em tela cheia. */
  const handleView = (contrato: Contrato) => {
    setViewingContrato(contrato);
    setViewDialogOpen(true);
  };

  /**
   * Assina o contrato com certificado digital A1 (.pfx).
   *
   * O arquivo vai em base64 para a Edge Function, que é quem tem a service role
   * para gravar no bucket. A senha do certificado trafega no corpo da requisição
   * (HTTPS) e não é armazenada em lugar nenhum.
   */
  const handleDigitalSign = async () => {
    if (!viewingContrato) return;
    if (!certificateFile) {
      toast.error('Por favor, selecione o arquivo do certificado (.pfx ou .p12)');
      return;
    }
    if (!certPassword) {
      toast.error('Por favor, informe a senha do certificado');
      return;
    }
    
    setIsSigning(true);
    try {
      // Converter arquivo para base64
      const reader = new FileReader();
      const pfxBase64 = await new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(certificateFile);
      });

      // O log anterior imprimia o payload da assinatura no console do
      // navegador. Mesmo sem a senha, expunha dados do contrato em um lugar
      // que fica visível em suporte remoto e em gravação de tela.
      const { data, error } = await supabase.functions.invoke('assinar-contrato', {
        body: {
          contratoId: viewingContrato.id,
          pfxBase64,
          password: certPassword,
          nomeAssinante: viewingContrato.contratante_nome || 'Assinante',
          cpfCnpj: viewingContrato.contratante_cnpj || '000.000.000-00',
        }
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
        
      toast.success('Contrato assinado digitalmente com sucesso!');
      setIsDigitalSignDialogOpen(false);
      setCertificateFile(null);
      setCertPassword('');
      fetchData();
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'Erro ao processar assinatura digital. Verifique a senha e o certificado.');
    } finally {
      setIsSigning(false);
    }
  };

  /** Resolve o nome do cliente a partir do id, para exibição na tabela. */
  const getClienteName = (clienteId: string) => clientes.find(c => c.id === clienteId)?.nome_empresa || 'Cliente não encontrado';

  /** Aplica busca e filtro de status sobre a lista carregada. */
  const filteredContratos = contratos.filter((c) => {
    const clienteName = getClienteName(c.cliente_id);
    const matchesSearch = clienteName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.numero_contrato?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  /** Devolve o selo visual do contrato (assinado tem precedência sobre o status). */
  const getStatusBadge = (status: string, assinado: boolean | null) => {
    if (assinado) return <Badge variant="outline">✓ Assinado</Badge>;
    const cfg: Record<string, string> = { ativo: 'status-ativo', inativo: 'status-inativo', cancelado: 'status-vencido' };
    return <span className={`status-badge ${cfg[status] || ''}`}>{status}</span>;
  };

  /** Dispara a impressão da visualização do contrato. */
  const handlePrint = () => { window.print(); };

  /**
   * Baixa o contrato em PDF.
   *
   * Quando já existe um PDF assinado no Storage, gera uma URL assinada na hora
   * (válida por 5 minutos) a partir do caminho salvo em `documento_path`.
   * Antes o banco guardava uma URL pronta com 1 ano de validade e o código
   * apenas a reabria — qualquer cópia daquele link dava acesso ao documento
   * por 12 meses. Nos demais casos, renderiza a visualização atual em PDF.
   */
  const handleExportPDF = async () => {
    if (viewingContrato?.assinado && viewingContrato.documento_path && viewingContrato.is_digital_sign) {
      const { data, error } = await supabase.storage
        .from('contratos-assinados')
        .createSignedUrl(viewingContrato.documento_path, 300);
      if (error || !data?.signedUrl) {
        toast.error('Não foi possível abrir o contrato assinado.');
        return;
      }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!viewingContrato) return;

    const element = document.getElementById('contract-document') as HTMLElement | null;
    if (!element) {
      toast.error('Visualização não encontrada');
      return;
    }

    toast.info('Gerando PDF...');
    try {
      // Aguarda imagens carregarem
      const imgs = Array.from(element.querySelectorAll('img'));
      await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(res => { img.onload = img.onerror = () => res(null); })));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();   // 210
      const pdfHeight = pdf.internal.pageSize.getHeight(); // 297

      // A página é formada a partir de cortes seguros entre blocos de texto.
      // Isso evita cortar letras/linhas no meio, como acontecia no fatiamento fixo do canvas.
      const imgWidth = pdfWidth;
      const pxPerMm = canvas.width / imgWidth;
      const pageHeightPx = Math.floor((pdfHeight - 8) * pxPerMm);
      const elementRect = element.getBoundingClientRect();
      const scaleY = canvas.height / elementRect.height;
      const canvasContext = canvas.getContext('2d');
      const protectedBufferPx = Math.max(12, Math.round(pxPerMm * 3));
      const minSliceHeightPx = Math.max(220, Math.round(pxPerMm * 55));

      const toCanvasY = (value: number) => value * scaleY;
      const keepContainers = Array.from(element.querySelectorAll('[data-pdf-keep="true"]')) as HTMLElement[];
      const isInsideKeep = (node: HTMLElement) => keepContainers.some(container => container !== node && container.contains(node));
      const safeBreaks: number[] = [];
      const addSafeBreak = (value: number) => {
        const y = Math.round(value);
        if (Number.isFinite(y) && y > 0 && y < canvas.height) safeBreaks.push(y);
      };

      Array.from(element.querySelectorAll('h2')).forEach((node) => {
        const r = (node as HTMLElement).getBoundingClientRect();
        addSafeBreak(toCanvasY(r.top - elementRect.top) - protectedBufferPx);
      });

      Array.from(element.querySelectorAll('p')).forEach((node) => {
        const paragraph = node as HTMLElement;
        if (isInsideKeep(paragraph)) return;
        const r = paragraph.getBoundingClientRect();
        addSafeBreak(toCanvasY(r.top - elementRect.top) - protectedBufferPx);
        addSafeBreak(toCanvasY(r.bottom - elementRect.top) + protectedBufferPx);
      });

      keepContainers.forEach((node) => {
        const r = node.getBoundingClientRect();
        addSafeBreak(toCanvasY(r.top - elementRect.top) - protectedBufferPx);
        addSafeBreak(toCanvasY(r.bottom - elementRect.top) + protectedBufferPx);
      });

      safeBreaks.sort((a, b) => a - b);

      const findWhitespaceCut = (idealCut: number, pageStart: number) => {
        if (!canvasContext || idealCut >= canvas.height) return idealCut;
        const searchBackPx = Math.min(pageHeightPx * 0.35, Math.max(260, pxPerMm * 65));
        const bandHeight = Math.max(10, Math.round(pxPerMm * 3));
        const searchStart = Math.floor(Math.max(pageStart + minSliceHeightPx, idealCut - searchBackPx));
        const searchEnd = Math.floor(Math.min(idealCut - bandHeight, canvas.height - bandHeight));
        if (searchEnd <= searchStart) return idealCut;

        const searchHeight = searchEnd - searchStart + bandHeight;
        const imageData = canvasContext.getImageData(0, searchStart, canvas.width, searchHeight).data;
        let bestCut = idealCut;
        let bestScore = Number.POSITIVE_INFINITY;

        for (let localY = searchEnd - searchStart; localY >= 0; localY--) {
          let inkScore = 0;
          for (let yOffset = 0; yOffset < bandHeight; yOffset += 2) {
            const rowOffset = (localY + yOffset) * canvas.width * 4;
            for (let x = 0; x < canvas.width; x += 4) {
              const idx = rowOffset + x * 4;
              if (imageData[idx] < 245 || imageData[idx + 1] < 245 || imageData[idx + 2] < 245) {
                inkScore++;
              }
            }
          }

          if (inkScore < bestScore) {
            bestScore = inkScore;
            bestCut = searchStart + localY + Math.floor(bandHeight / 2);
            if (inkScore === 0) break;
          }
        }

        return bestCut;
      };

      const findSafeCut = (pageStart: number, idealCut: number) => {
        if (idealCut >= canvas.height) return canvas.height;
        const preferred = safeBreaks.filter(y => y > pageStart + minSliceHeightPx && y <= idealCut - protectedBufferPx);
        if (preferred.length > 0) return preferred[preferred.length - 1];

        const fallbackSafe = safeBreaks.filter(y => y > pageStart + Math.round(pxPerMm * 20) && y <= idealCut - protectedBufferPx);
        if (fallbackSafe.length > 0) return fallbackSafe[fallbackSafe.length - 1];

        return findWhitespaceCut(idealCut, pageStart);
      };

      let renderedPx = 0;
      let pageIndex = 0;
      while (renderedPx < canvas.height) {
        let sliceHeight = Math.min(pageHeightPx, canvas.height - renderedPx);
        let cutAt = renderedPx + sliceHeight;

        if (cutAt < canvas.height) {
          cutAt = findSafeCut(renderedPx, cutAt);
          sliceHeight = cutAt - renderedPx;
          if (sliceHeight < minSliceHeightPx) sliceHeight = Math.min(pageHeightPx, canvas.height - renderedPx);
        }

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const ctx = pageCanvas.getContext('2d');
        if (!ctx) break;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
        const imgData = pageCanvas.toDataURL('image/png');
        if (pageIndex > 0) pdf.addPage();
        const sliceMm = sliceHeight / pxPerMm;
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, sliceMm, undefined, 'FAST');
        renderedPx += sliceHeight;
        pageIndex++;
      }

      const cliente = clientes.find(c => c.id === viewingContrato.cliente_id);
      const clienteName = cliente?.nome_empresa || 'contrato';
      pdf.save(`Contrato_${clienteName.replace(/\s+/g, '_')}.pdf`);
      toast.success('PDF exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast.error('Erro ao gerar PDF');
    }
  };


  const ContractDocument = ({ contrato }: { contrato: Contrato }) => {
    const cliente = clientes.find(c => c.id === contrato.cliente_id);
    const dataInicio = formatDate(contrato.data_inicio);
    const dataFim = formatDate(contrato.data_fim);
    const nomeContratante = contrato.contratante_nome || cliente?.nome_empresa || '……………..';
    const nomeContratado = config.contratado_nome || 'ImperialTech';
    // Logo do cabeçalho. O padrão é `/logo.png`, servido pela pasta `public/`
    // do próprio projeto — antes o fallback apontava para um caminho interno do
    // CDN do Lovable (`/__l5e/assets-v1/...`), que só existe no preview deles e
    // dava 404 em qualquer outro lugar, deixando o contrato sem logo.
    const LOGO_PADRAO = "/logo.png";
    const logoUrl = config.logo_url || LOGO_PADRAO;

    /** Se o logo configurado não carregar, cai no padrão em vez de deixar o
     *  ícone de imagem quebrada no meio do documento. */
    const aoFalharLogo = (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      if (img.src.endsWith(LOGO_PADRAO)) { img.style.visibility = "hidden"; return; }
      img.src = LOGO_PADRAO;
    };

    const planoNome = (contrato as any).plano_nome as string | null;
    const planoRecursos: string[] = ((contrato as any).plano_recursos || []) as string[];
    const modelo = modelos.find((m) => m.id === (contrato as any).modelo_id);

    const variaveis: Record<string, string> = {
      sistema: contrato.sistema || '……………...',
      plano: planoNome || '——',
      quantidade_licencas: String(contrato.quantidade_licencas ?? ''),
      vigencia_meses: String(contrato.vigencia_meses ?? ''),
      data_inicio: dataInicio,
      data_fim: dataFim,
      valor_software: formatCurrency(contrato.valor_software),
      valor_mensalidade: formatCurrency(contrato.valor_mensalidade),
      valor_km_deslocamento: formatCurrency(contrato.valor_km_deslocamento),
      horario_atendimento: config.horario_atendimento || '',
      foro_comarca: config.foro_comarca || '…………………..',
      prazo_aviso_rescisao: String(config.prazo_aviso_rescisao ?? 30),
      contratante: nomeContratante,
      contratado: nomeContratado,
      indice_reajuste: config.indice_reajuste || '',
    };
    const aplicarVariaveis = (texto: string) =>
      (texto || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, chave) => variaveis[chave] ?? '');

    const modeloClausulas = modelo && modelo.clausulas.length > 0 ? (
      <>
        {modelo.clausulas.map((c, i) => (
          <section key={c.id || i} className="relative z-10 mb-6">
            <h2 className="font-bold uppercase text-sm mb-3 text-[#331470] flex items-center gap-2">
              <span className="w-6 h-6 bg-[#331470] text-white flex items-center justify-center rounded text-[10px]">
                {String(i + 1).padStart(2, '0')}
              </span>
              {aplicarVariaveis(c.titulo)}
            </h2>
            <div className="text-justify whitespace-pre-line">{aplicarVariaveis(c.conteudo)}</div>
          </section>
        ))}
        {config.clausulas_adicionais && (
          <section>
            <h2 className="font-bold uppercase text-sm mb-2 text-black">Cláusulas Adicionais</h2>
            <div className="text-justify indent-8 whitespace-pre-line">{config.clausulas_adicionais}</div>
          </section>
        )}
      </>
    ) : null;

    return (
      <div id="contract-document" className="bg-white text-black shadow-xl rounded-sm mx-auto print:shadow-none relative overflow-hidden" style={{ 
        width: '210mm', 
        padding: '0', 
        fontFamily: "Arial, sans-serif", 
        fontSize: '11pt', 
        lineHeight: '1.6',
        color: '#1a1a2e',
        backgroundColor: '#fff',
        minHeight: '297mm',
        WebkitFontSmoothing: 'antialiased'
      }}>

        {/* Barra Lateral Premium */}
        <div className="absolute left-0 top-0 bottom-0 w-4 bg-[#331470]" />

        {/* Elementos Abstratos no Cabeçalho */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-[#331470] opacity-[0.03] rounded-full" />
        <div className="absolute top-10 right-10 w-32 h-32 bg-[#331470] opacity-[0.05] rounded-full" />

        {/* Marca d'água central */}
        {config.mostrar_marca_dagua && (
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] pointer-events-none" style={{ zIndex: 0 }}>
            <img src={logoUrl} alt="" className="w-[400px]" crossOrigin="anonymous" onError={aoFalharLogo} />
          </div>
        )}

        {/* Conteúdo do contrato */}
        <div style={{ padding: '25mm 25mm 25mm 35mm', position: 'relative', zIndex: 10 }}>
          {/* Cabeçalho */}
          <div className="flex justify-between items-start mb-12">
            <div>
              <img
                src={logoUrl}
                alt="Logo"
                crossOrigin="anonymous"
                onError={aoFalharLogo}
                style={{ height: '56px', objectFit: 'contain', objectPosition: 'left', marginBottom: '14px' }}
              />
              <div className="w-20 h-1 bg-[#331470] rounded-full" />
            </div>
            <div className="text-right">
              <div
                style={{
                  background: '#331470',
                  padding: '8px 24px',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontSize: '9pt',
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  display: 'inline-block',
                  marginBottom: '10px'
                }}
              >
                CONTRATO DE SERVIÇOS
              </div>
              {contrato.numero_contrato && (
                <p className="text-xs font-bold text-[#331470]">DOC: {contrato.numero_contrato}</p>
              )}
            </div>
          </div>

          <div className="mb-10 bg-[#9470db15] p-6 rounded-lg border-l-4 border-[#331470]">
            <h1 className="text-xl font-sans font-bold tracking-tight uppercase text-[#331470] mb-4">
              Prestação de Serviços de Software
            </h1>
            <div className="grid grid-cols-3 gap-6 text-[9pt]">
              <div>
                <p className="font-bold text-[#331470] uppercase text-[7pt] mb-1">Contratante</p>
                <p className="font-medium">{nomeContratante.substring(0, 35)}</p>
              </div>
              <div>
                <p className="font-bold text-[#331470] uppercase text-[7pt] mb-1">CNPJ/CPF</p>
                <p className="font-medium">{contrato.contratante_cnpj || '---'}</p>
              </div>
              <div>
                <p className="font-bold text-[#331470] uppercase text-[7pt] mb-1">Emissão</p>
                <p className="font-medium">{new Date().toLocaleDateString('pt-BR')}</p>
              </div>
            </div>
          </div>




        {/* Preâmbulo */}
        <p className="text-justify mb-6 indent-8">
          Pelo presente Instrumento Particular de Contrato de Prestação de Serviços, de um lado{' '}
          <strong>{nomeContratado}</strong>, pessoa jurídica
          {config.contratado_endereco && <>, com sede à {config.contratado_endereco}</>}
          {config.contratado_cidade && <>, na cidade {config.contratado_cidade}</>}
          {config.contratado_cnpj && <>, CNPJ nº <strong>{config.contratado_cnpj}</strong></>}
          , doravante designada simplesmente <strong>CONTRATADO</strong>, e de outro lado,{' '}
          {contrato.contratante_nome_dono ? (
            <>
              <strong>{contrato.contratante_nome_dono}</strong>
              {contrato.contratante_cpf_dono && <>, inscrito no CPF sob o nº <strong>{contrato.contratante_cpf_dono}</strong></>}
              {nomeContratante && <>, representante da empresa <strong>{nomeContratante}</strong></>}
              {contrato.contratante_endereco && <>, com sede na {contrato.contratante_endereco}</>}
              {contrato.contratante_cidade && <>, cidade de {contrato.contratante_cidade}</>}
              {contrato.contratante_estado && <>, {contrato.contratante_estado}</>}
              , doravante denominado <strong>CONTRATANTE</strong>
            </>
          ) : (
            <>
              <strong>{nomeContratante}</strong>
              {contrato.contratante_endereco && <>, com sede na {contrato.contratante_endereco}</>}
              {contrato.contratante_cidade && <>, cidade de {contrato.contratante_cidade}</>}
              {contrato.contratante_estado && <>, {contrato.contratante_estado}</>}
              {contrato.contratante_cnpj && <>, inscrita no CNPJ/MF sob o nº <strong>{contrato.contratante_cnpj}</strong></>}
              , adiante denominado simplesmente <strong>CONTRATANTE</strong>
            </>
          )}.
        </p>

        <p className="text-justify mb-8 indent-8">
          As partes acima identificadas têm, entre si, justas e acertadas o presente Contrato de prestação de serviços de Software, que se regerá pelas seguintes cláusulas e condições:
        </p>

        <div className="space-y-6" style={{ pageBreakInside: 'auto' }}>
          {planoNome && (
            <section className="relative z-10 mb-6 border border-[#33147030] rounded-lg p-4 bg-[#9470db0d]">
              <h2 className="font-bold uppercase text-sm mb-2 text-[#331470]">Plano Contratado</h2>
              <p className="text-justify">
                <strong>{planoNome}</strong> — Mensalidade de <strong>{formatCurrency(contrato.valor_mensalidade)}</strong>
                {Number(contrato.valor_software) > 0 && <> e implantação de <strong>{formatCurrency(contrato.valor_software)}</strong></>}.
              </p>
              {planoRecursos.length > 0 && (
                <ul className="mt-2 list-disc pl-8">
                  {planoRecursos.map((r, i) => (<li key={i}>{r}</li>))}
                </ul>
              )}
            </section>
          )}
          {modeloClausulas ? modeloClausulas : (<>

          {/* CLÁUSULA PRIMEIRA */}
          <section className="relative z-10 mb-6">
            <TituloClausula numero="01" titulo="Do Objeto do Contrato" />

            <p className="text-justify indent-10 mb-2">
              <strong>1.1.</strong> O presente contrato tem como objeto, a prestação, pelo CONTRATADO, de serviços de suporte técnico do Sistema <strong>{contrato.sistema || '……………...'}</strong>.
            </p>
            <p className="text-justify indent-10">
              <strong>1.2.</strong> O presente contrato concede ao CONTRATANTE uma licença de uso mensal do software, de caráter não exclusivo e intransferível, válida enquanto perdurar a vigência deste contrato e o adimplemento das obrigações aqui pactuadas. A licença será renovada automaticamente a cada mês mediante o pagamento da mensalidade correspondente.
            </p>
          </section>

          {/* CLÁUSULA SEGUNDA */}
          <section className="relative z-10">
            <TituloClausula numero="02" titulo="Prazo de Vigência" />
            <p className="text-justify indent-10">
              <strong>2.1.</strong> O período de vigência deste contrato é de <strong>{dataInicio}</strong> à <strong>{dataFim}</strong> e poderá ser renovado por iguais e sucessivos períodos, mediante termo aditivo.
            </p>
          </section>

          {/* CLÁUSULA TERCEIRA */}
          <section style={{ pageBreakInside: 'avoid' }} className="relative z-10">
            <TituloClausula numero="03" titulo="Da Execução dos Serviços" />
            <p className="text-justify indent-8 mb-2">
              <strong>3.1.</strong> Os serviços serão prestados por profissional designado pelo CONTRATADO no horário de <strong>{config.horario_atendimento}</strong>, de segunda a sábado, salvo feriados
              {config.contratado_email && <>, e-mails: <strong>{config.contratado_email}</strong></>}
              {config.contratado_telefone && <>, Whatsapp: <strong>{config.contratado_telefone}</strong></>}
              . O deslocamento de cidade para o cliente será cobrado um valor de <strong>{formatCurrency(Number(contrato.valor_km_deslocamento))}</strong> por KM rodado conforme relatório assinado pelo cliente, mais despesas de alimentação e estadia se necessário.
            </p>
            <p className="text-justify indent-8 mb-2">
              <strong>3.2.</strong> A administração, supervisão e gerenciamento no que tange à execução dos serviços prestados, pelo profissional encaminhado pela CONTRATANTE, ficarão sob responsabilidade exclusiva do CONTRATADO.
            </p>
            <p className="text-justify indent-8">
              <strong>3.3.</strong> O CONTRATANTE contará também com o Suporte Técnico direto com a LICENCIANTE por meio eletrônico, à distância, pelo prazo de 90 dias e através dos meios descritos e previsto em cláusula específica do contrato de uso do sistema.
            </p>
          </section>

          {/* CLÁUSULA QUARTA */}
          <section style={{ pageBreakInside: 'avoid' }} className="relative z-10">
            <TituloClausula numero="04" titulo="Preço e Forma de Pagamento (Modelo SaaS Mensal)" />
            <p className="text-justify indent-8 mb-2">
              <strong>4.1.</strong> O valor da implantação do sistema é de <strong>{formatCurrency(Number(contrato.valor_software))}</strong>, e a mensalidade do serviço SaaS é de <strong>{formatCurrency(Number(contrato.valor_mensalidade))}</strong>, com vencimento todo dia <strong>10</strong> de cada mês, a contar da data de assinatura deste instrumento.
            </p>
            <p className="text-justify indent-8 mb-2">
              <strong>4.2.</strong> O contrato será renovado automaticamente a cada mês, no dia 10, salvo manifestação contrária de uma das partes com antecedência mínima de <strong>{config.prazo_aviso_rescisao}</strong> dias.
            </p>
            <p className="text-justify indent-8 mb-2">
              <strong>4.3.</strong> Em caso de cancelamento por parte do CONTRATANTE antes do término da vigência, será cobrada multa rescisória equivalente a <strong>3 (três) vezes o valor da mensalidade vigente</strong>, ou seja, <strong>{formatCurrency(Number(contrato.valor_mensalidade) * 3)}</strong>.
            </p>
            <p className="text-justify indent-8 mb-2">
              <strong>4.4.</strong> No caso de inadimplência dos valores devidos ou pagos em atraso, poderão incidir juros e multa, encargos financeiros, despesas acessórias da operação, além de autorizar a CONTRATADA de pleno direito, a suspender automaticamente o bloqueio do sistema, mais o atendimento do suporte técnico, até o adimplemento da obrigação em atraso.
            </p>
            <p className="text-justify indent-8 mb-2">
              <strong>4.5.</strong> Os valores mencionados neste contrato serão corrigidos a cada período de 12 (doze) meses, utilizando a variação do índice do <strong>{config.indice_reajuste}</strong> ou outro índice específico para reajuste de contrato de prestação de serviço que venha a substituí-lo.
            </p>
            <p className="text-justify indent-8 mb-2">
              <strong>4.6.</strong> O valor do contrato também é fixado pelo número de licenças de uso adquiridas ou licenças adicionais, para o caso de utilização em rede, sendo a mensalidade aplicada conforme quantidade de máquinas e usuários que utilizam o sistema.
            </p>
            <p className="text-justify indent-8">
              <strong>4.7.</strong> Caso o CONTRATANTE não venha fazer o pagamento no prazo mencionado, fica autorizado a CONTRATADA de pleno direito, a suspender automaticamente a licença temporária de uso, impossibilitando o uso e suas funções, ficando também suspensos os serviços de suporte técnico até que seja identificada a quitação da parcela inadimplente.
            </p>
          </section>

          {/* CLÁUSULA QUINTA */}
          <section className="relative z-10">
            <TituloClausula numero="05" titulo="Da Alteração Contratual" />
            <p className="text-justify indent-8">
              <strong>5.1.</strong> Quaisquer alterações das obrigações contratuais somente serão válidas mediante celebração de Termos Aditivos, firmados pelos representantes legais das Partes.
            </p>
          </section>

          {/* CLÁUSULA SEXTA */}
          <section className="relative z-10">
            <TituloClausula numero="06" titulo="Obrigações do Contratado" />
            <p className="text-justify indent-10 mb-2">
              <strong>6.1.</strong> Em cumprimento ao objeto do presente instrumento, são obrigações exclusivas do CONTRATADO:
            </p>
            <div className="ml-14 space-y-2">
              <p className="text-justify">a) Planejar, conduzir e executar os serviços, com integral observância das disposições deste Contrato, obedecendo rigorosamente aos prazos contratuais, às normas vigentes e os requerimentos gerais que forem formulados, por escrito, pelo CONTRATANTE;</p>
              <p className="text-justify">b) Admitir e dirigir, sob sua inteira responsabilidade, o pessoal especializado e capacitado, correndo por sua conta exclusiva todos os encargos de ordem trabalhista, previdenciária, civil e fiscal, não podendo ser imputada ao CONTRATANTE qualquer responsabilidade solidária;</p>
              <p className="text-justify">c) Responsabilizar-se por quaisquer demandas trabalhistas, previdenciárias, sobre acidentes do trabalho ou de qualquer outra natureza atinentes ao pessoal utilizado na prestação dos serviços, mantendo o CONTRATANTE isenta de qualquer responsabilidade;</p>
              <p className="text-justify">d) Manter o CONTRATANTE à margem de quaisquer queixas, reivindicações e/ou reclamações de seus empregados ou de terceiros, em decorrência do cumprimento do presente contrato;</p>
              <p className="text-justify">e) Fornecer ao CONTRATANTE todos os dados solicitados que se fizerem necessários ao bom entendimento e acompanhamento do serviço contratado;</p>
              <p className="text-justify">f) Nenhuma das partes será considerada responsável pelo não cumprimento de suas obrigações no caso de força maior ou caso fortuito, mas não se limitando as hipóteses de tempestades, guerras, desordens, sabotagens, atos terroristas, na forma prevista em lei.</p>
            </div>
          </section>

          {/* CLÁUSULA SÉTIMA */}
          <section className="relative z-10">
            <TituloClausula numero="07" titulo="Obrigações do Contratante" />
            <p className="text-justify indent-10 mb-2">
              <strong>7.1.</strong> São obrigações do CONTRATANTE:
            </p>
            <div className="ml-14 space-y-2">
              <p className="text-justify">a) Comunicar previamente ao CONTRATADO qualquer modificação e/ou criação de novos procedimentos a serem adotados;</p>
              <p className="text-justify">b) Efetuar todos os pagamentos ora contratados, responsabilizando-se por todos os ônus decorrentes do não cumprimento desta obrigação contratual;</p>
              <p className="text-justify">c) Responsabilizar-se pelos pagamentos de todos os custos e ônus deste contrato, inclusive os procedimentos de eventual aditamento do presente contrato;</p>
              <p className="text-justify">d) Relatar ao CONTRATADO por escrito, toda e qualquer irregularidade ou comentários nos serviços prestados;</p>
              <p className="text-justify">e) No caso de mudança, e haja a necessidade de transferência de equipamento(s) ou parte dele(s), para outro local, o CONTRATANTE deverá notificar o CONTRATADO a sua intenção no prazo de 10 (dez) dias de antecedência;</p>
              <p className="text-justify">f) Todas as despesas relacionadas à instalação da rede local, especialmente aqueles relativos à parte elétrica, embalagens, transporte, seguros e mão-de-obra serão de responsabilidade do CONTRATANTE.</p>
            </div>
          </section>


          {/* CLÁUSULA OITAVA */}
          <section className="relative z-10">
            <TituloClausula numero="08" titulo="Aspectos Trabalhistas" />
            <p className="text-justify indent-10">
              <strong>8.1.</strong> O CONTRATADO é a única responsável pelo contrato de trabalho da pessoa designada por ela para a prestação dos serviços, responsabilizando-se pela gerência das atividades de seu empregado e/ou preposto, bem como responder por atos, omissões e/ou infrações por eles cometidos. Não podendo ser arguida solidariedade do CONTRATANTE, nem mesmo responsabilidade subsidiária nas relações trabalhistas relacionadas aos serviços prestados pelo CONTRATADO, a qual declara, ainda, não existir nenhum vínculo empregatício entre o CONTRATANTE e as pessoas designadas pelo CONTRATADO para a prestação dos serviços.
            </p>
          </section>

          {/* CLÁUSULA NONA */}
          <section style={{ pageBreakInside: 'avoid' }} className="relative z-10">
            <TituloClausula numero="09" titulo="Rescisão e Multa" />
            <p className="text-justify indent-10 mb-2">
              <strong>9.1.</strong> O presente contrato poderá ser extinto nas seguintes hipóteses:
            </p>
            <div className="ml-14 space-y-2">
              <p className="text-justify">a) Por Distrato das partes;</p>
              <p className="text-justify">b) Por Falência, Recuperação Judicial, Dissolução ou Liquidação do CONTRATADO, bem como se esta se apresentar em situações de Insolvência, nos termos da Lei nº 11.101/05;</p>
              <p className="text-justify">c) Por Resolução, na hipótese de inadimplemento de qualquer das cláusulas ou condições contratuais, sem que a parte inadimplente sane suas obrigações no prazo de 15 (quinze) dias do recebimento de aviso da outra parte;</p>
              <p className="text-justify">d) Por Resilição Unilateral, por qualquer das partes, mediante aviso prévio, por escrito, com <strong>{config.prazo_aviso_rescisao}</strong> dias de antecedência;</p>
              <p className="text-justify">e) Nas hipóteses de rescisão, resilição ou resolução, será devido ao CONTRATADO o valor dos serviços executados e ainda não pagos até a data della efetiva rescisão.</p>
            </div>
          </section>

          <section className="relative z-10">
            <TituloClausula numero="10" titulo="Do Foro" />
            <p className="text-justify indent-10">
              <strong>10.1.</strong> As partes elegem o Foro da Comarca {config.foro_comarca ? <> de <strong>{config.foro_comarca}</strong></> : <> de …………………..</>} para dirimir qualquer questão decorrente deste contrato, com exclusão de qualquer outro, por mais privilegiado que seja.
            </p>
          </section>

          {config.clausulas_adicionais && (
            <section>
              <h2 className="font-bold uppercase text-sm mb-2 text-black">Cláusulas Adicionais</h2>
              <div className="text-justify indent-8 whitespace-pre-line">
                {config.clausulas_adicionais}
              </div>
            </section>
          )}
          </>)}
        </div>

        {/* Assinaturas Modernas */}
        <div data-pdf-keep="true" className="mt-16 border-t border-gray-100 pt-10 relative z-10" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
          <p className="text-center mb-12 italic text-gray-500 text-sm">E por estarem assim justas e acertadas, as partes firmam o presente instrumento.</p>
          
          <div className="grid grid-cols-2 gap-12 mb-20 relative">
            <div className="relative">
              {contrato.assinado && (
                <div className="bg-[#f8f6ff] border-2 border-[#331470] rounded-lg p-4 shadow-sm relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-[#331470]" />
                  <div className="flex items-center gap-3 mb-2">
                    <ShieldCheck className="h-6 w-6 text-[#331470]" />
                    <span className="text-[10px] font-bold text-[#331470] uppercase tracking-widest">Assinado Digitalmente</span>
                  </div>
                  <div className="text-[11px] text-[#1a1a2e] font-bold uppercase mb-1">
                    {nomeContratado.toUpperCase()}
                  </div>
                  <div className="text-[8px] text-gray-500 mb-2">
                    Certificado ICP-Brasil / MP 2.200-2
                  </div>
                  {contrato.data_assinatura && (
                    <div className="text-[9px] text-[#331470] font-bold bg-[#33147015] px-2 py-1 rounded inline-block">
                      {new Date(contrato.data_assinatura).toLocaleString('pt-BR')}
                    </div>
                  )}
                  <div className="absolute -right-4 -bottom-4 opacity-[0.05]">
                    <ShieldCheck className="h-16 w-16 text-[#331470]" />
                  </div>
                </div>
              )}
              {!contrato.assinado && (
                <div className="h-24 border-b border-gray-400 flex items-end justify-center pb-2">
                   <p className="text-[10px] text-gray-400">Assinatura do Contratado</p>
                </div>
              )}
              <p className="font-bold uppercase tracking-wider text-[10px] text-[#331470] mt-3">CONTRATADO</p>
            </div>

            <div className="relative">
               <div className="h-24 border-b border-gray-400 flex items-end justify-center pb-2">
                  {contrato.assinado && !contrato.is_digital_sign && (
                    <div className="text-[#331470] font-bold text-[10px] uppercase border border-[#331470] px-3 py-1 rounded-full bg-[#33147005]">
                      Assinado Eletronicamente
                    </div>
                  )}
                  {!contrato.assinado && <p className="text-[10px] text-gray-400">Assinatura do Contratante</p>}
               </div>
               <p className="font-bold uppercase tracking-wider text-[10px] text-[#331470] mt-3">CONTRATANTE</p>
               <p className="text-[10px] mt-1 text-gray-600">{nomeContratante}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-12 opacity-50">
            <div>
              <div className="border-b border-gray-300 pb-2">
                <p className="text-[9px] uppercase text-gray-400">Testemunha 01</p>
              </div>
            </div>
            <div>
              <div className="border-b border-gray-300 pb-2">
                <p className="text-[9px] uppercase text-gray-400">Testemunha 02</p>
              </div>
            </div>
          </div>
        </div>

        </div>
      </div>
    );


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
          <h1 className="page-title">Contratos</h1>
          <p className="page-description">Gerencie contratos de prestação de serviços</p>
        </div>

        <div className="flex items-center gap-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="contratos">
                <FileText className="mr-1.5 h-4 w-4" />
                Contratos
              </TabsTrigger>
              <TabsTrigger value="modelos">
                <BookCopy className="mr-1.5 h-4 w-4" />
                Modelos
              </TabsTrigger>
              <TabsTrigger value="configuracoes">
                <Settings className="mr-1.5 h-4 w-4" />
                Configurações
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === 'contratos' && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={() => { setEditingContrato(null); resetForm(); }}>
                  <Plus className="mr-2 h-4 w-4" />
                  Novo Contrato
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingContrato ? 'Editar Contrato' : 'Novo Contrato'}</DialogTitle>
                  <DialogDescription>
                    {editingContrato ? 'Atualize os dados do contrato' : 'Selecione o cliente para gerar o contrato automaticamente'}
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Cliente *</Label>
                    <Select value={formData.cliente_id} onValueChange={handleClienteChange}>
                      <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                      <SelectContent>
                        {clientes.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.nome_empresa}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Modelo de Contrato</Label>
                      <Select
                        value={formData.modelo_id || 'padrao'}
                        onValueChange={(v) => setFormData({ ...formData, modelo_id: v === 'padrao' ? '' : v })}
                      >
                        <SelectTrigger><SelectValue placeholder="Modelo padrão do sistema" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="padrao">Modelo padrão do sistema</SelectItem>
                          {modelos.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Plano</Label>
                      <Select
                        value={formData.plano_id || 'nenhum'}
                        onValueChange={(v) => {
                          if (v === 'nenhum') {
                            setFormData({ ...formData, plano_id: '', plano_nome: '', plano_recursos: [] });
                            return;
                          }
                          const plano = planos.find((p) => p.id === v);
                          if (!plano) return;
                          setFormData({
                            ...formData,
                            plano_id: plano.id,
                            plano_nome: plano.nome,
                            plano_recursos: plano.recursos || [],
                            valor_mensalidade: plano.valor_mensalidade,
                            valor_software: plano.valor_implantacao,
                          });
                        }}
                      >
                        <SelectTrigger><SelectValue placeholder="Sem plano" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nenhum">Sem plano</SelectItem>
                          {planos.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome} — {formatCurrency(p.valor_mensalidade)}/mês
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Nº do Contrato</Label>
                      <Input value={formData.numero_contrato} onChange={(e) => setFormData({ ...formData, numero_contrato: e.target.value })} placeholder="Ex: 001/2025" />
                    </div>
                    <div className="space-y-2">
                      <Label>Sistema</Label>
                      <Select value={formData.sistema} onValueChange={(v) => setFormData({ ...formData, sistema: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {sistemas.map((s) => (
                            <SelectItem key={s.id} value={s.nome}>{s.nome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Data Início</Label>
                      <Input type="date" value={formData.data_inicio} onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Vigência (meses)</Label>
                      <Input type="number" min="1" value={formData.vigencia_meses} onChange={(e) => setFormData({ ...formData, vigencia_meses: parseInt(e.target.value) || 12 })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Licenças</Label>
                      <Input type="number" min="1" value={formData.quantidade_licencas} onChange={(e) => setFormData({ ...formData, quantidade_licencas: parseInt(e.target.value) || 1 })} />
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="text-sm font-semibold mb-3">Valores</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Software (R$)</Label>
                        <Input type="number" step="0.01" min="0" value={formData.valor_software} onChange={(e) => setFormData({ ...formData, valor_software: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Mensalidade (R$)</Label>
                        <Input type="number" step="0.01" min="0" value={formData.valor_mensalidade} onChange={(e) => setFormData({ ...formData, valor_mensalidade: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="space-y-2">
                        <Label>KM Deslocamento (R$)</Label>
                        <Input type="number" step="0.01" min="0" value={formData.valor_km_deslocamento} onChange={(e) => setFormData({ ...formData, valor_km_deslocamento: parseFloat(e.target.value) || 0 })} />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h3 className="text-sm font-semibold mb-3">Dados do Contratante</h3>
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Nome / Razão Social</Label>
                          <Input value={formData.contratante_nome} onChange={(e) => setFormData({ ...formData, contratante_nome: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>CNPJ</Label>
                          <Input value={formData.contratante_cnpj} onChange={(e) => setFormData({ ...formData, contratante_cnpj: e.target.value })} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Nome do Dono / Responsável</Label>
                          <Input value={formData.contratante_nome_dono} onChange={(e) => setFormData({ ...formData, contratante_nome_dono: e.target.value })} placeholder="Nome completo do proprietário" />
                        </div>
                        <div className="space-y-2">
                          <Label>CPF do Dono</Label>
                          <Input value={formData.contratante_cpf_dono} onChange={(e) => setFormData({ ...formData, contratante_cpf_dono: e.target.value })} placeholder="000.000.000-00" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Endereço</Label>
                        <Input value={formData.contratante_endereco} onChange={(e) => setFormData({ ...formData, contratante_endereco: e.target.value })} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Cidade</Label>
                          <Input value={formData.contratante_cidade} onChange={(e) => setFormData({ ...formData, contratante_cidade: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                          <Label>Estado</Label>
                          <Input value={formData.contratante_estado} onChange={(e) => setFormData({ ...formData, contratante_estado: e.target.value })} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Link className="h-3.5 w-3.5" /> Link do Documento</Label>
                    <Input type="url" placeholder="https://drive.google.com/..." value={formData.link_documento} onChange={(e) => setFormData({ ...formData, link_documento: e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <Label>Observações</Label>
                    <Textarea value={formData.observacoes} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} rows={2} />
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                    <Button type="submit">{editingContrato ? 'Salvar' : 'Criar Contrato'}</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </motion.div>

      {/* Contratos Tab */}
      {activeTab === 'contratos' && (
        <>
          {/* Filters */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Buscar por cliente ou nº contrato..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="ativo">Ativo</SelectItem>
                      <SelectItem value="inativo">Inativo</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Table */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nº</th>
                        <th>Cliente</th>
                        <th>Sistema</th>
                        <th>Vigência</th>
                        <th>Mensalidade</th>
                        <th>Status</th>
                        <th>Link</th>
                        <th className="w-[50px]"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Carregando...</td></tr>
                      ) : filteredContratos.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Nenhum contrato encontrado</td></tr>
                      ) : (
                        filteredContratos.map((contrato) => (
                          <tr key={contrato.id} className="group transition-colors">
                            <td className="py-4">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                                  <FileText className="h-5 w-5" />
                                </div>
                                <div className="flex flex-col">
                                  <span className="font-bold text-foreground leading-tight">
                                    {contrato.numero_contrato || 'S/N'}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                                    Nº Contrato
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="flex flex-col">
                                <span className="font-semibold text-foreground leading-tight">
                                  {getClienteName(contrato.cliente_id)}
                                </span>
                                <span className="text-xs text-muted-foreground mt-0.5">
                                  {clientes.find(c => c.id === contrato.cliente_id)?.cnpj || ''}
                                </span>
                              </div>
                            </td>
                             <td className="py-4">
                               <div className="flex flex-wrap gap-1">
                                 {contrato.sistema && (
                                   <Badge variant="default" className="text-[10px] h-5 px-1.5 uppercase font-bold tracking-wider">
                                     {contrato.sistema}
                                   </Badge>
                                 )}
                                 {(sistemasPorCliente[contrato.cliente_id] || [])
                                   .filter(s => s !== contrato.sistema)
                                   .map((sis) => (
                                     <Badge key={sis} variant="secondary" className="text-[10px] h-5 px-1.5 uppercase font-bold tracking-wider">
                                       {sis}
                                     </Badge>
                                   ))
                                 }
                                 {!contrato.sistema && (!sistemasPorCliente[contrato.cliente_id] || sistemasPorCliente[contrato.cliente_id].length === 0) && (
                                   <span className="text-muted-foreground text-xs italic">—</span>
                                 )}
                               </div>
                             </td>
                            <td className="py-4">
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                  <div className="h-1.5 w-1.5 rounded-full bg-success" />
                                  {formatDate(contrato.data_inicio)}
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                                  Até {formatDate(contrato.data_fim)}
                                </div>
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-success">
                                  {formatCurrency(Number(contrato.valor_mensalidade))}
                                </span>
                                <span className="text-[10px] text-muted-foreground uppercase font-medium">
                                  Mensal
                                </span>
                              </div>
                            </td>
                            <td className="py-4">
                              {getStatusBadge(contrato.status, contrato.assinado)}
                            </td>
                            <td className="py-4">
                              <div className="flex items-center gap-1">
                                {contrato.link_documento ? (
                                  <a href={contrato.link_documento} target="_blank" rel="noopener noreferrer">
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:bg-primary/10">
                                      <ExternalLink className="h-4 w-4" />
                                    </Button>
                                  </a>
                                ) : (
                                  <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground/40 hover:text-primary hover:bg-primary/5"
                                    onClick={() => handleEdit(contrato)}
                                    title="Adicionar Link"
                                  >
                                    <Link className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                            <td className="py-4">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted"><MoreHorizontal className="h-4 w-4" /></Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem onClick={() => handleView(contrato)} className="cursor-pointer">
                                    <Eye className="mr-2 h-4 w-4" /> Visualizar
                                  </DropdownMenuItem>
                                  {!contrato.assinado && (
                                    <DropdownMenuItem onClick={() => handleAssinar(contrato.id)} className="cursor-pointer text-success focus:text-success focus:bg-success/5">
                                      <CheckCircle className="mr-2 h-4 w-4" /> Marcar Assinado
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem onClick={() => handleEdit(contrato)} className="cursor-pointer">
                                    <Edit className="mr-2 h-4 w-4" /> Editar
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleDelete(contrato.id)} className="text-destructive focus:text-destructive cursor-pointer focus:bg-destructive/5">
                                    <Trash2 className="mr-2 h-4 w-4" /> Excluir
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
        </>
      )}

      {/* Modelos Tab */}
      {activeTab === 'modelos' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <ModelosContrato />
        </motion.div>
      )}

      {/* Configurações Tab */}
      {activeTab === 'configuracoes' && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="space-y-6">
          {/* Dados do Contratado */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5 text-primary" />
                Dados da Empresa (Contratado)
              </CardTitle>
              <p className="text-sm text-muted-foreground">Essas informações serão preenchidas automaticamente no contrato como CONTRATADO</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Razão Social / Nome da Empresa</Label>
                  <Input value={config.contratado_nome} onChange={(e) => setConfig({ ...config, contratado_nome: e.target.value })} placeholder="Sua empresa LTDA" />
                </div>
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <Input value={config.contratado_cnpj} onChange={(e) => setConfig({ ...config, contratado_cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Endereço</Label>
                <Input value={config.contratado_endereco} onChange={(e) => setConfig({ ...config, contratado_endereco: e.target.value })} placeholder="Rua Exemplo, 123" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input value={config.contratado_cidade} onChange={(e) => setConfig({ ...config, contratado_cidade: e.target.value })} placeholder="São Luís" />
                </div>
                <div className="space-y-2">
                  <Label>Estado</Label>
                  <Input value={config.contratado_estado} onChange={(e) => setConfig({ ...config, contratado_estado: e.target.value })} placeholder="MA" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={config.contratado_email} onChange={(e) => setConfig({ ...config, contratado_email: e.target.value })} placeholder="contato@empresa.com" />
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input value={config.contratado_telefone} onChange={(e) => setConfig({ ...config, contratado_telefone: e.target.value })} placeholder="(11) 99999-9999" />
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label>Exibir marca d'água no contrato</Label>
                  <p className="text-xs text-muted-foreground">Mostra o logo em transparência ao fundo do documento</p>
                </div>
                <Switch
                  checked={config.mostrar_marca_dagua}
                  onCheckedChange={(v) => setConfig({ ...config, mostrar_marca_dagua: v })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Configurações do Modelo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-5 w-5 text-primary" />
                Configurações do Modelo
              </CardTitle>
              <p className="text-sm text-muted-foreground">Personalize os termos do contrato</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Horário de Atendimento</Label>
                <Input value={config.horario_atendimento} onChange={(e) => setConfig({ ...config, horario_atendimento: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Índice de Reajuste</Label>
                  <Input value={config.indice_reajuste} onChange={(e) => setConfig({ ...config, indice_reajuste: e.target.value })} placeholder="IGP-M/FGV" />
                </div>
                <div className="space-y-2">
                  <Label>Prazo Aviso Rescisão (dias)</Label>
                  <Input type="number" min="1" value={config.prazo_aviso_rescisao} onChange={(e) => setConfig({ ...config, prazo_aviso_rescisao: parseInt(e.target.value) || 30 })} />
                </div>
                <div className="space-y-2">
                  <Label>Foro / Comarca</Label>
                  <Input value={config.foro_comarca} onChange={(e) => setConfig({ ...config, foro_comarca: e.target.value })} placeholder="São Luís/MA" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Cláusulas Adicionais</Label>
                <Textarea
                  value={config.clausulas_adicionais}
                  onChange={(e) => setConfig({ ...config, clausulas_adicionais: e.target.value })}
                  placeholder="Adicione cláusulas extras que serão incluídas no final do contrato..."
                  rows={5}
                />
              </div>
            </CardContent>
          </Card>

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={handleSaveConfig} disabled={savingConfig} size="lg">
              <Save className="mr-2 h-4 w-4" />
              {savingConfig ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </div>
        </motion.div>
      )}

      {/* View Contract Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-5xl w-[95vw] h-[90vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Contrato {viewingContrato?.numero_contrato || ''}
            </DialogTitle>
            <DialogDescription>
              {viewingContrato?.assinado ? 'Contrato assinado' : 'Contrato pendente de assinatura'}
            </DialogDescription>
          </DialogHeader>
          {viewingContrato && (
            <div className="mt-4 flex flex-col min-h-0">
              {/* Link do documento editável */}
              <div className="flex items-center gap-2 mb-4 print:hidden">
                <Link className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  type="url" placeholder="Cole aqui o link do documento..."
                  value={viewingContrato.link_documento || ''}
                  onChange={(e) => setViewingContrato({ ...viewingContrato, link_documento: e.target.value })}
                  className="flex-1"
                />
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    const { error } = await supabase.from('contratos').update({ link_documento: viewingContrato.link_documento }).eq('id', viewingContrato.id);
                    if (error) throw error;
                    toast.success('Link salvo!'); fetchData();
                  } catch { toast.error('Erro ao salvar link'); }
                }}>Salvar</Button>
                {viewingContrato.link_documento && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={viewingContrato.link_documento} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
                  </Button>
                )}
              </div>

              <div className="flex justify-end mb-4 gap-2 print:hidden">
                <Button variant="outline" size="sm" onClick={handleExportPDF}>
                  <Download className="mr-2 h-4 w-4" /> Exportar PDF
                </Button>
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" /> Imprimir
                </Button>
                {!viewingContrato.assinado && (
                  <div className="flex gap-2">
                    <Button variant="outline" className="text-primary border-primary hover:bg-primary/5" onClick={() => setIsDigitalSignDialogOpen(true)}>
                      <ShieldCheck className="mr-2 h-4 w-4" /> Assinar Digitalmente (A1)
                    </Button>
                    <Button size="sm" onClick={() => { handleAssinar(viewingContrato.id); setViewDialogOpen(false); }}>
                      <CheckCircle className="mr-2 h-4 w-4" /> Marcar Assinado
                    </Button>
                  </div>
                )}
                {viewingContrato.assinado && (
                  <Badge className="bg-success/10 text-success border-success/30 hover:bg-success/20">
                    <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> Assinado em {new Date(viewingContrato.data_assinatura || '').toLocaleString('pt-BR')}
                  </Badge>
                )}
              </div>
              <div className="flex-1 overflow-auto border border-gray-100 rounded-lg p-4 bg-muted/10">
                <div>
                  <ContractDocument contrato={viewingContrato} />
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <DigitalSignDialog 
        open={isDigitalSignDialogOpen}
        onOpenChange={setIsDigitalSignDialogOpen}
        onSign={handleDigitalSign}
        certificateFile={certificateFile}
        setCertificateFile={setCertificateFile}
        certPassword={certPassword}
        setCertPassword={setCertPassword}
        isSigning={isSigning}
      />
    </div>
  );
}

function DigitalSignDialog({ 
  open, 
  onOpenChange, 
  onSign, 
  certificateFile, 
  setCertificateFile, 
  certPassword, 
  setCertPassword,
  isSigning
}: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Assinatura Digital A1
          </DialogTitle>
          <DialogDescription>
            Utilize seu certificado digital (.pfx ou .p12) para assinar este documento.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="certificate">Arquivo do Certificado</Label>
            <div className="flex items-center gap-2">
              <Input
                id="certificate"
                type="file"
                accept=".pfx,.p12"
                className="cursor-pointer"
                onChange={(e) => setCertificateFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Senha do Certificado</Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                className="pl-10"
                placeholder="Digite a senha do certificado"
                value={certPassword}
                onChange={(e) => setCertPassword(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={onSign} disabled={isSigning || !certificateFile}>
            {isSigning ? (
              <>Assinando...</>
            ) : (
              <>
                <ShieldCheck className="mr-2 h-4 w-4" /> Confirmar Assinatura Digital
              </>
            )}
          </Button>
          <p className="text-[10px] text-center text-muted-foreground">
            A assinatura digital garante a autenticidade e integridade do documento conforme a ICP-Brasil.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
