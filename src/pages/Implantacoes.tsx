import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, CheckCircle, Clock, AlertCircle, Calendar, Edit, Trash2, Send, History, List, GitBranch, FileText, Loader2, Settings2 } from '@/components/icons';
import {
  ETAPAS_PADRAO,
  checklistDeEtapas,
  lerItem,
  agruparPorEtapa,
  definicaoEtapa,
  acaoEtapaConcluida,
  acaoEtapaReaberta,
  gerarDocumentoImplantacao,
  baixarArquivo,
  type EtapaModelo,
} from '@/lib/implantacaoPadrao';
import { SeletorEtapas, FormEtapa, GerenciadorEtapas } from '@/components/implantacao/SeletorEtapas';
import { selecaoInicial, etapasEscolhidas, type SelecaoEtapa } from '@/lib/selecaoEtapas';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { useAbrirNovo } from '@/hooks/use-abrir-novo';
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

/**
 * Acompanhamento de implantações: status, prioridade, responsável, checklist
 * de etapas, comentários e histórico de alterações.
 */
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
  const [gerandoDocId, setGerandoDocId] = useState<string | null>(null);
  // Etapas personalizadas salvas (tabela etapas_implantacao) e a escolha da criação.
  const [etapasSalvas, setEtapasSalvas] = useState<EtapaModelo[]>([]);
  const [tabelaEtapasOk, setTabelaEtapasOk] = useState(true);
  const [selecaoEtapas, setSelecaoEtapas] = useState<SelecaoEtapa[]>(() => selecaoInicial([]));
  const [gerenciarEtapasAberto, setGerenciarEtapasAberto] = useState(false);
  const [criandoEtapaNaImplantacao, setCriandoEtapaNaImplantacao] = useState(false);
  
  const [formData, setFormData] = useState({
    cliente_id: '',
    titulo: 'Implantação do sistema',
    descricao: '',
    status: 'nao_iniciado',
    prioridade: 'media',
    responsavel_id: '',
    data_meta: '',
    data_prazo: '',
  });

  useEffect(() => {
    fetchData();
    fetchEtapasSalvas();
  }, []);

  /** Carrega as implantações e os clientes usados no seletor. */
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

  /** Carrega as etapas personalizadas. Se a tabela ainda não existe no banco
   *  (migration não aplicada), segue só com as padrão. */
  const fetchEtapasSalvas = async () => {
    const { data, error } = await supabase
      .from('etapas_implantacao')
      .select('id, nome, itens, resultado, ordem')
      .eq('ativo', true)
      .order('ordem')
      .order('created_at');
    if (error) {
      setTabelaEtapasOk(false);
      return [];
    }
    setTabelaEtapasOk(true);
    const lista: EtapaModelo[] = (data || []).map((e) => ({ id: e.id, nome: e.nome, titulo: e.nome, itens: e.itens || [], resultado: e.resultado }));
    setEtapasSalvas(lista);
    return lista;
  };

  /** Cria ou atualiza uma etapa personalizada. Devolve a etapa salva (com id). */
  const salvarEtapaModelo = async (etapa: EtapaModelo): Promise<EtapaModelo | null> => {
    const dados = { nome: etapa.nome.trim(), itens: etapa.itens, resultado: etapa.resultado || null, updated_at: new Date().toISOString() };
    const resp = etapa.id
      ? await supabase.from('etapas_implantacao').update(dados).eq('id', etapa.id).select('id').single()
      : await supabase.from('etapas_implantacao').insert({ ...dados, ordem: etapasSalvas.length }).select('id').single();
    if (resp.error) {
      toast({ title: 'Não foi possível salvar a etapa', description: resp.error.message, variant: 'destructive' });
      return null;
    }
    toast({ title: etapa.id ? 'Etapa atualizada' : 'Etapa salva', description: etapa.nome });
    await fetchEtapasSalvas();
    return { ...etapa, id: resp.data.id };
  };

  const excluirEtapaModelo = async (etapa: EtapaModelo) => {
    if (!etapa.id || !confirm(`Excluir a etapa "${etapa.nome}"? Implantações já criadas não mudam.`)) return;
    const { error } = await supabase.from('etapas_implantacao').delete().eq('id', etapa.id);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Etapa excluída', description: etapa.nome });
    fetchEtapasSalvas();
  };

  /** Abre o formulário de nova implantação com as etapas padrão marcadas. */
  const abrirNovaImplantacao = (aberto: boolean) => {
    if (aberto) {
      resetForm();
      setSelecaoEtapas(selecaoInicial(etapasSalvas));
    }
    setIsDialogOpen(aberto);
  };

  useAbrirNovo(() => abrirNovaImplantacao(true), !loading);

  /** Carrega checklist, comentários e histórico de uma implantação específica. */
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

  /** Cria uma nova implantação a partir do formulário. */
  const handleCreate = async () => {
    try {
      const { data: nova, error } = await supabase
        .from('implantacoes')
        .insert({
          cliente_id: formData.cliente_id,
          titulo: formData.titulo,
          descricao: formData.descricao || null,
          status: formData.status,
          prioridade: formData.prioridade,
          responsavel_id: formData.responsavel_id || null,
          data_meta: formData.data_meta || null,
          data_prazo: formData.data_prazo || null,
          progresso: 0,
        })
        .select('id')
        .single();

      if (error) throw error;

      // O checklist nasce com as etapas (e itens) escolhidos no formulário.
      const etapas = etapasEscolhidas(selecaoEtapas);
      const linhas = checklistDeEtapas(nova.id, etapas);
      const { error: errChecklist } = linhas.length ? await supabase.from('implantacao_checklist').insert(linhas) : { error: null };
      if (errChecklist) {
        toast({ title: 'Atenção', description: 'Implantação criada, mas o checklist não foi gerado.', variant: 'destructive' });
      } else {
        toast({ title: 'Implantação criada', description: `${etapas.length} etapa(s) · ${linhas.length} passo(s)` });
      }
      setIsDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  /** Atualiza a implantação em edição. */
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

  /** Exclui a implantação após confirmação. */
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

  /** Acrescenta uma etapa ao checklist da implantação aberta. */
  const handleAddChecklistItem = async () => {
    if (!selectedImplantacao || !novoChecklistItem.trim()) return;

    try {
      const { error } = await supabase.from('implantacao_checklist').insert({
        implantacao_id: selectedImplantacao.id,
        descricao: novoChecklistItem.replace(' · ', ' - '),
        ordem: 100000 + checklist.length, // avulsos ficam depois das etapas
      });

      if (error) throw error;

      setNovoChecklistItem('');
      fetchImplantacaoDetails(selectedImplantacao.id);
      updateProgress(selectedImplantacao.id);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  /** Marca ou desmarca uma etapa do checklist como concluída. */
  const handleToggleChecklistItem = async (item: ChecklistItem) => {
    if (!selectedImplantacao) return;

    try {
      const { error } = await supabase
        .from('implantacao_checklist')
        .update({ concluido: !item.concluido })
        .eq('id', item.id);

      if (error) throw error;

      // Se a etapa fechou (ou reabriu) com este clique, registra no histórico:
      // é dali que sai a data do "Checklist de Conclusão" do documento.
      const { etapa } = lerItem(item.descricao);
      if (etapa) {
        const daEtapa = (lista: ChecklistItem[]) => lista.filter((i) => lerItem(i.descricao).etapa === etapa);
        const depois = checklist.map((i) => (i.id === item.id ? { ...i, concluido: !item.concluido } : i));
        const completaAntes = daEtapa(checklist).every((i) => i.concluido);
        const completaDepois = daEtapa(depois).every((i) => i.concluido);
        if (completaAntes !== completaDepois) {
          await supabase.from('implantacao_historico').insert({
            implantacao_id: selectedImplantacao.id,
            usuario_id: profile?.id,
            acao: completaDepois ? acaoEtapaConcluida(etapa) : acaoEtapaReaberta(etapa),
          });
          toast({
            title: completaDepois ? `Etapa ${etapa} concluída` : `Etapa ${etapa} reaberta`,
            description: completaDepois ? 'Data registrada no checklist de conclusão.' : undefined,
          });
        }
      }

      fetchImplantacaoDetails(selectedImplantacao.id);
      updateProgress(selectedImplantacao.id);
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  /** Remove uma etapa do checklist. */
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

      // Status acompanha o checklist: 100% conclui; qualquer avanço tira de "não iniciado".
      const atual = implantacoes.find((i) => i.id === implantacaoId);
      let status = atual?.status;
      if (progresso === 100) status = 'concluido';
      else if (status === 'concluido') status = 'em_andamento';
      else if (progresso > 0 && status === 'nao_iniciado') status = 'em_andamento';

      await supabase
        .from('implantacoes')
        .update({ progresso, ...(status ? { status } : {}) })
        .eq('id', implantacaoId);
      if (status && selectedImplantacao?.id === implantacaoId) setFormData((f) => ({ ...f, status: status! }));

      fetchData();
    }
  };

  /** Acrescenta uma etapa (padrão, salva ou nova) à implantação aberta, no fim. */
  const adicionarEtapaNaImplantacao = async (etapa: EtapaModelo) => {
    if (!selectedImplantacao) return;
    const maiorOrdem = checklist.filter((i) => lerItem(i.descricao).etapa).reduce((m, i) => Math.max(m, i.ordem ?? 0), -1);
    const inicio = (Math.floor(maiorOrdem / 100) + 1) * 100;
    const { error } = await supabase.from('implantacao_checklist').insert(checklistDeEtapas(selectedImplantacao.id, [etapa], inicio));
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.from('implantacao_historico').insert({
      implantacao_id: selectedImplantacao.id,
      usuario_id: profile?.id,
      acao: `Adicionou a etapa ${etapa.nome}`,
    });
    toast({ title: 'Etapa adicionada', description: etapa.nome });
    setCriandoEtapaNaImplantacao(false);
    fetchImplantacaoDetails(selectedImplantacao.id);
    updateProgress(selectedImplantacao.id);
  };

  /** Tira uma etapa inteira da implantação (apaga os itens dela). */
  const removerEtapaDaImplantacao = async (etapa: string, ids: string[]) => {
    if (!selectedImplantacao || !confirm(`Remover a etapa "${etapa}" desta implantação?`)) return;
    const { error } = await supabase.from('implantacao_checklist').delete().in('id', ids);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.from('implantacao_historico').insert({
      implantacao_id: selectedImplantacao.id,
      usuario_id: profile?.id,
      acao: `Removeu a etapa ${etapa}`,
    });
    fetchImplantacaoDetails(selectedImplantacao.id);
    updateProgress(selectedImplantacao.id);
  };

  /**
   * Gera o Orçamento + Plano de Implantação (.docx) já preenchido com o
   * cadastro do cliente, os sistemas contratados, o consultor e as datas de
   * conclusão de cada etapa.
   */
  const gerarDocumento = async (implantacao: Implantacao) => {
    setGerandoDocId(implantacao.id);
    try {
      const [cliRes, licRes, chkRes, histRes] = await Promise.all([
        supabase
          .from('clientes')
          .select('nome_empresa, cnpj, cpf_dono, nome_dono, valor_implantacao, valor_mensalidade, desconto_percentual')
          .eq('id', implantacao.cliente_id)
          .single(),
        supabase.from('licencas').select('tipo').eq('cliente_id', implantacao.cliente_id).eq('status', 'ativo'),
        supabase.from('implantacao_checklist').select('descricao, concluido, ordem').eq('implantacao_id', implantacao.id),
        supabase
          .from('implantacao_historico')
          .select('acao, created_at')
          .eq('implantacao_id', implantacao.id)
          .like('acao', 'Etapa concluída:%')
          .order('created_at', { ascending: false }),
      ]);
      if (cliRes.error) throw cliRes.error;
      const cliente = cliRes.data;

      // Etapas desta implantação, na ordem do checklist; título e resultado
      // esperado vêm da definição (padrão ou salva), se houver.
      const etapas = agruparPorEtapa(chkRes.data || []).grupos.map(({ etapa, itens }) => {
        const def = definicaoEtapa(etapa, etapasSalvas);
        const concluida = itens.every((i) => i.concluido);
        const registro = (histRes.data || []).find((h) => h.acao === acaoEtapaConcluida(etapa));
        return {
          nome: etapa,
          titulo: def?.titulo || etapa,
          itens: itens.map((i) => lerItem(i.descricao).texto),
          resultado: def?.resultado || null,
          concluida,
          data: concluida && registro ? registro.created_at.slice(0, 10) : null,
        };
      });

      const desconto = Number(cliente.desconto_percentual) || 0;
      const blob = await gerarDocumentoImplantacao({
        nomeCliente: cliente.nome_empresa,
        cnpj: cliente.cnpj || cliente.cpf_dono,
        // A implantação sai com o desconto do cadastro, como no pagamento gerado.
        valorImplantacao: (Number(cliente.valor_implantacao) || 0) * (1 - desconto / 100),
        valorMensalidade: Number(cliente.valor_mensalidade) || 0,
        sistemas: Array.from(new Set((licRes.data || []).map((l) => l.tipo.trim()))),
        consultor: implantacao.responsavel?.nome || implantacao.responsavel?.email || null,
        responsavelCliente: cliente.nome_dono,
        etapas,
      });
      const nomeArquivo = `Orcamento e Plano de Implantacao - ${cliente.nome_empresa.replace(/[\\/:*?"<>|]/g, '').trim()}.docx`;
      baixarArquivo(blob, nomeArquivo);
      toast({ title: 'Documento gerado', description: nomeArquivo });
    } catch (error) {
      toast({ title: 'Erro ao gerar documento', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setGerandoDocId(null);
    }
  };

  /** Registra um comentário na implantação aberta. */
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

  /** Abre o formulário preenchido com a implantação escolhida. */
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
      titulo: 'Implantação do sistema',
      descricao: '',
      status: 'nao_iniciado',
      prioridade: 'media',
      responsavel_id: '',
      data_meta: '',
      data_prazo: '',
    });
  };

  /** Filtra a lista pelo termo de busca e pelo status selecionado. */
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

  /** Devolve o selo visual do status da implantação. */
  const getStatusBadge = (status: string) => {
    const option = statusOptions.find((o) => o.value === status);
    return <Badge className={option?.color}>{option?.label}</Badge>;
  };

  /** Devolve o selo visual da prioridade. */
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
        <div className="flex gap-2">
        <Button variant="outline" className="gap-2" onClick={() => setGerenciarEtapasAberto(true)}>
          <Settings2 className="h-4 w-4" />
          Etapas
        </Button>
        <Dialog open={isDialogOpen} onOpenChange={abrirNovaImplantacao}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Implantação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
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
                  rows={2}
                />
              </div>
              <SeletorEtapas
                valor={selecaoEtapas}
                onChange={setSelecaoEtapas}
                podeSalvarModelo={tabelaEtapasOk}
                onNovaEtapa={(etapa) => salvarEtapaModelo(etapa)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={!formData.cliente_id || !formData.titulo || etapasEscolhidas(selecaoEtapas).length === 0}>
                Criar Implantação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Etapas padrão e personalizadas */}
      <Dialog open={gerenciarEtapasAberto} onOpenChange={setGerenciarEtapasAberto}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Etapas de implantação</DialogTitle>
          </DialogHeader>
          <GerenciadorEtapas
            personalizadas={etapasSalvas}
            disponivel={tabelaEtapasOk}
            onSalvar={async (etapa) => {
              await salvarEtapaModelo(etapa);
            }}
            onExcluir={excluirEtapaModelo}
          />
        </DialogContent>
      </Dialog>

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
                    <th className="w-[120px]">Ações</th>
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Gerar Orçamento e Plano de Implantação (.docx)"
                            disabled={gerandoDocId === item.id}
                            onClick={() => gerarDocumento(item)}
                          >
                            {gerandoDocId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4 text-primary" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" title="Abrir" onClick={() => openEditDialog(item)}>
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

              {/* Checklist por etapa */}
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <Label className="flex items-center gap-2 text-muted-foreground">
                    <CheckCircle className="h-4 w-4" />
                    Checklist de Implantação
                  </Label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Plus className="h-4 w-4" />
                        Adicionar etapa
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      {(() => {
                        const presentes = new Set(agruparPorEtapa(checklist).grupos.map((g) => g.etapa.toLowerCase()));
                        const disponiveis = [...ETAPAS_PADRAO, ...etapasSalvas].filter((e) => !presentes.has(e.nome.toLowerCase()));
                        return (
                          <>
                            <DropdownMenuLabel className="text-xs text-muted-foreground">Etapas cadastradas</DropdownMenuLabel>
                            {disponiveis.length === 0 && <p className="px-2 py-1.5 text-xs text-muted-foreground">Todas já estão nesta implantação.</p>}
                            {disponiveis.map((e) => (
                              <DropdownMenuItem key={e.id || e.nome} onClick={() => adicionarEtapaNaImplantacao(e)}>
                                {e.nome}
                                <span className="ml-auto text-[10px] text-muted-foreground">{e.padrao ? 'Padrão' : 'Personalizada'}</span>
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setCriandoEtapaNaImplantacao(true)}>
                              <Plus className="mr-2 h-4 w-4" />
                              Criar nova etapa...
                            </DropdownMenuItem>
                          </>
                        );
                      })()}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {criandoEtapaNaImplantacao && (
                  <div className="mb-3">
                    <FormEtapa
                      nomesExistentes={[...ETAPAS_PADRAO, ...etapasSalvas].map((e) => e.nome).concat(agruparPorEtapa(checklist).grupos.map((g) => g.etapa))}
                      podeSalvarModelo={tabelaEtapasOk}
                      onCancelar={() => setCriandoEtapaNaImplantacao(false)}
                      onSalvar={async (etapa, salvarModelo) => {
                        if (salvarModelo) await salvarEtapaModelo(etapa);
                        await adicionarEtapaNaImplantacao(etapa);
                      }}
                    />
                  </div>
                )}

                <div className="space-y-3">
                  {checklist.length === 0 && !criandoEtapaNaImplantacao && (
                    <p className="rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
                      Nenhuma etapa. Use "Adicionar etapa" para montar o checklist.
                    </p>
                  )}
                  {agruparPorEtapa(checklist).grupos.map(({ etapa, itens }, idx) => {
                    const def = definicaoEtapa(etapa, etapasSalvas);
                    const feitos = itens.filter((i) => i.concluido).length;
                    const completa = feitos === itens.length;
                    const dataConclusao = historico.find((h) => h.acao === acaoEtapaConcluida(etapa))?.created_at;
                    return (
                      <div key={etapa} className={`rounded-xl border p-3 ${completa ? 'border-emerald-200 bg-emerald-50/50' : 'border-border'}`}>
                        <div className="mb-2 flex items-center gap-3">
                          <span
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${completa ? 'bg-emerald-600 text-white' : 'bg-primary/10 text-primary'}`}
                          >
                            {completa ? <CheckCircle className="h-4 w-4" /> : idx + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">
                              {idx + 1}ª etapa — {def?.titulo || etapa}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {completa
                                ? `Concluída${dataConclusao ? ' em ' + format(parseISO(dataConclusao), 'dd/MM/yyyy') : ''}`
                                : def?.resultado
                                  ? `Resultado esperado: ${def.resultado}`
                                  : 'Etapa personalizada'}
                            </p>
                          </div>
                          <span className="text-xs font-medium text-muted-foreground">
                            {feitos}/{itens.length}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Remover etapa desta implantação"
                            onClick={() => removerEtapaDaImplantacao(etapa, itens.map((i) => i.id))}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                        </div>
                        <div className="space-y-1">
                          {itens.map((item) => (
                            <label key={item.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/40">
                              <Checkbox checked={item.concluido} onCheckedChange={() => handleToggleChecklistItem(item)} />
                              <span className={`flex-1 text-sm ${item.concluido ? 'text-muted-foreground line-through' : ''}`}>{lerItem(item.descricao).texto}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {/* Passos avulsos */}
                  {checklist.some((i) => !lerItem(i.descricao).etapa) && (
                    <div className="rounded-xl border border-dashed p-3">
                      <p className="mb-2 text-sm font-semibold">Passos adicionais</p>
                      <div className="space-y-1">
                        {checklist
                          .filter((i) => !lerItem(i.descricao).etapa)
                          .map((item) => (
                            <div key={item.id} className="flex items-center gap-3 rounded-lg px-2 py-1 hover:bg-muted/40">
                              <Checkbox checked={item.concluido} onCheckedChange={() => handleToggleChecklistItem(item)} />
                              <span className={`flex-1 text-sm ${item.concluido ? 'text-muted-foreground line-through' : ''}`}>{item.descricao}</span>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteChecklistItem(item.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <Input
                    value={novoChecklistItem}
                    onChange={(e) => setNovoChecklistItem(e.target.value)}
                    placeholder="Adicionar passo adicional..."
                    onKeyDown={(e) => e.key === 'Enter' && handleAddChecklistItem()}
                  />
                  <Button variant="outline" size="icon" onClick={handleAddChecklistItem}>
                    <Plus className="h-4 w-4" />
                  </Button>
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
          <DialogFooter className="mt-4 gap-2 sm:justify-between">
            <Button
              variant="outline"
              className="gap-2"
              disabled={!selectedImplantacao || gerandoDocId === selectedImplantacao?.id}
              onClick={() => selectedImplantacao && gerarDocumento(selectedImplantacao)}
            >
              {gerandoDocId === selectedImplantacao?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Gerar documento (.docx)
            </Button>
            <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpdate}>Salvar Alterações</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
