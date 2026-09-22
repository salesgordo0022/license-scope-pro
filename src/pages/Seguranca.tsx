import { useEffect, useState } from 'react';
import { ShieldCheck, ShieldAlert, Loader2, Trash2, KeyRound } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { avaliarSenha, SENHA_TAMANHO_MINIMO } from '@/lib/authPolicy';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

/** Fator TOTP como o Supabase devolve em `listFactors`. */
interface Fator {
  id: string;
  status: string;
  friendly_name?: string;
  created_at: string;
}

/**
 * Tela de segurança da própria conta: ativar/remover a verificação em duas
 * etapas e trocar a senha.
 *
 * É uma tela pessoal, não administrativa — cada usuário cuida do próprio
 * acesso, inclusive o revendedor. Por isso não tem trava por papel.
 */
export default function Seguranca() {
  const { atualizarMfa, mfa } = useAuth();

  const [fatores, setFatores] = useState<Fator[]>([]);
  const [carregando, setCarregando] = useState(true);

  // Estado do cadastro de um novo fator
  const [inscrevendo, setInscrevendo] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [segredo, setSegredo] = useState<string | null>(null);
  const [fatorPendente, setFatorPendente] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');

  // Troca de senha
  const [novaSenha, setNovaSenha] = useState('');
  const [trocandoSenha, setTrocandoSenha] = useState(false);

  /** Lista os fatores TOTP já cadastrados na conta. */
  const carregarFatores = async () => {
    setCarregando(true);
    try {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw error;
      setFatores((data?.totp ?? []) as Fator[]);
    } catch {
      toast.error('Não foi possível carregar os fatores de autenticação.');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarFatores();
  }, []);

  /**
   * Inicia o cadastro de um fator TOTP.
   *
   * O Supabase devolve o QR Code já pronto como SVG embutido e o segredo em
   * texto (para quem precisa digitar à mão). O fator nasce como `unverified`:
   * só vale depois que o usuário confirmar um código gerado por ele — assim
   * ninguém fica trancado para fora por ter escaneado errado.
   */
  const iniciarCadastro = async () => {
    setInscrevendo(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Autenticador ${new Date().toLocaleDateString('pt-BR')}`,
      });
      if (error) throw error;

      setQrCode(data.totp.qr_code);
      setSegredo(data.totp.secret);
      setFatorPendente(data.id);
    } catch (e) {
      toast.error('Não foi possível iniciar o cadastro', {
        description: e instanceof Error ? e.message : undefined,
      });
      setInscrevendo(false);
    }
  };

  /** Confirma o fator recém-criado validando um código do aplicativo. */
  const confirmarCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fatorPendente) return;

    const limpo = codigo.replace(/\D/g, '');
    if (limpo.length !== 6) {
      toast.error('Digite os 6 dígitos do aplicativo.');
      return;
    }

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: fatorPendente,
        code: limpo,
      });
      if (error) throw error;

      toast.success('Verificação em duas etapas ativada.');
      cancelarCadastro();
      await carregarFatores();
      await atualizarMfa();
    } catch {
      setCodigo('');
      toast.error('Código inválido', { description: 'Confira o código atual e tente de novo.' });
    }
  };

  /**
   * Descarta um cadastro em andamento.
   * Remove o fator pendente do servidor: deixá-lo `unverified` pendurado na
   * conta só gera confusão na próxima vez que o usuário abrir esta tela.
   */
  const cancelarCadastro = async () => {
    if (fatorPendente) {
      try {
        await supabase.auth.mfa.unenroll({ factorId: fatorPendente });
      } catch {
        // fator pendente não confirmado expira sozinho; ignorar é aceitável
      }
    }
    setInscrevendo(false);
    setQrCode(null);
    setSegredo(null);
    setFatorPendente(null);
    setCodigo('');
  };

  /** Remove um fator já ativo, voltando a conta para senha apenas. */
  const removerFator = async (id: string) => {
    if (!confirm('Remover a verificação em duas etapas? Sua conta passará a exigir apenas a senha.')) return;
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw error;
      toast.success('Verificação em duas etapas removida.');
      await carregarFatores();
      await atualizarMfa();
    } catch {
      toast.error('Não foi possível remover o fator.');
    }
  };

  /**
   * Troca a senha da conta.
   *
   * A política é checada aqui antes de enviar; o Supabase aplica as próprias
   * regras do projeto por cima (incluindo a base de senhas vazadas, se estiver
   * habilitada no painel).
   */
  const trocarSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    const forca = avaliarSenha(novaSenha);
    if (!forca.valida) {
      toast.error('Senha fraca', { description: forca.problemas.join('. ') + '.' });
      return;
    }

    setTrocandoSenha(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
      setNovaSenha('');
      toast.success('Senha atualizada.');
    } catch (err) {
      toast.error('Não foi possível trocar a senha', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setTrocandoSenha(false);
    }
  };

  const fatoresAtivos = fatores.filter((f) => f.status === 'verified');
  const forcaNova = novaSenha ? avaliarSenha(novaSenha) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Segurança da conta</h1>
        <p className="text-muted-foreground">Proteja seu acesso ao sistema.</p>
      </div>

      {/* ---------------------------------------------------- Dois fatores */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Verificação em duas etapas
              </CardTitle>
              <CardDescription className="mt-1">
                Além da senha, o sistema pede um código de 6 dígitos gerado no seu celular.
                Isso protege a conta mesmo que a senha vaze.
              </CardDescription>
            </div>
            {mfa.temFatorAtivo ? (
              <Badge variant="outline" className="shrink-0">Ativa</Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0">Inativa</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {carregando ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          ) : fatoresAtivos.length > 0 ? (
            <div className="space-y-2">
              {fatoresAtivos.map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="font-medium">{f.friendly_name || 'Aplicativo autenticador'}</p>
                    <p className="text-sm text-muted-foreground">
                      Ativo desde {new Date(f.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removerFator(f.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : !inscrevendo ? (
            <>
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  Sua conta está protegida apenas por senha. Se ela vazar, basta isso para
                  alguém entrar.
                </span>
              </div>
              <Button onClick={iniciarCadastro}>Ativar verificação em duas etapas</Button>
            </>
          ) : null}

          {/* Passo a passo do cadastro */}
          {inscrevendo && qrCode && (
            <div className="space-y-4">
              <Separator />
              <div className="space-y-2 text-sm">
                <p className="font-medium">1. Escaneie o código no seu aplicativo autenticador</p>
                <p className="text-muted-foreground">
                  Google Authenticator, Microsoft Authenticator, Authy, 1Password — qualquer um serve.
                </p>
              </div>

              {/* O QR vem do Supabase como SVG em data URI; nada é gerado aqui. */}
              <div className="flex justify-center rounded-lg border bg-white p-4">
                <img src={qrCode} alt="QR Code para o aplicativo autenticador" className="h-48 w-48" />
              </div>

              {segredo && (
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">
                    Não consegue escanear? Digite este código no aplicativo:
                  </p>
                  <code className="block break-all rounded bg-muted p-2 text-xs">{segredo}</code>
                </div>
              )}

              <form onSubmit={confirmarCadastro} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="codigo-confirmacao">
                    2. Digite o código de 6 dígitos que apareceu
                  </Label>
                  <Input
                    id="codigo-confirmacao"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="000000"
                    maxLength={6}
                    value={codigo}
                    onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ''))}
                    className="text-center text-xl tracking-[0.4em]"
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={codigo.length !== 6}>Confirmar e ativar</Button>
                  <Button type="button" variant="ghost" onClick={cancelarCadastro}>Cancelar</Button>
                </div>
              </form>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------------------------------------------------- Senha */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Trocar senha
          </CardTitle>
          <CardDescription>
            Mínimo de {SENHA_TAMANHO_MINIMO} caracteres, combinando pelo menos três entre
            minúsculas, maiúsculas, números e símbolos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={trocarSenha} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nova-senha">Nova senha</Label>
              <Input
                id="nova-senha"
                type="password"
                autoComplete="new-password"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                placeholder="••••••••••"
              />
              {forcaNova && (
                <div className="space-y-1">
                  <div className="flex gap-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={`h-1 flex-1 rounded-full ${
                          i < forcaNova.pontuacao ? 'bg-primary' : 'bg-muted'
                        }`}
                      />
                    ))}
                  </div>
                  {forcaNova.problemas.map((p) => (
                    <p key={p} className="text-xs text-muted-foreground">• {p}</p>
                  ))}
                </div>
              )}
            </div>
            <Button type="submit" disabled={trocandoSenha || !forcaNova?.valida}>
              {trocandoSenha ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Atualizar senha
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
