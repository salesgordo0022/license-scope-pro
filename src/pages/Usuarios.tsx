import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, UserCog, MoreHorizontal, Edit, Trash2, Shield } from 'lucide-react';
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
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Database } from '@/integrations/supabase/types';

type UsuarioPerfil = Database['public']['Tables']['usuario_perfil']['Row'];
type UserRole = Database['public']['Enums']['user_role'];

export default function Usuarios() {
  const { isAdmin, isSuperAdmin, profile: currentProfile } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioPerfil[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<UsuarioPerfil | null>(null);
  const [creating, setCreating] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    tipo: 'revendedor' as UserRole,
  });

  const [createData, setCreateData] = useState({
    nome: '',
    email: '',
    password: '',
    tipo: 'revendedor' as UserRole,
  });

  const fetchUsuarios = async () => {
    try {
      const { data, error } = await supabase
        .from('usuario_perfil')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setUsuarios(data || []);
    } catch (error) {
      console.error('Error fetching usuarios:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      if (createData.tipo === 'super_admin' && !isSuperAdmin) {
        toast.error('Apenas super admins podem criar super admins');
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: createData.email,
          password: createData.password,
          nome: createData.nome,
          tipo: createData.tipo,
        },
      });

      const errorMsg = data?.error || error?.message || '';
      if (errorMsg) {
        if (errorMsg.includes('already been registered')) {
          toast.error('Este email já está cadastrado no sistema');
        } else {
          toast.error(errorMsg);
        }
        return;
      }

      toast.success('Usuário criado com sucesso!');
      setCreateDialogOpen(false);
      setCreateData({ nome: '', email: '', password: '', tipo: 'revendedor' });
      fetchUsuarios();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error('Erro ao criar usuário');
    } finally {
      setCreating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!editingUsuario) return;

    try {
      // Check permissions
      if (editingUsuario.tipo === 'super_admin' && !isSuperAdmin) {
        toast.error('Apenas super admins podem editar super admins');
        return;
      }

      if (formData.tipo === 'super_admin' && !isSuperAdmin) {
        toast.error('Apenas super admins podem definir o tipo super_admin');
        return;
      }

      const { error } = await supabase
        .from('usuario_perfil')
        .update({
          nome: formData.nome,
          tipo: formData.tipo,
        })
        .eq('id', editingUsuario.id);

      if (error) throw error;
      toast.success('Usuário atualizado com sucesso!');

      setDialogOpen(false);
      setEditingUsuario(null);
      fetchUsuarios();
    } catch (error: any) {
      console.error('Error saving usuario:', error);
      toast.error(error.message || 'Erro ao salvar usuário');
    }
  };

  const handleEdit = (usuario: UsuarioPerfil) => {
    setEditingUsuario(usuario);
    setFormData({
      nome: usuario.nome || '',
      email: usuario.email || '',
      tipo: usuario.tipo || 'revendedor',
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    const usuario = usuarios.find((u) => u.id === id);
    
    if (usuario?.tipo === 'super_admin' && !isSuperAdmin) {
      toast.error('Apenas super admins podem excluir super admins');
      return;
    }

    if (usuario?.id === currentProfile?.id) {
      toast.error('Você não pode excluir seu próprio usuário');
      return;
    }

    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;

    try {
      const { error } = await supabase.from('usuario_perfil').delete().eq('id', id);
      if (error) throw error;
      toast.success('Usuário excluído com sucesso!');
      fetchUsuarios();
    } catch (error) {
      console.error('Error deleting usuario:', error);
      toast.error('Erro ao excluir usuário');
    }
  };

  const filteredUsuarios = usuarios.filter((usuario) => {
    return (
      usuario.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      usuario.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const getRoleBadge = (tipo: UserRole | null) => {
    const config: Record<string, { label: string; className: string }> = {
      super_admin: { label: 'Super Admin', className: 'bg-primary/10 text-primary border-primary/20' },
      admin: { label: 'Admin', className: 'bg-info/10 text-info border-info/20' },
      revendedor: { label: 'Revendedor', className: 'bg-success/10 text-success border-success/20' },
    };
    const roleConfig = config[tipo || 'revendedor'];
    return (
      <Badge variant="outline" className={roleConfig.className}>
        <Shield className="mr-1 h-3 w-3" />
        {roleConfig.label}
      </Badge>
    );
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Acesso Restrito</h2>
          <p className="text-muted-foreground">
            Apenas administradores podem acessar esta página.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="page-header">
          <h1 className="page-title">Usuários</h1>
          <p className="page-description">Gerencie os usuários do sistema</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Usuário
        </Button>
      </motion.div>

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card>
          <CardContent className="pt-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Dialog for editing */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Atualize as informações do usuário
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" value={formData.email} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo</Label>
              <Select
                value={formData.tipo}
                onValueChange={(value) => setFormData({ ...formData, tipo: value as UserRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="revendedor">Revendedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit">Salvar</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog for creating */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription>
              Crie um novo usuário no sistema
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="create-nome">Nome</Label>
              <Input
                id="create-nome"
                required
                value={createData.nome}
                onChange={(e) => setCreateData({ ...createData, nome: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                required
                value={createData.email}
                onChange={(e) => setCreateData({ ...createData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">Senha</Label>
              <Input
                id="create-password"
                type="password"
                required
                minLength={6}
                value={createData.password}
                onChange={(e) => setCreateData({ ...createData, password: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-tipo">Tipo</Label>
              <Select
                value={createData.tipo}
                onValueChange={(value) => setCreateData({ ...createData, tipo: value as UserRole })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {isSuperAdmin && <SelectItem value="super_admin">Super Admin</SelectItem>}
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="revendedor">Revendedor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Criando...' : 'Criar Usuário'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

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
                    <th>Usuário</th>
                    <th>Tipo</th>
                    <th>Criado em</th>
                    <th className="w-[50px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-muted-foreground">
                        Carregando...
                      </td>
                    </tr>
                  ) : filteredUsuarios.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-muted-foreground">
                        Nenhum usuário encontrado
                      </td>
                    </tr>
                  ) : (
                    filteredUsuarios.map((usuario) => (
                      <tr key={usuario.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                              <UserCog className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <div className="font-medium">{usuario.nome || 'Sem nome'}</div>
                              <div className="text-sm text-muted-foreground">{usuario.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>{getRoleBadge(usuario.tipo)}</td>
                        <td className="text-muted-foreground">
                          {usuario.created_at
                            ? format(new Date(usuario.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                            : '-'}
                        </td>
                        <td>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleEdit(usuario)}>
                                <Edit className="mr-2 h-4 w-4" />
                                Editar
                              </DropdownMenuItem>
                              {usuario.id !== currentProfile?.id && (
                                <DropdownMenuItem
                                  onClick={() => handleDelete(usuario.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Excluir
                                </DropdownMenuItem>
                              )}
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
    </div>
  );
}
