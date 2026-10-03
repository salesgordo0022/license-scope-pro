import { useState } from 'react';
import { ShieldCheck, Loader2 } from '@/components/icons';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

/**
 * Segunda etapa do login: pede o código de 6 dígitos do aplicativo autenticador.
 *
 * É exibida quando a senha já foi aceita mas a sessão está em `aal1` e o
 * usuário tem um fator TOTP confirmado. Até o código ser validado, a sessão
 * existe porém não passa pelas policies que exigem `aal2` — por isso a tela é
 * bloqueante, mas com uma saída explícita ("Sair") para quem desistir.
 */
export function DesafioMfa() {
  const { signOut, atualizarMfa } = useAuth();
  const [codigo, setCodigo] = useState('');
  const [verificando, setVerificando] = useState(false);

  /**
   * Valida o código contra o fator cadastrado.
   *
   * `challengeAndVerify` cria o desafio e confere a resposta numa chamada só.
   * Em caso de erro a mensagem é genérica: detalhar se o problema foi o código
   * ou o relógio do aparelho ajudaria mais quem está testando à força.
   */
  const verificar = async (e: React.FormEvent) => {
    e.preventDefault();
    const limpo = codigo.replace(/\D/g, '');
    if (limpo.length !== 6) {
      toast.error('Digite os 6 dígitos do aplicativo.');
      return;
    }

    setVerificando(true);
    try {
      const { data: fatores, error: erroFatores } = await supabase.auth.mfa.listFactors();
      if (erroFatores) throw erroFatores;

      const totp = fatores?.totp?.[0];
      if (!totp) throw new Error('Nenhum fator cadastrado');

      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: totp.id,
        code: limpo,
      });
      if (error) throw error;

      await atualizarMfa();
      toast.success('Verificação concluída.');
    } catch {
      setCodigo('');
      toast.error('Código inválido', {
        description: 'Confira o código atual no aplicativo e tente de novo.',
      });
    } finally {
      setVerificando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <Card className="w-full max-w-md border-border/50 shadow-lg">
        <CardHeader className="space-y-1">
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <CardTitle className="text-2xl">Verificação em duas etapas</CardTitle>
          <CardDescription>
            Digite o código de 6 dígitos do seu aplicativo autenticador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={verificar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-codigo">Código</Label>
              <Input
                id="mfa-codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                className="text-center text-2xl tracking-[0.5em]"
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" disabled={verificando || codigo.length !== 6}>
              {verificando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Verificar
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={signOut}>
              Sair
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default DesafioMfa;
