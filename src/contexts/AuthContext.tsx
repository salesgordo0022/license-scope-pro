import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { avaliarSenha, limparTentativas, registrarFalha } from '@/lib/authPolicy';

type UserRole = Database['public']['Enums']['user_role'];

interface UserProfile {
  id: string;
  user_id: string;
  empresa_id: string | null;
  nome: string | null;
  email: string | null;
  tipo: UserRole;
  created_at: string;
}

/**
 * Nível de garantia da sessão (Authenticator Assurance Level, do Supabase).
 *
 * - `aal1`: autenticado só com e-mail e senha.
 * - `aal2`: passou também pelo segundo fator (TOTP).
 *
 * `precisaMfa` é o caso que interessa: o usuário TEM um fator cadastrado mas a
 * sessão atual ainda está em aal1 — ou seja, a senha foi aceita e o código de
 * 6 dígitos ainda não. Enquanto estiver assim, a sessão não deve ser tratada
 * como um login completo.
 */
export interface EstadoMfa {
  nivelAtual: string | null;
  nivelNecessario: string | null;
  precisaMfa: boolean;
  temFatorAtivo: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, nome: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  /** Estado do segundo fator para a sessão atual. */
  mfa: EstadoMfa;
  /** Recalcula o estado de MFA — chamar após concluir um desafio ou cadastrar um fator. */
  atualizarMfa: () => Promise<EstadoMfa>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Auto-cadastro público na tela de login.
 *
 * Fica desligado por padrão. Este é um CRM B2B privado: os usuários são criados
 * por um admin pela tela de Usuários (Edge Function `create-user`), que já
 * vincula o novo usuário à empresa correta. Com o cadastro aberto, qualquer
 * pessoa que descobrisse a URL criava uma conta autenticada e passava a ver
 * tudo que as policies liberam para "authenticated" — sistemas, planos,
 * módulos e, até a correção do bucket, os contratos assinados de todo mundo.
 *
 * Para reabrir, defina VITE_ENABLE_PUBLIC_SIGNUP="true" no .env.
 */
export const PUBLIC_SIGNUP_ENABLED =
  import.meta.env.VITE_ENABLE_PUBLIC_SIGNUP === 'true';

/**
 * Provedor de autenticação da aplicação.
 *
 * Mantém sessão, usuário e perfil (`usuario_perfil`) sincronizados com o
 * Supabase Auth e expõe os helpers de login/cadastro/logout para as telas.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mfa, setMfa] = useState<EstadoMfa>({
    nivelAtual: null,
    nivelNecessario: null,
    precisaMfa: false,
    temFatorAtivo: false,
  });

  /**
   * Consulta no Supabase o nível de garantia da sessão atual.
   *
   * `nivelNecessario` vem como 'aal2' quando o usuário tem um fator TOTP
   * confirmado. Se o nível atual ainda for 'aal1', falta digitar o código.
   * Qualquer erro aqui é tratado como "sem MFA" de propósito: um problema de
   * rede não pode trancar o usuário para fora do próprio sistema.
   */
  const atualizarMfa = async (): Promise<EstadoMfa> => {
    try {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error || !data) throw error ?? new Error('sem dados de AAL');

      const estado: EstadoMfa = {
        nivelAtual: data.currentLevel,
        nivelNecessario: data.nextLevel,
        precisaMfa: data.nextLevel === 'aal2' && data.currentLevel === 'aal1',
        temFatorAtivo: data.nextLevel === 'aal2',
      };
      setMfa(estado);
      return estado;
    } catch {
      const vazio: EstadoMfa = {
        nivelAtual: null, nivelNecessario: null, precisaMfa: false, temFatorAtivo: false,
      };
      setMfa(vazio);
      return vazio;
    }
  };

  /**
   * Carrega o perfil do usuário (empresa e papel) a partir do `user_id`.
   * Devolve `null` quando o perfil ainda não existe ou a leitura falha — quem
   * chama trata isso como "sem permissões".
   */
  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('usuario_perfil')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return null;
      }
      return data as UserProfile | null;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          // Use setTimeout to avoid potential race conditions
          setTimeout(async () => {
            const userProfile = await fetchProfile(session.user.id);
            setProfile(userProfile);
            await atualizarMfa();
            setLoading(false);
          }, 0);
        } else {
          setProfile(null);
          setMfa({ nivelAtual: null, nivelNecessario: null, precisaMfa: false, temFatorAtivo: false });
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchProfile(session.user.id).then(async (userProfile) => {
          setProfile(userProfile);
          await atualizarMfa();
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /**
   * Autentica com e-mail e senha.
   *
   * Conta as tentativas erradas e trava o formulário depois de 5 falhas em 15
   * minutos. Isso é freio, não muralha: o contador vive no `localStorage` e
   * quem fala direto com a API do Supabase não passa por aqui. Serve para
   * encarecer o ataque feito pela própria tela, que é o caminho mais provável.
   * O limite de verdade é o rate limit por IP do Supabase Auth.
   *
   * Depois da senha aceita, o estado de MFA é recalculado: se o usuário tiver
   * um fator TOTP, a sessão fica em `aal1` e a tela pede o código de 6 dígitos
   * antes de liberar o painel.
   */
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      registrarFalha();
      return { error };
    }

    limparTentativas();
    await atualizarMfa();
    return { error: null };
  };

  /**
   * Cria uma conta pelo formulário público de cadastro.
   *
   * O perfil NÃO é criado aqui. Quem cria é o trigger `handle_new_user` no
   * banco, que atribui 'super_admin' ao primeiro usuário do sistema e
   * 'revendedor' a todos os demais.
   *
   * O código anterior inseria o perfil manualmente com `tipo: 'admin'`,
   * comentando "First user becomes admin" — mas a condição de "primeiro" não
   * existia: todo mundo que se cadastrasse pediria admin. Na prática o RLS
   * barrava o insert (a policy exige que quem insere já seja admin), então o
   * efeito visível era só um erro no console; ainda assim, era código tentando
   * escalar privilégio e dependendo do banco para não conseguir.
   */
  const signUp = async (email: string, password: string, nome: string) => {
    if (!PUBLIC_SIGNUP_ENABLED) {
      return { error: new Error('Cadastro público desabilitado. Peça a um administrador para criar seu acesso.') };
    }

    // A senha é validada ANTES de existir. Depois de criada, uma senha fraca
    // só sai por troca — barrar aqui é a única prevenção que funciona.
    const forca = avaliarSenha(password);
    if (!forca.valida) {
      return { error: new Error(forca.problemas.join('. ') + '.') };
    }

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { nome },
      },
    });

    return { error };
  };

  /** Encerra a sessão e limpa o perfil em memória. */
  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setMfa({ nivelAtual: null, nivelNecessario: null, precisaMfa: false, temFatorAtivo: false });
  };

  const isAdmin = profile?.tipo === 'admin' || profile?.tipo === 'super_admin';
  const isSuperAdmin = profile?.tipo === 'super_admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        signIn,
        signUp,
        signOut,
        isAdmin,
        isSuperAdmin,
        mfa,
        atualizarMfa,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Acessa o contexto de autenticação.
 * Lança erro se usado fora do `AuthProvider`, o que denuncia o bug na hora em
 * vez de devolver `undefined` silenciosamente.
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
