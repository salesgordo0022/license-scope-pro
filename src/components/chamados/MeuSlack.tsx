import { useEffect, useState } from 'react';
import { Loader2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { erroDaFunction } from '@/lib/erroFunction';

export interface ConexaoSlack {
  id: string;
  perfil_id: string;
  slack_team_id: string;
  slack_team_nome: string | null;
  slack_user_id: string;
  slack_nome: string | null;
  canais: string[];
}

/**
 * "Meu Slack": cada usuário conecta a própria conta do Slack. As DMs, menções
 * e os canais que ele escolher aqui viram chamados DELE.
 */
export function MeuSlack({
  aberta,
  onFechar,
  conexao,
  onMudou,
}: {
  aberta: boolean;
  onFechar: () => void;
  conexao: ConexaoSlack | null;
  onMudou: () => void;
}) {
  const [canais, setCanais] = useState('');
  const [ocupado, setOcupado] = useState<'conectar' | 'desconectar' | 'salvar' | null>(null);

  useEffect(() => {
    if (aberta) setCanais((conexao?.canais || []).join(', '));
  }, [aberta, conexao]);

  const conectar = async () => {
    setOcupado('conectar');
    const volta = `${window.location.origin}${window.location.pathname}`;
    const { data, error } = await supabase.functions.invoke('slack-oauth', { body: { acao: 'iniciar', volta } });
    if (error || !data?.url) {
      setOcupado(null);
      toast.error('Não foi possível conectar', { description: await erroDaFunction(error, data) });
      return;
    }
    window.location.href = data.url as string;
  };

  const desconectar = async () => {
    if (!window.confirm('Desconectar seu Slack? Os chamados antigos continuam aqui, mas mensagens novas param de chegar.')) return;
    setOcupado('desconectar');
    const { data, error } = await supabase.functions.invoke('slack-oauth', { body: { acao: 'desconectar' } });
    setOcupado(null);
    if (error || data?.error) {
      toast.error('Não foi possível desconectar', { description: await erroDaFunction(error, data) });
      return;
    }
    toast.success('Slack desconectado');
    onMudou();
  };

  const salvarCanais = async () => {
    if (!conexao) return;
    setOcupado('salvar');
    const lista = [...new Set(canais.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))];
    const invalidos = lista.filter((c) => !/^[CG][A-Z0-9]{6,}$/.test(c));
    if (invalidos.length) {
      setOcupado(null);
      toast.error('ID de canal inválido', { description: `${invalidos.join(', ')} — o ID começa com C (ex.: C0123ABCD).` });
      return;
    }
    const { error } = await supabase.from('slack_conexoes').update({ canais: lista, updated_at: new Date().toISOString() }).eq('id', conexao.id);
    setOcupado(null);
    if (error) {
      toast.error('Não foi possível salvar', { description: error.message });
      return;
    }
    toast.success('Canais salvos');
    onMudou();
  };

  return (
    <Dialog open={aberta} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-[#4A154B] text-[10px] font-bold text-white">S</span> Meu Slack
          </DialogTitle>
          <DialogDescription>Conecte a sua conta: suas DMs, menções a você e os canais escolhidos viram chamados seus. As respostas saem com o seu nome.</DialogDescription>
        </DialogHeader>

        {!conexao ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Você ainda não conectou o Slack. Vai abrir a tela de autorização do Slack; depois você volta para cá.</p>
            <Button onClick={conectar} disabled={ocupado !== null} className="w-full gap-2 bg-[#4A154B] text-white hover:bg-[#4A154B]/90">
              {ocupado === 'conectar' && <Loader2 className="h-4 w-4 animate-spin" />} Conectar meu Slack
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-emerald-50/60 p-3 text-sm dark:bg-emerald-950/20">
              Conectado como <strong>{conexao.slack_nome || conexao.slack_user_id}</strong>
              {conexao.slack_team_nome ? <> em <strong>{conexao.slack_team_nome}</strong></> : null}
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Canais que viram chamado por inteiro (IDs C…, separados por vírgula)</Label>
              <Input value={canais} onChange={(e) => setCanais(e.target.value)} placeholder="C0123SUPORTE, C0456CLIENTES" />
              <p className="text-[11px] text-muted-foreground">
                No Slack, clique no nome do canal; o ID aparece no rodapé. Você precisa ser membro do canal. DMs e menções a você entram sempre, sem configurar nada.
              </p>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <Button variant="outline" className="text-destructive" onClick={desconectar} disabled={ocupado !== null}>
                {ocupado === 'desconectar' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Desconectar
              </Button>
              <Button onClick={salvarCanais} disabled={ocupado !== null}>
                {ocupado === 'salvar' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Salvar canais
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
