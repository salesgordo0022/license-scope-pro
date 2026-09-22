/**
 * Política de acesso: força de senha e proteção contra tentativa em massa.
 *
 * Tudo aqui roda no NAVEGADOR, então nada disto é barreira de segurança
 * sozinho — quem controla o cliente ignora todas estas regras. A proteção real
 * está no Supabase Auth (rate limit por IP, hash da senha, bloqueio de senhas
 * vazadas) e no RLS do Postgres. O papel deste módulo é:
 *
 *  1. impedir que uma senha fraca seja CRIADA (aí sim vira proteção real, pois
 *     a senha fraca nunca chega a existir);
 *  2. frear o ataque de força bruta feito pela própria tela, que é o caminho
 *     mais barato para o atacante casual.
 */

/** Tamanho mínimo de senha. Alinhado com o que a Edge Function `create-user` exige. */
export const SENHA_TAMANHO_MINIMO = 10;

/**
 * Senhas óbvias demais para permitir, mesmo que passem no tamanho.
 * Lista curta de propósito: a checagem séria contra vazamentos é feita pelo
 * Supabase (Auth > Passwords > "Prevent use of leaked passwords"), que consulta
 * a base do HaveIBeenPwned. Aqui só barramos o que é constrangedor.
 */
const SENHAS_PROIBIDAS = new Set([
  'senha123456', '1234567890', 'password123', 'qwertyuiop',
  'administrador', 'imperial123', 'contabilidade', '0123456789',
]);

export interface ForcaSenha {
  /** `true` quando a senha pode ser aceita. */
  valida: boolean;
  /** 0 a 4 — usado para pintar a barra de força na interface. */
  pontuacao: number;
  /** Lista do que ainda falta, para exibir ao usuário. */
  problemas: string[];
}

/**
 * Avalia uma senha contra a política.
 *
 * Exige tamanho mínimo e ao menos três das quatro categorias (minúscula,
 * maiúscula, dígito, símbolo). Não exijo as quatro de propósito: regras rígidas
 * demais empurram o usuário para o padrão "Senha@2026", que é previsível.
 * Comprimento pesa mais do que variedade de caracteres.
 */
export function avaliarSenha(senha: string): ForcaSenha {
  const problemas: string[] = [];

  if (senha.length < SENHA_TAMANHO_MINIMO) {
    problemas.push(`Use pelo menos ${SENHA_TAMANHO_MINIMO} caracteres`);
  }

  const categorias = [
    /[a-z]/.test(senha),
    /[A-Z]/.test(senha),
    /[0-9]/.test(senha),
    /[^A-Za-z0-9]/.test(senha),
  ].filter(Boolean).length;

  if (categorias < 3) {
    problemas.push('Combine minúsculas, maiúsculas, números e símbolos');
  }

  if (SENHAS_PROIBIDAS.has(senha.toLowerCase())) {
    problemas.push('Essa senha é previsível demais');
  }

  // Sequências repetidas ("aaaa", "1111") não somam entropia de verdade.
  if (/(.)\1{3,}/.test(senha)) {
    problemas.push('Evite repetir o mesmo caractere várias vezes');
  }

  // Pontuação só para o retorno visual: tamanho conta o dobro das categorias.
  const pontos =
    (senha.length >= SENHA_TAMANHO_MINIMO ? 1 : 0) +
    (senha.length >= 14 ? 1 : 0) +
    (categorias >= 3 ? 1 : 0) +
    (categorias === 4 ? 1 : 0);

  return {
    valida: problemas.length === 0,
    pontuacao: problemas.length === 0 ? Math.max(pontos, 1) : 0,
    problemas,
  };
}

// ---------------------------------------------------------------------------
// Freio de tentativas de login
// ---------------------------------------------------------------------------

/** Tentativas erradas antes de travar o formulário. */
const MAX_TENTATIVAS = 5;

/** Quanto tempo o formulário fica travado depois de estourar o limite. */
const BLOQUEIO_MS = 5 * 60 * 1000;

/** Janela em que as tentativas erradas são contadas juntas. */
const JANELA_MS = 15 * 60 * 1000;

const CHAVE = 'auth:tentativas';

interface Registro {
  /** Timestamps das tentativas que falharam. */
  falhas: number[];
  /** Quando o bloqueio expira (0 = sem bloqueio). */
  bloqueadoAte: number;
}

/**
 * Lê o registro de tentativas.
 *
 * `localStorage` pode lançar (janela anônima, cookies bloqueados) ou estar
 * corrompido, e nesse caso o login precisa continuar funcionando — por isso
 * qualquer erro devolve um registro limpo em vez de propagar.
 */
function ler(): Registro {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return { falhas: [], bloqueadoAte: 0 };
    const r = JSON.parse(cru) as Registro;
    return {
      falhas: Array.isArray(r.falhas) ? r.falhas : [],
      bloqueadoAte: typeof r.bloqueadoAte === 'number' ? r.bloqueadoAte : 0,
    };
  } catch {
    return { falhas: [], bloqueadoAte: 0 };
  }
}

/** Grava o registro, ignorando falha de armazenamento. */
function gravar(r: Registro) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(r));
  } catch {
    // sem localStorage o freio simplesmente não persiste entre recargas
  }
}

/**
 * Diz se o formulário de login está travado e por quanto tempo.
 *
 * Deliberadamente NÃO é por e-mail: guardar tentativas por endereço permitiria
 * descobrir quais e-mails existem no sistema comparando o comportamento.
 */
export function estadoBloqueio(): { bloqueado: boolean; segundosRestantes: number; tentativasRestantes: number } {
  const agora = Date.now();
  const r = ler();

  if (r.bloqueadoAte > agora) {
    return {
      bloqueado: true,
      segundosRestantes: Math.ceil((r.bloqueadoAte - agora) / 1000),
      tentativasRestantes: 0,
    };
  }

  const recentes = r.falhas.filter((t) => agora - t < JANELA_MS);
  return {
    bloqueado: false,
    segundosRestantes: 0,
    tentativasRestantes: Math.max(0, MAX_TENTATIVAS - recentes.length),
  };
}

/** Registra uma tentativa que falhou e ativa o bloqueio ao atingir o limite. */
export function registrarFalha(): void {
  const agora = Date.now();
  const r = ler();
  const recentes = r.falhas.filter((t) => agora - t < JANELA_MS);
  recentes.push(agora);

  gravar({
    falhas: recentes,
    bloqueadoAte: recentes.length >= MAX_TENTATIVAS ? agora + BLOQUEIO_MS : 0,
  });
}

/** Zera o contador após um login bem-sucedido. */
export function limparTentativas(): void {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    // nada a fazer
  }
}
