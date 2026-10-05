import { supabase } from '@/integrations/supabase/client';

/**
 * Arquivos do Fórum (fotos do texto, imagens do quadro e anexos).
 *
 * Ficam no bucket privado "forum", na pasta da empresa
 * (<empresa_id>/<post_id>/<arquivo>). O banco guarda só o caminho; para
 * mostrar, a tela pede URLs assinadas (válidas por algumas horas). Assim um
 * print com dado de cliente não fica acessível por link público.
 */
const BUCKET = 'forum';
const VALIDADE_URL = 60 * 60 * 6; // 6 horas
export const TAMANHO_MAXIMO = 20 * 1024 * 1024;

export interface Anexo {
  nome: string;
  path: string;
  tipo: string;
  tamanho: number;
}

/** Envia um arquivo e devolve o caminho no bucket. */
export async function enviarArquivoForum(arquivo: File, empresaId: string, postId: string): Promise<Anexo> {
  if (arquivo.size > TAMANHO_MAXIMO) throw new Error(`"${arquivo.name}" passa de 20 MB`);
  const limpo = arquivo.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .slice(-80);
  const path = `${empresaId}/${postId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${limpo || 'arquivo'}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, arquivo, { contentType: arquivo.type || undefined, upsert: false });
  if (error) throw new Error(error.message.includes('mime') ? `Tipo de arquivo não aceito: ${arquivo.type || arquivo.name}` : error.message);
  return { nome: arquivo.name, path, tipo: arquivo.type, tamanho: arquivo.size };
}

// Cache das URLs assinadas por caminho, para não pedir de novo a cada render.
const cache = new Map<string, { url: string; expira: number }>();

/** URLs assinadas para vários caminhos de uma vez. */
export async function urlsAssinadas(paths: string[]): Promise<Record<string, string>> {
  const agora = Date.now();
  const saida: Record<string, string> = {};
  const faltam = [...new Set(paths.filter(Boolean))].filter((p) => {
    const c = cache.get(p);
    if (c && c.expira > agora) {
      saida[p] = c.url;
      return false;
    }
    return true;
  });
  if (faltam.length) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrls(faltam, VALIDADE_URL);
    for (const item of data || []) {
      if (item.path && item.signedUrl) {
        saida[item.path] = item.signedUrl;
        cache.set(item.path, { url: item.signedUrl, expira: agora + (VALIDADE_URL - 300) * 1000 });
      }
    }
  }
  return saida;
}

export async function urlAssinada(path: string): Promise<string | null> {
  return (await urlsAssinadas([path]))[path] ?? null;
}

/** Antes de abrir no editor: troca o src das imagens do bucket por URLs assinadas novas. */
export async function prepararHtmlParaEdicao(html: string): Promise<string> {
  const paths = [...html.matchAll(/data-path="([^"]+)"/g)].map((m) => m[1]);
  if (!paths.length) return html;
  const urls = await urlsAssinadas(paths);
  return html.replace(/<img([^>]*?)data-path="([^"]+)"([^>]*)>/g, (_m, antes: string, path: string, depois: string) => {
    const semSrc = `${antes} ${depois}`.replace(/\ssrc="[^"]*"/g, '');
    return `<img src="${urls[path] ?? ''}" data-path="${path}"${semSrc.replace(/\s+/g, ' ').replace(/\s$/, '')}>`;
  });
}

/** Antes de salvar: tira o src (URL temporária) das imagens do bucket, guardando só o caminho. */
export function limparHtmlParaSalvar(html: string): string {
  return html.replace(/<img([^>]*?)data-path="([^"]+)"([^>]*)>/g, (_m, antes: string, path: string, depois: string) => {
    const resto = `${antes} ${depois}`.replace(/\ssrc="[^"]*"/g, '').replace(/\s+/g, ' ').trim();
    return `<img data-path="${path}"${resto ? ' ' + resto : ''}>`;
  });
}

export function formatarTamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
