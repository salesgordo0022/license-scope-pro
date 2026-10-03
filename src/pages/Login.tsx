import { useState, useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Loader2, ArrowRight, Eye, EyeOff, LogIn, Wallet, KeyRound, Users, Headphones, ShieldHalf } from '@/components/icons';
import { useAuth, PUBLIC_SIGNUP_ENABLED } from '@/contexts/AuthContext';
import { estadoBloqueio } from '@/lib/authPolicy';
import { ImperTechLogo } from '@/components/brand/ImperTechLogo';
import { AlternarTema } from '@/components/layout/AlternarTema';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import TetrisLoading from '@/components/ui/tetris-loader';

/** WhatsApp do suporte (só dígitos, com DDI). Configurável por variável de ambiente. */
const SUPORTE_WHATSAPP = (import.meta.env.VITE_SUPORTE_WHATSAPP as string | undefined)?.replace(/\D/g, '');

const DESTAQUES = [
  { icone: Wallet, texto: ['Financeiro', 'em dia'] },
  { icone: KeyRound, texto: ['Licenças sob', 'controle'] },
  { icone: Users, texto: ['Clientes num', 'só lugar'] },
  { icone: Headphones, texto: ['Suporte', 'ImperTech'] },
];

const classeInput =
  'h-14 rounded-xl border-input bg-muted/40 pl-12 text-base placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-0';

const botaoPrimario =
  'h-14 w-full rounded-xl bg-gradient-to-r from-[#1550E0] to-[#2F8BF5] text-lg font-semibold shadow-[0_12px_24px_-10px_rgba(21,80,224,0.7)] transition hover:brightness-110';

/** Campo com rótulo e ícone à esquerda, no padrão visual da tela de login. */
function CampoLogin({ id, rotulo, icone: Icone, children }: { id: string; rotulo: string; icone: typeof Mail; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="flex items-center gap-2 text-[15px] font-semibold text-foreground">
        <Icone className="h-4 w-4" /> {rotulo}
      </Label>
      <div className="relative">
        <Icone className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        {children}
      </div>
    </div>
  );
}

/**
 * Tela de autenticação.
 *
 * Redireciona para o dashboard se já houver sessão. A aba "Criar conta" só
 * é montada quando o auto-cadastro público está habilitado por variável de
 * ambiente — por padrão, acessos são provisionados por um administrador.
 */
