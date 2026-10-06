/**
 * Notificações do sistema operacional (fora do navegador): a caixinha que
 * aparece no canto da tela do Mac/Windows mesmo com o sistema minimizado, em
 * outra aba ou com outro programa em primeiro plano.
 *
 * Usa a Notification API do navegador. Funciona enquanto houver uma aba do
 * sistema aberta (pode estar em segundo plano). Várias abas abertas não
 * duplicam o aviso: a mesma `tag` substitui a notificação anterior, e uma
 * trava curta no localStorage faz só a primeira aba avisar.
 */

const CHAVE_ATIVO = 'impertech-notificacoes-sistema';
const CHAVE_AVISADOS = 'impertech-notificacoes-avisados';

export type PermissaoNotificacao = NotificationPermission | 'indisponivel';

export function suportaNotificacoes(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function permissaoAtual(): PermissaoNotificacao {
  return suportaNotificacoes() ? Notification.permission : 'indisponivel';
}

/** Preferência do usuário neste navegador (padrão: ligado, se já houver permissão). */
export function notificacoesLigadas(): boolean {
  try {
    return localStorage.getItem(CHAVE_ATIVO) !== 'nao';
  } catch {
    return true;
  }
}

export function definirNotificacoesLigadas(ligado: boolean) {
  try {
    localStorage.setItem(CHAVE_ATIVO, ligado ? 'sim' : 'nao');
  } catch {
    /* navegador sem storage: segue sem lembrar */
  }
}

export async function pedirPermissao(): Promise<PermissaoNotificacao> {
  if (!suportaNotificacoes()) return 'indisponivel';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
}

/** Trava entre abas: devolve true só para a primeira aba que pedir esta chave. */
function primeiraAba(chave: string, validadeMs: number): boolean {
  try {
    const agora = Date.now();
    const mapa: Record<string, number> = JSON.parse(localStorage.getItem(CHAVE_AVISADOS) || '{}');
    for (const k of Object.keys(mapa)) if (mapa[k] < agora) delete mapa[k];
    if (mapa[chave]) return false;
    mapa[chave] = agora + validadeMs;
    localStorage.setItem(CHAVE_AVISADOS, JSON.stringify(mapa));
    return true;
  } catch {
    return true;
  }
}

export interface Aviso {
  titulo: string;
  corpo?: string;
  /** Identifica o aviso: avisos com a mesma tag não se repetem nem se acumulam. */
  tag: string;
  /** Rota do sistema aberta ao clicar (ex.: "/chamados?abrir=<id>"). */
  url?: string;
  /** Por quanto tempo a mesma tag não é avisada de novo (padrão 1 min). */
  naoRepetirPorMs?: number;
  /** Mantém na tela até o usuário fechar (avisos importantes). */
  fixo?: boolean;
}

/**
 * Mostra o aviso no sistema operacional. Devolve false quando não deu
 * (sem permissão, desligado pelo usuário ou já avisado por outra aba) — aí
 * quem chamou pode mostrar um toast dentro do sistema.
 */
export function avisarNoSistema(aviso: Aviso, navegar?: (url: string) => void): boolean {
  if (!suportaNotificacoes() || Notification.permission !== 'granted' || !notificacoesLigadas()) return false;
  if (!primeiraAba(aviso.tag, aviso.naoRepetirPorMs ?? 60_000)) return true;
  try {
    const n = new Notification(aviso.titulo, {
      body: aviso.corpo?.slice(0, 240),
      tag: aviso.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      requireInteraction: aviso.fixo ?? false,
    });
    n.onclick = () => {
      window.focus();
      if (aviso.url) {
        if (navegar) navegar(aviso.url);
        else window.location.assign(aviso.url);
      }
      n.close();
    };
    return true;
  } catch {
    // Alguns navegadores (Android) só aceitam notificação via service worker.
    return false;
  }
}

/** A aba está na frente do usuário? (se sim, um toast basta). */
export function abaEmFoco(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
}
