import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Trash2, Edit } from '@/components/icons';
import { toast } from 'sonner';

interface Grupo {
  id: string;
  nome: string;
  cor: string;
  descricao: string | null;
}

/**
 * Gerencia os grupos usados para organizar clientes (matriz/filiais, redes).
 * Avisa a tela pai por `onGroupsChange` sempre que a lista muda, para o
 * seletor de grupos ser recarregado.
 */
export function GrupoClienteManager({ onGroupsChange }: { onGroupsChange?: () => void }) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingGrupo, setEditingGrupo] = useState<Grupo | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    cor: '#94a3b8',
    descricao: '',
  });

  /** Carrega os grupos da empresa. */
  const fetchGrupos = async () => {
    try {
      const { data, error } = await supabase
        .from('grupos_clientes')
        .select('*')
        .order('nome');
      if (error) throw error;
      setGrupos(data || []);
      if (onGroupsChange) onGroupsChange();
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGrupos();
  }, []);

  /** Salva o grupo (novo ou editado). */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Usuário não autenticado');
        return;
      }

      const { data: profile } = await supabase
        .from('usuario_perfil')
        .select('empresa_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (editingGrupo) {
        const { error } = await supabase
          .from('grupos_clientes')
          .update({
            nome: formData.nome,
            cor: formData.cor,
            descricao: formData.descricao,
          })
          .eq('id', editingGrupo.id);
        if (error) throw error;
        toast.success('Grupo atualizado!');
      } else {
        const { error } = await supabase
          .from('grupos_clientes')
          .insert({
            nome: formData.nome,
            cor: formData.cor,
            descricao: formData.descricao,
            empresa_id: profile?.empresa_id ?? null,
          });
        if (error) throw error;
        toast.success('Grupo criado!');
      }
      setFormData({ nome: '', cor: '#94a3b8', descricao: '' });
      setEditingGrupo(null);
      fetchGrupos();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  /** Abre o formulário preenchido com o grupo escolhido. */
  const handleEdit = (grupo: Grupo) => {
    setEditingGrupo(grupo);
    setFormData({
      nome: grupo.nome,
      cor: grupo.cor,
      descricao: grupo.descricao || '',
    });
  };

  /** Exclui o grupo após confirmação. */
  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este grupo? Clientes vinculados ficarão sem grupo.')) return;
    try {
      const { error } = await supabase.from('grupos_clientes').delete().eq('id', id);
      if (error) throw error;
      toast.success('Grupo excluído');
      fetchGrupos();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="w-4 h-4 mr-2" />
          Gerenciar Grupos
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Grupos de Clientes</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mb-6 border-b pb-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="nome">Nome do Grupo</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cor">Cor de Destaque</Label>
              <div className="flex gap-2">
                <Input
                  id="cor"
                  type="color"
                  className="w-12 h-10 p-1"
                  value={formData.cor}
                  onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                />
                <Input
                  value={formData.cor}
                  onChange={(e) => setFormData({ ...formData, cor: e.target.value })}
                  placeholder="#000000"
                />
              </div>
            </div>
          </div>
          <Button type="submit" className="w-full">
            {editingGrupo ? 'Atualizar Grupo' : 'Criar Grupo'}
          </Button>
          {editingGrupo && (
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setEditingGrupo(null);
                setFormData({ nome: '', cor: '#94a3b8', descricao: '' });
              }}
            >
              Cancelar Edição
            </Button>
          )}
        </form>

        <div className="space-y-2 max-h-[300px] overflow-y-auto">
          <Label>Grupos Existentes</Label>
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum grupo criado.</p>
          ) : (
            grupos.map((grupo) => (
              <div
                key={grupo.id}
                className="flex items-center justify-between p-2 rounded-md border"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: grupo.cor }}
                  />
                  <span className="text-sm font-medium">{grupo.nome}</span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleEdit(grupo)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(grupo.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
