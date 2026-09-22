import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, MoreHorizontal, Edit, Trash2, Layers } from 'lucide-react';
import TetrisLoading from '@/components/ui/tetris-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Segmento {
  id: string;
  nome: string;
  descricao: string | null;
  created_at: string;
}

/** Cadastro dos segmentos de mercado usados para classificar os clientes. */
export default function Segmentos() {
  const [segmentos, setSegmentos] = useState<Segmento[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSegmento, setEditingSegmento] = useState<Segmento | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
  });

  /** Carrega os segmentos da empresa. */
  const fetchSegmentos = async () => {
    try {
      const { data, error } = await supabase
        .from('segmentos')
        .select('*')
        .order('nome');

      if (error) throw error;
      setSegmentos(data || []);
    } catch (error: any) {
      toast.error('Erro ao carregar segmentos: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSegmentos();
  }, []);

  /** Salva o segmento (novo ou editado). */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingSegmento) {
        const { error } = await supabase
          .from('segmentos')
          .update({
            nome: formData.nome,
            descricao: formData.descricao || null,
          })
          .eq('id', editingSegmento.id);

        if (error) throw error;
        toast.success('Segmento atualizado com sucesso!');
      } else {
        const { error } = await supabase
          .from('segmentos')
          .insert({
            nome: formData.nome,
            descricao: formData.descricao || null,
          });

        if (error) throw error;
        toast.success('Segmento criado com sucesso!');
      }

      setDialogOpen(false);
      resetForm();
      fetchSegmentos();
    } catch (error: any) {
      toast.error('Erro ao salvar segmento: ' + error.message);
    }
  };

  /** Abre o formulário preenchido com o segmento escolhido. */
  const handleEdit = (segmento: Segmento) => {
    setEditingSegmento(segmento);
    setFormData({
      nome: segmento.nome,
      descricao: segmento.descricao || '',
    });
    setDialogOpen(true);
  };

  /** Exclui o segmento após confirmação. */
  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este segmento?')) return;

    try {
      const { error } = await supabase
        .from('segmentos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Segmento excluído com sucesso!');
      fetchSegmentos();
    } catch (error: any) {
      toast.error('Erro ao excluir segmento: ' + error.message);
    }
  };

  const resetForm = () => {
    setEditingSegmento(null);
    setFormData({ nome: '', descricao: '' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Segmentos</h1>
          <p className="text-muted-foreground">
            Gerencie os segmentos de mercado das empresas
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
                <Plus className="mr-2 h-4 w-4" />
                Novo Segmento
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>
                    {editingSegmento ? 'Editar Segmento' : 'Novo Segmento'}
                  </DialogTitle>
                  <DialogDescription>
                    {editingSegmento 
                      ? 'Edite as informações do segmento.' 
                      : 'Adicione um novo segmento de mercado.'}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="nome">Nome *</Label>
                    <Input
                      id="nome"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="Ex: Varejo, Indústria, Serviços..."
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="descricao">Descrição</Label>
                    <Textarea
                      id="descricao"
                      value={formData.descricao}
                      onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                      placeholder="Descrição do segmento..."
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingSegmento ? 'Salvar' : 'Criar'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <TetrisLoading size="sm" speed="fast" loadingText="Carregando..." />
        </div>
      ) : segmentos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Layers className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum segmento cadastrado</h3>
            <p className="text-muted-foreground text-center mb-4">
              Comece adicionando segmentos de mercado para categorizar suas empresas.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Adicionar Segmento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {segmentos.map((segmento) => (
            <Card key={segmento.id} className="group">
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Layers className="h-4 w-4 text-primary" />
                  </div>
                  <CardTitle className="text-lg">{segmento.nome}</CardTitle>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleEdit(segmento)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => handleDelete(segmento.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Excluir
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <CardDescription className="line-clamp-2">
                  {segmento.descricao || 'Sem descrição'}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </motion.div>
  );
}