export default function Login() {
  const { signIn, signUp, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  // Estado do freio de tentativas, recalculado a cada segundo enquanto travado.
  const [bloqueio, setBloqueio] = useState(estadoBloqueio);

  // Login form
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register form
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  // Show password toggles
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);

  // Enquanto o formulário está travado, atualiza o contador regressivo. O
  // intervalo só roda nesse caso — sem bloqueio ativo não há timer pendurado.
  useEffect(() => {
    if (!bloqueio.bloqueado) return;
    const t = setInterval(() => setBloqueio(estadoBloqueio()), 1000);
    return () => clearInterval(t);
  }, [bloqueio.bloqueado]);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <TetrisLoading size="sm" speed="fast" loadingText="Carregando..." />
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  /** Autentica o usuário. A mensagem de erro é genérica de propósito: dizer se
   *  o email existe permitiria enumerar contas do sistema. */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    // Trava local depois de 5 erros em 15 minutos. Não substitui o rate limit
    // do Supabase — encarece o ataque de força bruta feito por esta tela.
    const estado = estadoBloqueio();
    if (estado.bloqueado) {
      setBloqueio(estado);
      toast.error('Muitas tentativas', {
        description: `Aguarde ${estado.segundosRestantes}s antes de tentar de novo.`,
      });
      return;
    }

    setLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    const depois = estadoBloqueio();
    setBloqueio(depois);

    if (error) {
      setLoginPassword('');
      toast.error('Erro ao fazer login', {
        description: depois.tentativasRestantes > 0 && depois.tentativasRestantes <= 2
          ? `Verifique suas credenciais. Restam ${depois.tentativasRestantes} tentativa(s).`
          : 'Verifique suas credenciais e tente novamente.',
      });
    } else {
      toast.success('Login realizado com sucesso!');
      navigate('/dashboard');
    }

    setLoading(false);
  };

  /** Cria uma conta pelo formulário público (quando habilitado). O papel do
   *  usuário é definido no banco pelo trigger handle_new_user, nunca aqui. */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await signUp(registerEmail, registerPassword, registerName);

    if (error) {
      toast.error('Erro ao criar conta', {
        description: error.message,
      });
    } else {
      toast.success('Conta criada com sucesso!', {
        description: 'Você já pode fazer login.',
      });
      navigate('/dashboard');
    }

    setLoading(false);
  };

  /** Abre o WhatsApp do suporte, se configurado; senão orienta a procurar o admin. */
  const falarComSuporte = () => {
    if (SUPORTE_WHATSAPP) {
      window.open(`https://wa.me/${SUPORTE_WHATSAPP}`, '_blank', 'noopener');
    } else {
      toast.info('Fale com o suporte', {
        description: 'Procure o administrador da sua empresa para recuperar ou criar o seu acesso.',
      });
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Lado esquerdo - marca */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#0A1A42] via-[#0D2266] to-[#123BB0] lg:flex lg:w-1/2">
        {/* Planos diagonais decorativos */}
        <div className="pointer-events-none absolute -right-40 -top-24 h-[420px] w-[420px] rotate-45 rounded-[48px] bg-gradient-to-br from-[#1D4ED8]/50 to-transparent" />
        <div className="pointer-events-none absolute -right-24 top-1/3 h-[300px] w-[300px] rotate-45 rounded-[40px] border border-white/10 bg-[#0A1A42]/30" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[460px] w-[460px] rotate-45 rounded-[56px] bg-gradient-to-tl from-[#2F7BF5]/60 to-transparent" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-[300px] w-[520px] -rotate-[28deg] bg-gradient-to-r from-[#1E40AF]/50 to-transparent" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 flex w-full flex-col px-14 py-14 xl:px-16"
        >
          <ImperTechLogo tom="escuro" tamanho="h-16 w-16" textoClassName="text-5xl" />

          <div className="my-auto max-w-xl pt-10">
            <span className="mb-8 block h-1 w-16 rounded-full bg-[#2F8BF5]" />
            <h1 className="text-5xl font-extrabold leading-[1.08] tracking-tight text-white xl:text-[64px]">
              Sua revenda
              <br />
              <span className="text-[#2F8BF5]">de sistemas,</span>
              <br />
              organizada.
            </h1>
            <p className="mt-6 max-w-md text-lg leading-relaxed text-blue-100/80 xl:text-xl">
              Clientes, licenças, contratos e cobranças em um só painel, com aviso antes de cada vencimento.
            </p>

            <div className="mt-14 grid max-w-lg grid-cols-4 gap-4">
              {DESTAQUES.map((d) => (
                <div key={d.texto[0]} className="flex flex-col items-center text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] backdrop-blur-sm">
                    <d.icone className="h-7 w-7 text-[#5BB8F9]" />
                  </span>
                  <span className="mt-3 text-sm leading-tight text-blue-50/90">
                    {d.texto[0]}
                    <br />
                    {d.texto[1]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Lado direito - formulário */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden p-6 sm:p-10">
        <AlternarTema className="absolute right-4 top-4 z-10" />
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rotate-45 rounded-[40px] bg-gradient-to-bl from-primary/10 to-transparent" />
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="relative w-full max-w-[600px]"
        >
          <div className="mb-8 flex justify-center lg:hidden">
            <ImperTechLogo tamanho="h-12 w-12" textoClassName="text-4xl" />
          </div>

          <div className="rounded-3xl border border-border/60 bg-card/95 p-8 shadow-[0_24px_60px_-20px_rgba(15,27,61,0.18)] sm:p-11">
            <Tabs defaultValue="login" className="w-full">
              {/* A aba de cadastro só aparece quando VITE_ENABLE_PUBLIC_SIGNUP="true".
                  Em produção os acessos são criados por um admin na tela de Usuários. */}
              {PUBLIC_SIGNUP_ENABLED && (
                <TabsList className="mb-8 grid w-full grid-cols-2">
                  <TabsTrigger value="login">Entrar</TabsTrigger>
                  <TabsTrigger value="register">Criar conta</TabsTrigger>
                </TabsList>
              )}

              <TabsContent value="login" className="mt-0">
                <span className="mb-7 block h-1 w-16 rounded-full bg-primary" />
                <h2 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-[38px]">Bem-vindo de volta!</h2>
                <p className="mt-2 text-lg text-muted-foreground">Acesse o painel da sua revenda ImperTech.</p>

                <form onSubmit={handleLogin} className="mt-9 space-y-6">
                  <CampoLogin id="login-email" rotulo="Email" icone={Mail}>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="email"
                      placeholder="seu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      className={classeInput}
                      required
                    />
                  </CampoLogin>
                  <CampoLogin id="login-password" rotulo="Senha" icone={Lock}>
                    <Input
                      id="login-password"
                      type={showLoginPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Digite sua senha"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className={`${classeInput} pr-12`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      title={showLoginPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {showLoginPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </CampoLogin>

                  {bloqueio.bloqueado && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                      Muitas tentativas. Tente de novo em {bloqueio.segundosRestantes}s.
                    </p>
                  )}

                  <Button type="submit" className={botaoPrimario} disabled={loading || bloqueio.bloqueado}>
                    {loading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <LogIn className="mr-1 h-5 w-5" />
                        Entrar
                        <ArrowRight className="ml-2 h-5 w-5" />
                      </>
                    )}
                  </Button>
                </form>

                <div className="mt-10 flex items-center gap-4 text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[15px]">Precisa de ajuda?</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <button
                  type="button"
                  onClick={falarComSuporte}
                  className="mx-auto mt-4 flex items-center gap-2 text-[17px] font-semibold text-primary hover:underline"
                >
                  <Headphones className="h-6 w-6" /> Fale com o suporte
                </button>
              </TabsContent>

              {PUBLIC_SIGNUP_ENABLED && (
                <TabsContent value="register" className="mt-0">
                  <span className="mb-7 block h-1 w-16 rounded-full bg-primary" />
                  <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Criar conta</h2>
                  <p className="mt-2 text-lg text-muted-foreground">Preencha os dados abaixo para criar sua conta.</p>
                  <form onSubmit={handleRegister} className="mt-8 space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="register-name" className="text-[15px] font-semibold text-foreground">
                        Nome
                      </Label>
                      <Input
                        id="register-name"
                        type="text"
                        placeholder="Seu nome"
                        value={registerName}
                        onChange={(e) => setRegisterName(e.target.value)}
                        className={`${classeInput} pl-4`}
                        required
                      />
                    </div>
                    <CampoLogin id="register-email" rotulo="Email" icone={Mail}>
                      <Input
                        id="register-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={registerEmail}
                        onChange={(e) => setRegisterEmail(e.target.value)}
                        className={classeInput}
                        required
                      />
                    </CampoLogin>
                    <CampoLogin id="register-password" rotulo="Senha" icone={Lock}>
                      <Input
                        id="register-password"
                        type={showRegisterPassword ? 'text' : 'password'}
                        placeholder="Mínimo de 6 caracteres"
                        value={registerPassword}
                        onChange={(e) => setRegisterPassword(e.target.value)}
                        className={`${classeInput} pr-12`}
                        minLength={6}
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showRegisterPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </CampoLogin>
                    <Button type="submit" className={botaoPrimario} disabled={loading}>
                      {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <>
                          Criar conta
                          <ArrowRight className="ml-2 h-5 w-5" />
                        </>
                      )}
                    </Button>
                  </form>
                </TabsContent>
              )}
            </Tabs>
          </div>

          <p className="mt-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <ShieldHalf className="h-5 w-5" /> Conexão segura · seus dados protegidos
          </p>
        </motion.div>
      </div>
    </div>
  );
}
