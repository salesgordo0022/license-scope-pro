import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, GripVertical, ChevronUp, ChevronDown, Copy, FileText, MoreHorizontal, Save, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Clausula {
  id: string;
  titulo: string;
  conteudo: string;
}

export interface ModeloContrato {
  id: string;
  empresa_id: string | null;
  nome: string;
  descricao: string;
  clausulas: Clausula[];
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

const defaultClausulas: Clausula[] = [
  { id: crypto.randomUUID(), titulo: 'Cláusula Primeira — Do Objeto do Contrato', conteudo: '1.1. O presente contrato tem como objeto, a prestação, pelo CONTRATADO, de serviços de suporte técnico do Sistema {{sistema}}.\n\n1.2. O presente contrato concede ao CONTRATANTE uma licença de uso mensal do software, de caráter não exclusivo e intransferível, válida enquanto perdurar a vigência deste contrato e o adimplemento das obrigações aqui pactuadas. A licença será renovada automaticamente a cada mês mediante o pagamento da mensalidade correspondente.' },
  { id: crypto.randomUUID(), titulo: 'Cláusula Segunda — Prazo de Vigência', conteudo: '2.1. O período de vigência deste contrato é de {{data_inicio}} à {{data_fim}} e poderá ser renovado por iguais e sucessivos períodos, mediante termo aditivo.' },
  { id: crypto.randomUUID(), titulo: 'Cláusula Terceira — Da Execução dos Serviços', conteudo: '3.1. Os serviços serão prestados por profissional designado pelo CONTRATADO no horário de {{horario_atendimento}}, salvo os feriados e horários fora do atendimento.\n\n3.2. A administração, supervisão e gerenciamento no que tange à execução dos serviços prestados ficarão sob responsabilidade exclusiva do CONTRATADO.' },
  { id: crypto.randomUUID(), titulo: 'Cláusula Quarta — Preço e Forma de Pagamento', conteudo: '4.1. O preço do software as partes contratantes ajustam no valor de {{valor_software}} e uma mensalidade de {{valor_mensalidade}}, a contar após 30 (trinta) dias da implantação do sistema.\n\n4.2. No caso de inadimplência dos valores devidos, poderão incidir juros e multa, encargos financeiros.' },
  { id: crypto.randomUUID(), titulo: 'Cláusula Quinta — Da Alteração Contratual', conteudo: '5.1. Quaisquer alterações das obrigações contratuais somente serão válidas mediante celebração de Termos Aditivos, firmados pelos representantes legais das Partes.' },
  { id: crypto.randomUUID(), titulo: 'Cláusula Sexta — Obrigações do Contratado', conteudo: '6.1. Em cumprimento ao objeto do presente instrumento, são obrigações exclusivas do CONTRATADO:\na) Planejar, conduzir e executar os serviços;\nb) Admitir e dirigir, sob sua inteira responsabilidade, o pessoal especializado;\nc) Responsabilizar-se por quaisquer demandas trabalhistas.' },
  { id: crypto.randomUUID(), titulo: 'Cláusula Sétima — Obrigações do Contratante', conteudo: '7.1. São obrigações do CONTRATANTE:\na) Comunicar previamente o CONTRATADO qualquer modificação;\nb) Efetuar todos os pagamentos ora contratados;\nc) Relatar ao CONTRATADO por escrito, toda e qualquer irregularidade.' },
  { id: crypto.randomUUID(), titulo: 'Cláusula Oitava — Rescisão', conteudo: '8.1. O presente contrato poderá ser extinto nas seguintes hipóteses:\na) Por Distrato das partes;\nb) Por Falência, Recuperação Judicial;\nc) Por Resolução, na hipótese de inadimplemento;\nd) Por Resilição Unilateral, mediante aviso prévio de {{prazo_aviso_rescisao}} dias.' },
  { id: crypto.randomUUID(), titulo: 'Cláusula Nona — Proteção de Dados', conteudo: '9.1. As Partes declaram-se cientes dos direitos, obrigações e penalidades aplicáveis constantes da Lei Geral de Proteção de Dados Pessoais (Lei 13.709/2018).' },
  { id: crypto.randomUUID(), titulo: 'Cláusula Décima — Do Foro', conteudo: '10.1. As partes elegem o foro da Comarca de {{foro_comarca}} para dirimir eventuais controvérsias oriundas do presente Contrato.' },
];

export default function ModelosContrato() {
  const [modelos, setModelos] = useState<ModeloContrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModelo, setEditingModelo] = useState<ModeloContrato | null>(null);
  const [editingClausula, setEditingClausula] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formNome, setFormNome] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [formClausulas, setFormClausulas] = useState<Clausula[]>([]);

  const fetchModelos = async () => {
    try {
      const { data, error } = await supabase
        .from('modelos_contrato')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const parsed = (data || []).map((m: any) => ({
        ...m,
        clausulas: Array.isArray(m.clausulas) ? m.clausulas : [],
      }));
      setModelos(parsed);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar modelos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchModelos(); }, []);

  const openNew = () => {
    setEditingModelo(null);
    setFormNome('');
    setFormDescricao('');
    setFormClausulas(defaultClausulas.map(c => ({ ...c, id: crypto.randomUUID() })));
    setEditingClausula(null);
    setDialogOpen(true);
  };

  const openEdit = (modelo: ModeloContrato) => {
    setEditingModelo(modelo);
    setFormNome(modelo.nome);
    setFormDescricao(modelo.descricao || '');
    setFormClausulas(modelo.clausulas.length > 0 ? modelo.clausulas : defaultClausulas.map(c => ({ ...c, id: crypto.randomUUID() })));
    setEditingClausula(null);
    setDialogOpen(true);
  };

  const handleDuplicate = (modelo: ModeloContrato) => {
    setEditingModelo(null);
    setFormNome(`${modelo.nome} (cópia)`);
    setFormDescricao(modelo.descricao || '');
    setFormClausulas(modelo.clausulas.map(c => ({ ...c, id: crypto.randomUUID() })));
    setEditingClausula(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formNome.trim()) { toast.error('Informe o nome do modelo'); return; }
    setSaving(true);
    try {
      const { data: profile } = await supabase.from('usuario_perfil').select('empresa_id').maybeSingle();
      const payload = {
        nome: formNome,
        descricao: formDescricao,
        clausulas: formClausulas as any,
        empresa_id: profile?.empresa_id || null,
        updated_at: new Date().toISOString(),
      };

      if (editingModelo) {
        const { error } = await supabase.from('modelos_contrato').update(payload).eq('id', editingModelo.id);
        if (error) throw error;
        toast.success('Modelo atualizado!');
      } else {
        const { error } = await supabase.from('modelos_contrato').insert(payload);
        if (error) throw error;
        toast.success('Modelo criado!');
      }
      setDialogOpen(false);
      fetchModelos();
    } catch (error: any) {
      toast.error(error.message || 'Erro ao salvar modelo');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este modelo de contrato?')) return;
    try {
      const { error } = await supabase.from('modelos_contrato').delete().eq('id', id);
      if (error) throw error;
      toast.success('Modelo excluído!');
      fetchModelos();
    } catch { toast.error('Erro ao excluir modelo'); }
  };

  const handleToggleAtivo = async (modelo: ModeloContrato) => {
    try {
      const { error } = await supabase.from('modelos_contrato').update({ ativo: !modelo.ativo }).eq('id', modelo.id);
      if (error) throw error;
      fetchModelos();
    } catch { toast.error('Erro ao atualizar status'); }
  };

  // Clause management
  const addClausula = () => {
    const newC: Clausula = { id: crypto.randomUUID(), titulo: `Cláusula ${formClausulas.length + 1}`, conteudo: '' };
    setFormClausulas([...formClausulas, newC]);
    setEditingClausula(newC.id);
  };

  const removeClausula = (id: string) => {
    setFormClausulas(formClausulas.filter(c => c.id !== id));
    if (editingClausula === id) setEditingClausula(null);
  };

  const moveClausula = (index: number, direction: 'up' | 'down') => {
    const newArr = [...formClausulas];
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= newArr.length) return;
    [newArr[index], newArr[swapIdx]] = [newArr[swapIdx], newArr[index]];
    setFormClausulas(newArr);
  };

  const updateClausula = (id: string, field: 'titulo' | 'conteudo', value: string) => {
    setFormClausulas(formClausulas.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Modelos de Contrato</h2>
          <p className="text-sm text-muted-foreground">Crie e gerencie modelos com cláusulas personalizáveis</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" /> Novo Modelo
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Carregando...</CardContent></Card>
      ) : modelos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
            <p className="text-muted-foreground mb-4">Nenhum modelo criado ainda</p>
            <Button onClick={openNew} variant="outline">
              <Plus className="mr-2 h-4 w-4" /> Criar Primeiro Modelo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {modelos.map((modelo) => (
            <Card key={modelo.id} className={!modelo.ativo ? 'opacity-60' : ''}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <h3 className="font-semibold">{modelo.nome}</h3>
                        {modelo.descricao && <p className="text-sm text-muted-foreground">{modelo.descricao}</p>}
                      </div>
                      <Badge variant={modelo.ativo ? 'default' : 'secondary'}>
                        {modelo.ativo ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 ml-8">
                      {modelo.clausulas.length} cláusula(s)
                    </p>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEdit(modelo)}>
                        <Edit className="mr-2 h-4 w-4" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDuplicate(modelo)}>
                        <Copy className="mr-2 h-4 w-4" /> Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleAtivo(modelo)}>
                        <Switch className="mr-2 h-4 w-4" /> {modelo.ativo ? 'Desativar' : 'Ativar'}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(modelo.id)} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit/Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingModelo ? 'Editar Modelo' : 'Novo Modelo de Contrato'}</DialogTitle>
            <DialogDescription>
              Defina as cláusulas do modelo. Use variáveis como {'{{sistema}}'}, {'{{valor_mensalidade}}'}, etc.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome do Modelo *</Label>
                <Input value={formNome} onChange={(e) => setFormNome(e.target.value)} placeholder="Ex: Contrato Padrão de Software" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input value={formDescricao} onChange={(e) => setFormDescricao(e.target.value)} placeholder="Breve descrição do modelo" />
              </div>
            </div>

            {/* Clauses */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">Cláusulas ({formClausulas.length})</h3>
                <Button variant="outline" size="sm" onClick={addClausula}>
                  <Plus className="mr-1 h-3 w-3" /> Adicionar Cláusula
                </Button>
              </div>

              <div className="space-y-2">
                {formClausulas.map((clausula, index) => (
                  <div key={clausula.id} className="border rounded-lg p-3 bg-secondary/30">
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-0.5">
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveClausula(index, 'up')} disabled={index === 0}>
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveClausula(index, 'down')} disabled={index === formClausulas.length - 1}>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono w-6">{index + 1}.</span>
                      {editingClausula === clausula.id ? (
                        <Input
                          value={clausula.titulo}
                          onChange={(e) => updateClausula(clausula.id, 'titulo', e.target.value)}
                          className="flex-1 h-8 text-sm font-semibold"
                        />
                      ) : (
                        <span
                          className="flex-1 text-sm font-semibold cursor-pointer hover:text-primary"
                          onClick={() => setEditingClausula(clausula.id)}
                        >
                          {clausula.titulo}
                        </span>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingClausula(editingClausula === clausula.id ? null : clausula.id)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeClausula(clausula.id)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    {editingClausula === clausula.id && (
                      <div className="mt-2 ml-8">
                        <Textarea
                          value={clausula.conteudo}
                          onChange={(e) => updateClausula(clausula.id, 'conteudo', e.target.value)}
                          rows={5}
                          className="text-sm"
                          placeholder="Conteúdo da cláusula..."
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Variáveis disponíveis: {'{{sistema}}'}, {'{{quantidade_licencas}}'}, {'{{vigencia_meses}}'}, {'{{data_inicio}}'}, {'{{data_fim}}'}, {'{{valor_software}}'}, {'{{valor_mensalidade}}'}, {'{{horario_atendimento}}'}, {'{{foro_comarca}}'}, {'{{prazo_aviso_rescisao}}'}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Salvando...' : editingModelo ? 'Salvar Alterações' : 'Criar Modelo'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
