import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Forum as ForumIcone,
  Plus,
  Search,
  Trash2,
  Fixar,
  Paperclip,
  Download,
  Loader2,
  Send,
  ChevronLeft,
  Documentos,
  FileText,
  GitBranch,
  CheckCircle,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditorTexto } from '@/components/forum/EditorTexto';
import { QuadroCanvas, type CanvasDados } from '@/components/forum/QuadroCanvas';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  enviarArquivoForum,
  urlAssinada,
  prepararHtmlParaEdicao,
  limparHtmlParaSalvar,
  formatarTamanho,
  type Anexo,
} from '@/lib/forumArquivos';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Post {
  id: string;
  empresa_id: string;
  autor_id: string | null;
  titulo: string;
  categoria: string;
  status: string;
  tags: string[];
  conteudo_html: string;
  canvas: CanvasDados;
  anexos: Anexo[];
  fixado: boolean;
  created_at: string;
  updated_at: string;
}

interface Comentario {
  id: string;
  autor_id: string | null;
  texto: string;
  created_at: string;
}

const CATEGORIAS = [
  { valor: 'problema', rotulo: 'Problema', cor: 'bg-red-50 text-red-600' },
  { valor: 'solucao', rotulo: 'Solução', cor: 'bg-emerald-50 text-emerald-700' },
  { valor: 'procedimento', rotulo: 'Procedimento', cor: 'bg-blue-50 text-blue-700' },
  { valor: 'documentacao', rotulo: 'Documentação', cor: 'bg-slate-100 text-slate-600' },
  { valor: 'ideia', rotulo: 'Ideia', cor: 'bg-violet-50 text-violet-600' },
];
const STATUS = [
  { valor: 'aberto', rotulo: 'Aberto', cor: 'bg-amber-50 text-amber-700' },
  { valor: 'em_analise', rotulo: 'Em análise', cor: 'bg-blue-50 text-blue-700' },
  { valor: 'resolvido', rotulo: 'Resolvido', cor: 'bg-emerald-50 text-emerald-700' },
];
const cat = (v: string) => CATEGORIAS.find((c) => c.valor === v) || CATEGORIAS[0];
const sts = (v: string) => STATUS.find((s) => s.valor === v) || STATUS[0];
const textoPuro = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Fórum interno: registro dos problemas do sistema e de como foram
 * resolvidos. Cada registro tem texto rico (com fotos coladas), um quadro
 * estilo Canvas do Obsidian para o fluxo, anexos e comentários. Salva sozinho.
 */
