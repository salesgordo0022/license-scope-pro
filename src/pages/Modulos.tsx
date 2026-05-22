import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Box, Plus, Edit, Trash2, MoreHorizontal } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

type Modulo = Database['public']['Tables']['modulos']['Row'];

export default function Modulos() {
  const { isSuperAdmin } = useAuth();
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingModulo, setEditingModulo] = useState<Modulo | null>(null);

  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
  });

  const fetchModulos = async () => {
    try {
      const { data, error } = await supabase
        .from('modulos')
        .select('*')
        .order('nome');

      if (error) throw error;
      setModulos(data || []);
    } catch (error) {
      console.error('Error fetching modulos:', error);
      toast.error('Erro ao carregar módulos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModulos();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isSuperAdmin) {
      toast.error('Apenas super admins podem gerenciar módulos');
      return;
    }

    try {
      if (editingModulo) {
        const { error } = await supabase
          .from('modulos')
          .update(formData)
          .eq('id', editingModulo.id);

        if (error) throw error;
        toast.success('Módulo atualizado com sucesso!');
      } else {
        const { error } = await supabase.from('modulos').insert(formData);

        if (error) throw error;
        toast.success('Módulo criado com sucesso!');
      }

      setDialogOpen(false);
      setEditingModulo(null);
      setFormData({ nome: '', descricao: '' });
      fetchModulos();
    } catch (error: any) {
      console.error('Error saving modulo:', error);
      toast.error(error.message || 'Erro ao salvar módulo');
    }
  };

  const handleEdit = (modulo: Modulo) => {
    setEditingModulo(modulo);
    setFormData({
      nome: modulo.nome,
      descricao: modulo.descricao || '',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!isSuperAdmin) {
      toast.error('Apenas super admins podem excluir módulos');
      return;
    }

    if (!confirm('Tem certeza que deseja excluir este módulo?')) return;

    try {
      const { error } = await supabase.from('modulos').delete().eq('id', id);
      if (error) throw error;
      toast.success('Módulo excluído com sucesso!');
      fetchModulos();
    } catch (error) {
      console.error('Error deleting modulo:', error);
      toast.error('Erro ao excluir módulo');
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
          <h1 className="page-title">Módulos</h1>
          <p className="page-description">Módulos de software disponíveis para os clientes</p>
        </div>

        {isSuperAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingModulo(null); setFormData({ nome: '', descricao: '' }); }}>
                <Plus className="mr-2 h-4 w-4" />
                Novo Módulo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingModulo ? 'Editar Módulo' : 'Novo Módulo'}</DialogTitle>
                <DialogDescription>
                  {editingModulo ? 'Atualize as informações do módulo' : 'Crie um novo módulo de software'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome *</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea
                    id="descricao"
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit">
                    {editingModulo ? 'Salvar' : 'Criar'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </motion.div>

      {/* Grid */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {loading ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Carregando...
          </div>
        ) : modulos.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted-foreground">
            Nenhum módulo encontrado
          </div>
        ) : (
          modulos.map((modulo, index) => (
            <motion.div
              key={modulo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-lg bg-primary/10">
                        <Box className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{modulo.nome}</h3>
                        {modulo.descricao && (
                          <p className="text-sm text-muted-foreground mt-1">{modulo.descricao}</p>
                        )}
                      </div>
                    </div>
                    {isSuperAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(modulo)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(modulo.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </motion.div>
    </div>
  );
}
