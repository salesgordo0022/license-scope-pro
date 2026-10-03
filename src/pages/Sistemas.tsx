import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Edit, Trash2, Monitor } from '@/components/icons';
import TetrisLoading from '@/components/ui/tetris-loader';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

interface Sistema {
  id: string;
  nome: string;
  descricao: string | null;
  cor: string | null;
  ativo: boolean;
  created_at: string;
}

/** Catálogo de sistemas comercializados, com preço base usado nos contratos. */
export default function Sistemas() {
  const [sistemas, setSistemas] = useState<Sistema[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSistema, setEditingSistema] = useState<Sistema | null>(null);
  const [formData, setFormData] = useState({
    nome: '',
    descricao: '',
    cor: '#3b82f6',
    ativo: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchSistemas();
  }, []);

  /** Carrega o catálogo de sistemas. */
  const fetchSistemas = async () => {
    try {
      const { data, error } = await supabase
        .from('sistemas')
        .select('*')
        .order('nome');

      if (error) throw error;
      setSistemas(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar sistemas',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  /** Salva o sistema (novo ou editado). */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingSistema) {
        const { error } = await supabase
          .from('sistemas')
          .update({
            nome: formData.nome,
            descricao: formData.descricao || null,
            cor: formData.cor,
            ativo: formData.ativo,
          })
          .eq('id', editingSistema.id);

        if (error) throw error;

        toast({ title: 'Sistema atualizado com sucesso!' });
      } else {
        const { error } = await supabase.from('sistemas').insert({
          nome: formData.nome,
          descricao: formData.descricao || null,
          cor: formData.cor,
          ativo: formData.ativo,
        });

        if (error) throw error;

        toast({ title: 'Sistema criado com sucesso!' });
      }

      setIsDialogOpen(false);
      setEditingSistema(null);
      setFormData({ nome: '', descricao: '', cor: '#3b82f6', ativo: true });
      fetchSistemas();
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar sistema',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  /** Abre o formulário preenchido com o sistema escolhido. */
  const handleEdit = (sistema: Sistema) => {
    setEditingSistema(sistema);
    setFormData({
      nome: sistema.nome,
      descricao: sistema.descricao || '',
      cor: sistema.cor || '#3b82f6',
      ativo: sistema.ativo,
    });
    setIsDialogOpen(true);
  };

  /** Exclui o sistema após confirmação. */
  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este sistema?')) return;

    try {
      const { error } = await supabase.from('sistemas').delete().eq('id', id);

      if (error) throw error;

      toast({ title: 'Sistema excluído com sucesso!' });
      fetchSistemas();
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir sistema',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  /** Filtra o catálogo pelo termo de busca. */
  const filteredSistemas = sistemas.filter((s) =>
    s.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
            Sistemas
          </h1>
          <p className="text-muted-foreground">
            Gerencie os sistemas/softwares disponíveis para venda
          </p>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setEditingSistema(null);
                setFormData({ nome: '', descricao: '', cor: '#3b82f6', ativo: true });
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo Sistema
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingSistema ? 'Editar Sistema' : 'Novo Sistema'}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  value={formData.nome}
                  onChange={(e) =>
                    setFormData({ ...formData, nome: e.target.value })
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="descricao">Descrição</Label>
                <Textarea
                  id="descricao"
                  value={formData.descricao}
                  onChange={(e) =>
                    setFormData({ ...formData, descricao: e.target.value })
                  }
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cor">Cor do Sistema</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id="cor"
                    type="color"
                    value={formData.cor}
                    onChange={(e) =>
                      setFormData({ ...formData, cor: e.target.value })
                    }
                    className="h-10 w-20 p-1 cursor-pointer"
                  />
                  <Input
                    value={formData.cor}
                    onChange={(e) =>
                      setFormData({ ...formData, cor: e.target.value })
                    }
                    className="flex-1"
                    placeholder="#000000"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="ativo"
                  checked={formData.ativo}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, ativo: checked })
                  }
                />
                <Label htmlFor="ativo">Ativo</Label>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingSistema ? 'Salvar' : 'Criar'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar sistemas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-sm text-muted-foreground">
                   <th className="pb-3 font-medium">Cor</th>
                   <th className="pb-3 font-medium">Nome</th>
                   <th className="pb-3 font-medium">Descrição</th>
                   <th className="pb-3 font-medium">Status</th>
                   <th className="pb-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center">
                      <TetrisLoading size="sm" speed="fast" loadingText="Carregando..." />
                    </td>
                  </tr>
                ) : filteredSistemas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      <Monitor className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      Nenhum sistema encontrado
                    </td>
                  </tr>
                ) : (
                  filteredSistemas.map((sistema) => (
                    <tr
                      key={sistema.id}
                      className="border-b last:border-0 hover:bg-muted/50"
                    >
                      <td className="py-3">
                        <div 
                          className="h-6 w-6 rounded-full border border-border"
                          style={{ backgroundColor: sistema.cor || '#3b82f6' }}
                          title={sistema.cor || '#3b82f6'}
                        />
                      </td>
                      <td className="py-3 font-medium">{sistema.nome}</td>
                      <td className="py-3 text-muted-foreground">
                        {sistema.descricao || '-'}
                      </td>
                      <td className="py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                            sistema.ativo
                              ? 'bg-success/20 text-success'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {sistema.ativo ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(sistema)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDelete(sistema.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {!loading && filteredSistemas.length > 0 && (
                <tfoot>
                  <tr className="bg-muted/50 font-semibold border-t-2">
                    <td colSpan={5} className="py-3">
                      Total: {filteredSistemas.length} sistemas
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