export default function Forum() {
  const { profile, isAdmin } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [tabelaOk, setTabelaOk] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [aberto, setAberto] = useState<Post | null>(null);
  const [htmlEditor, setHtmlEditor] = useState('');
  const [aba, setAba] = useState('texto');
  const [salvando, setSalvando] = useState<'salvo' | 'pendente' | 'salvando'>('salvo');
  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const [usuarios, setUsuarios] = useState<Record<string, string>>({});
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [novoComentario, setNovoComentario] = useState('');
  const [novaTag, setNovaTag] = useState('');
  const pendente = useRef<Partial<Post>>({});
  const temporizador = useRef<ReturnType<typeof setTimeout>>();
  const entradaAnexo = useRef<HTMLInputElement>(null);

  const carregarPosts = useCallback(async () => {
    const { data, error } = await supabase
      .from('forum_posts')
      .select('*')
      .order('fixado', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(500);
    if (error) setTabelaOk(false);
    else setPosts((data || []) as unknown as Post[]);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregarPosts();
    supabase
      .from('usuario_perfil')
      .select('id, nome, email')
      .then(({ data }) => setUsuarios(Object.fromEntries((data || []).map((u) => [u.id, u.nome || u.email || 'Usuário']))));
  }, [carregarPosts]);

  // Salvamento automático: junta as mudanças e grava 1,2s depois da última.
  const gravar = useCallback(async () => {
    if (!aberto || Object.keys(pendente.current).length === 0) return;
    const campos = { ...pendente.current };
    pendente.current = {};
    setSalvando('salvando');
    const agora = new Date().toISOString();
    const { error } = await supabase
      .from('forum_posts')
      .update({ ...campos, updated_at: agora } as never)
      .eq('id', aberto.id);
    if (error) {
      toast.error('Não foi possível salvar', { description: error.message });
      pendente.current = { ...campos, ...pendente.current };
      setSalvando('pendente');
      return;
    }
    setPosts((ps) => ps.map((p) => (p.id === aberto.id ? { ...p, ...campos, updated_at: agora } : p)));
    setSalvando(Object.keys(pendente.current).length ? 'pendente' : 'salvo');
  }, [aberto]);

  const alterar = useCallback(
    (campos: Partial<Post>, imediato = false) => {
      if (!aberto) return;
      setAberto((a) => (a ? { ...a, ...campos } : a));
      pendente.current = { ...pendente.current, ...campos };
      setSalvando('pendente');
      clearTimeout(temporizador.current);
      temporizador.current = setTimeout(gravar, imediato ? 0 : 1200);
    },
    [aberto, gravar]
  );

  // Ao trocar de post (ou sair), grava o que estiver pendente.
  useEffect(() => () => clearTimeout(temporizador.current), []);

  const abrir = async (post: Post) => {
    if (Object.keys(pendente.current).length) await gravar();
    setAberto(post);
    setAba('texto');
    setHtmlEditor(await prepararHtmlParaEdicao(post.conteudo_html || ''));
    setSalvando('salvo');
    const { data } = await supabase.from('forum_comentarios').select('id, autor_id, texto, created_at').eq('post_id', post.id).order('created_at');
    setComentarios(data || []);
  };

  const novoPost = async () => {
    const { data, error } = await supabase
      .from('forum_posts')
      .insert({ titulo: 'Novo registro', autor_id: profile?.id ?? null })
      .select('*')
      .single();
    if (error || !data) {
      toast.error('Não foi possível criar', { description: error?.message });
      return;
    }
    const post = data as unknown as Post;
    setPosts((ps) => [post, ...ps]);
    abrir(post);
  };

  const excluirPost = async () => {
    if (!aberto || !confirm(`Excluir "${aberto.titulo}"? Isso não pode ser desfeito.`)) return;
    const { error } = await supabase.from('forum_posts').delete().eq('id', aberto.id);
    if (error) {
      toast.error('Não foi possível excluir', { description: error.message });
      return;
    }
    // Remove os arquivos da pasta do post.
    const { data: arquivos } = await supabase.storage.from('forum').list(`${aberto.empresa_id}/${aberto.id}`);
    if (arquivos?.length) await supabase.storage.from('forum').remove(arquivos.map((a) => `${aberto.empresa_id}/${aberto.id}/${a.name}`));
    pendente.current = {};
    setPosts((ps) => ps.filter((p) => p.id !== aberto.id));
    setAberto(null);
    toast.success('Registro excluído');
  };

  const enviarImagem = async (arquivo: File) => {
    if (!aberto) throw new Error('Nenhum registro aberto');
    setEnviandoArquivo(true);
    try {
      const anexo = await enviarArquivoForum(arquivo, aberto.empresa_id, aberto.id);
      const url = await urlAssinada(anexo.path);
      return { url: url || '', path: anexo.path };
    } finally {
      setEnviandoArquivo(false);
    }
  };

  const anexar = async (arquivos: File[]) => {
    if (!aberto || !arquivos.length) return;
    setEnviandoArquivo(true);
    const novos: Anexo[] = [];
    for (const arq of arquivos) {
      try {
        novos.push(await enviarArquivoForum(arq, aberto.empresa_id, aberto.id));
      } catch (e) {
        toast.error(`Não foi possível anexar ${arq.name}`, { description: e instanceof Error ? e.message : String(e) });
      }
    }
    setEnviandoArquivo(false);
    if (novos.length) {
      alterar({ anexos: [...(aberto.anexos || []), ...novos] }, true);
      toast.success(`${novos.length} arquivo(s) anexado(s)`);
    }
  };

  const baixar = async (a: Anexo) => {
    const url = await urlAssinada(a.path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const removerAnexo = async (a: Anexo) => {
    if (!aberto || !confirm(`Remover o anexo "${a.nome}"?`)) return;
    await supabase.storage.from('forum').remove([a.path]);
    alterar({ anexos: (aberto.anexos || []).filter((x) => x.path !== a.path) }, true);
  };

  const comentar = async () => {
    if (!aberto || !novoComentario.trim()) return;
    const { data, error } = await supabase
      .from('forum_comentarios')
      .insert({ post_id: aberto.id, autor_id: profile?.id ?? null, texto: novoComentario.trim() })
      .select('id, autor_id, texto, created_at')
      .single();
    if (error || !data) {
      toast.error('Comentário não enviado', { description: error?.message });
      return;
    }
    setComentarios((c) => [...c, data]);
    setNovoComentario('');
  };

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return posts.filter((p) => {
      const casaBusca =
        !termo || p.titulo.toLowerCase().includes(termo) || p.tags.some((t) => t.toLowerCase().includes(termo)) || textoPuro(p.conteudo_html).toLowerCase().includes(termo);
      return casaBusca && (filtroCategoria === 'todas' || p.categoria === filtroCategoria) && (filtroStatus === 'todos' || p.status === filtroStatus);
    });
  }, [posts, busca, filtroCategoria, filtroStatus]);

  if (!tabelaOk) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10 text-center">
        <ForumIcone className="mx-auto h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold">Fórum</h1>
        <p className="text-muted-foreground">
          O fórum ainda não está ativo no banco. Rode no SQL Editor do Supabase o arquivo{' '}
          <code className="rounded bg-muted px-1">supabase/migrations/20261005150000_forum.sql</code> e recarregue esta página.
        </p>
      </div>
    );
  }

  const podeExcluir = aberto && (isAdmin || aberto.autor_id === profile?.id);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ForumIcone className="h-7 w-7 text-primary" /> Fórum
          </h1>
          <p className="text-sm text-muted-foreground">Problemas do sistema, como foram resolvidos e o passo a passo — com texto, fotos, fluxos e documentos</p>
        </div>
        <Button className="gap-2" onClick={novoPost}>
          <Plus className="h-4 w-4" /> Novo registro
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* Lista */}
        <section className={cn('flex flex-col rounded-2xl border border-border/70 bg-card xl:max-h-[calc(100vh-200px)]', aberto && 'hidden xl:flex')}>
          <div className="space-y-2 border-b border-border/60 p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar título, texto ou #tag..." className="pl-9" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas categorias</SelectItem>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.valor} value={c.valor}>
                      {c.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtroStatus} onValueChange={setFiltroStatus}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos status</SelectItem>
                  {STATUS.map((s) => (
                    <SelectItem key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="min-h-[200px] flex-1 overflow-y-auto">
            {carregando ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : filtrados.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                <ForumIcone className="mx-auto mb-2 h-8 w-8 opacity-40" />
                {posts.length ? 'Nada encontrado com esses filtros.' : 'Nenhum registro ainda. Clique em "Novo registro".'}
              </div>
            ) : (
              filtrados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => abrir(p)}
                  className={cn('block w-full border-b border-border/50 px-3 py-3 text-left transition hover:bg-muted/50', aberto?.id === p.id && 'bg-primary/5')}
                >
                  <span className="flex items-center gap-1.5">
                    {p.fixado && <Fixar className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                    <span className="truncate text-sm font-semibold text-foreground">{p.titulo}</span>
                  </span>
                  <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">{textoPuro(p.conteudo_html) || 'Sem texto ainda'}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-1">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', cat(p.categoria).cor)}>{cat(p.categoria).rotulo}</span>
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', sts(p.status).cor)}>{sts(p.status).rotulo}</span>
                    {(p.canvas?.nodes?.length ?? 0) > 0 && <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />}
                    {(p.anexos?.length ?? 0) > 0 && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className="ml-auto text-[10px] text-muted-foreground">{format(parseISO(p.updated_at), 'dd/MM/yy')}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </section>

        {/* Registro aberto */}
        <section className={cn('min-w-0', !aberto && 'hidden xl:block')}>
          {!aberto ? (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed text-center text-muted-foreground">
              <ForumIcone className="h-12 w-12 opacity-30" />
              <p className="text-sm">Escolha um registro ou crie um novo</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-card p-4">
                <div className="flex items-start gap-2">
                  <button type="button" onClick={() => setAberto(null)} className="mt-1 rounded-md p-1 hover:bg-muted xl:hidden" title="Voltar">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <input
                    value={aberto.titulo}
                    onChange={(e) => alterar({ titulo: e.target.value })}
                    onBlur={(e) => !e.target.value.trim() && alterar({ titulo: 'Sem título' }, true)}
                    className="min-w-0 flex-1 bg-transparent text-xl font-bold text-foreground outline-none"
                    placeholder="Título do registro"
                  />
                  <span className="mt-1.5 shrink-0 text-[11px] text-muted-foreground">
                    {salvando === 'salvando' ? 'Salvando...' : salvando === 'pendente' ? 'Alterações não salvas' : 'Salvo'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Select value={aberto.categoria} onValueChange={(v) => alterar({ categoria: v }, true)}>
                    <SelectTrigger className="h-8 w-[150px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIAS.map((c) => (
                        <SelectItem key={c.valor} value={c.valor}>
                          {c.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={aberto.status} onValueChange={(v) => alterar({ status: v }, true)}>
                    <SelectTrigger className="h-8 w-[130px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS.map((s) => (
                        <SelectItem key={s.valor} value={s.valor}>
                          {s.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {aberto.tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      #{t}
                      <button type="button" className="opacity-60 hover:opacity-100" onClick={() => alterar({ tags: aberto.tags.filter((x) => x !== t) }, true)} title="Remover tag">
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    value={novaTag}
                    onChange={(e) => setNovaTag(e.target.value.replace(/[#\s,]/g, ''))}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && novaTag.trim()) {
                        e.preventDefault();
                        if (!aberto.tags.includes(novaTag.trim())) alterar({ tags: [...aberto.tags, novaTag.trim().toLowerCase()] }, true);
                        setNovaTag('');
                      }
                    }}
                    placeholder="+ tag (Enter)"
                    className="h-7 w-28 rounded-full border border-dashed bg-transparent px-2 text-xs outline-none focus:border-primary"
                  />
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn('gap-1.5', aberto.fixado && 'text-amber-600')}
                      onClick={() => alterar({ fixado: !aberto.fixado }, true)}
                      title="Fixar no topo da lista"
                    >
                      <Fixar className="h-4 w-4" /> {aberto.fixado ? 'Fixado' : 'Fixar'}
                    </Button>
                    {aberto.status !== 'resolvido' && (
                      <Button variant="ghost" size="sm" className="gap-1.5 text-emerald-600" onClick={() => alterar({ status: 'resolvido' }, true)}>
                        <CheckCircle className="h-4 w-4" /> Resolvido
                      </Button>
                    )}
                    {podeExcluir && (
                      <Button variant="ghost" size="sm" className="gap-1.5 text-destructive" onClick={excluirPost}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Criado por {aberto.autor_id ? usuarios[aberto.autor_id] || 'usuário' : 'usuário'} em{' '}
                  {format(parseISO(aberto.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })} · atualizado {format(parseISO(aberto.updated_at), "dd/MM 'às' HH:mm")}
                </p>
              </div>

              <Tabs value={aba} onValueChange={setAba}>
                <TabsList>
                  <TabsTrigger value="texto" className="gap-1.5">
                    <FileText className="h-4 w-4" /> Texto
                  </TabsTrigger>
                  <TabsTrigger value="fluxo" className="gap-1.5">
                    <GitBranch className="h-4 w-4" /> Fluxo
                  </TabsTrigger>
                  <TabsTrigger value="anexos" className="gap-1.5">
                    <Documentos className="h-4 w-4" /> Anexos ({aberto.anexos?.length ?? 0})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="texto" className="mt-3">
                  <EditorTexto
                    html={htmlEditor}
                    enviando={enviandoArquivo}
                    enviarImagem={enviarImagem}
                    onChange={(h) => {
                      setHtmlEditor(h);
                      alterar({ conteudo_html: limparHtmlParaSalvar(h) });
                    }}
                  />
                </TabsContent>

                <TabsContent value="fluxo" className="mt-3">
                  <QuadroCanvas
                    key={aberto.id}
                    valor={aberto.canvas || { nodes: [], edges: [] }}
                    enviarImagem={enviarImagem}
                    onChange={(canvas) => alterar({ canvas })}
                  />
                </TabsContent>

                <TabsContent value="anexos" className="mt-3">
                  <div
                    className="rounded-xl border-2 border-dashed border-border/80 bg-card p-6 text-center"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      anexar(Array.from(e.dataTransfer.files || []));
                    }}
                  >
                    <Documentos className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">Arraste documentos aqui (PDF, Word, Excel, imagens, ZIP — até 20 MB)</p>
                    <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => entradaAnexo.current?.click()} disabled={enviandoArquivo}>
                      {enviandoArquivo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />} Escolher arquivos
                    </Button>
                    <input
                      ref={entradaAnexo}
                      type="file"
                      multiple
                      hidden
                      onChange={(e) => {
                        anexar(Array.from(e.target.files || []));
                        e.target.value = '';
                      }}
                    />
                  </div>
                  <ul className="mt-3 space-y-2">
                    {(aberto.anexos || []).map((a) => (
                      <li key={a.path} className="flex items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2">
                        <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1 truncate text-sm">{a.nome}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatarTamanho(a.tamanho)}</span>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => baixar(a)} title="Abrir / baixar">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removerAnexo(a)} title="Remover">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                </TabsContent>
              </Tabs>

              {/* Comentários */}
              <div className="rounded-2xl border border-border/70 bg-card p-4">
                <p className="mb-3 text-sm font-semibold">Comentários ({comentarios.length})</p>
                <div className="space-y-3">
                  {comentarios.map((c) => (
                    <div key={c.id} className="flex gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {(usuarios[c.autor_id || ''] || '?')[0]?.toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs">
                          <span className="font-semibold">{usuarios[c.autor_id || ''] || 'Usuário'}</span>{' '}
                          <span className="text-muted-foreground">{format(parseISO(c.created_at), "dd/MM 'às' HH:mm")}</span>
                        </p>
                        <p className="whitespace-pre-wrap text-sm">{c.texto}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-end gap-2">
                  <Textarea
                    value={novoComentario}
                    onChange={(e) => setNovoComentario(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        comentar();
                      }
                    }}
                    rows={2}
                    placeholder="Comentar (Ctrl+Enter envia)..."
                    className="min-h-[44px] resize-none"
                  />
                  <Button onClick={comentar} disabled={!novoComentario.trim()} className="h-11 gap-2">
                    <Send className="h-4 w-4" /> Enviar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
