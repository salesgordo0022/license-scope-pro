import { useEffect, useRef } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import {
  Negrito,
  Italico,
  Riscado,
  Titulo,
  ListaPontos,
  ListaNumeros,
  ListaTarefas,
  Citacao,
  Codigo,
  ImagemAdd,
  Desfazer,
  Refazer,
  Marcador,
  LinkIcone,
  Loader2,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/**
 * Imagem que guarda o caminho no bucket (data-path) além do src. O src é uma
 * URL assinada temporária; ao salvar só o caminho fica (ver forumArquivos).
 */
const ImagemDoBucket = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      path: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-path'),
        renderHTML: (attrs) => (attrs.path ? { 'data-path': attrs.path } : {}),
      },
    };
  },
});

interface Props {
  html: string;
  onChange: (html: string) => void;
  /** Envia a imagem e devolve { url para mostrar, caminho no bucket }. */
  enviarImagem: (arquivo: File) => Promise<{ url: string; path: string }>;
  enviando?: boolean;
}

function Botao({ ativo, onClick, titulo, children }: { ativo?: boolean; onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn('flex h-8 w-8 items-center justify-center rounded-md transition hover:bg-muted', ativo && 'bg-primary/10 text-primary')}
    >
      {children}
    </button>
  );
}

/** Editor de texto rico do Fórum: títulos, listas, tarefas, citação, código, link, marca-texto e imagens. */
export function EditorTexto({ html, onChange, enviarImagem, enviando }: Props) {
  const entradaArquivo = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);

  const inserirImagens = async (arquivos: File[]) => {
    const imagens = arquivos.filter((f) => f.type.startsWith('image/'));
    for (const arq of imagens) {
      try {
        const { url, path } = await enviarImagem(arq);
        editorRef.current?.chain().focus().setImage({ src: url, alt: arq.name, path } as never).run();
      } catch (e) {
        toast.error('Não foi possível enviar a imagem', { description: e instanceof Error ? e.message : String(e) });
      }
    }
    return imagens.length > 0;
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      ImagemDoBucket.configure({ inline: false, HTMLAttributes: { class: 'rounded-lg border max-w-full' } }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      Placeholder.configure({ placeholder: 'Descreva o problema, o que foi tentado e como foi resolvido... Cole prints com Ctrl+V.' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight,
    ],
    content: html,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: { class: 'forum-texto min-h-[320px] px-5 py-4 focus:outline-none' },
      handlePaste: (_view, evento) => {
        const arquivos = Array.from(evento.clipboardData?.files || []);
        if (arquivos.some((f) => f.type.startsWith('image/'))) {
          inserirImagens(arquivos);
          return true;
        }
        return false;
      },
      handleDrop: (_view, evento) => {
        const arquivos = Array.from((evento as DragEvent).dataTransfer?.files || []);
        if (arquivos.some((f) => f.type.startsWith('image/'))) {
          evento.preventDefault();
          inserirImagens(arquivos);
          return true;
        }
        return false;
      },
    },
  });
  editorRef.current = editor;

  // Conteúdo trocado de fora (outro post aberto): recarrega no editor.
  useEffect(() => {
    if (editor && html !== editor.getHTML()) editor.commands.setContent(html, false);
  }, [html, editor]);

  if (!editor) return null;

  const definirLink = () => {
    const atual = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Endereço do link (vazio remove):', atual || 'https://');
    if (url === null) return;
    if (!url.trim()) editor.chain().focus().unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  const c = editor.chain().focus();
  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 border-b border-border/60 bg-card/95 px-2 py-1.5 backdrop-blur">
        <Botao titulo="Título" ativo={editor.isActive('heading', { level: 2 })} onClick={() => c.toggleHeading({ level: 2 }).run()}>
          <Titulo className="h-4 w-4" />
        </Botao>
        <Botao titulo="Subtítulo" ativo={editor.isActive('heading', { level: 3 })} onClick={() => c.toggleHeading({ level: 3 }).run()}>
          <span className="text-xs font-bold">H3</span>
        </Botao>
        <span className="mx-1 h-5 w-px bg-border" />
        <Botao titulo="Negrito (Ctrl+B)" ativo={editor.isActive('bold')} onClick={() => c.toggleBold().run()}>
          <Negrito className="h-4 w-4" />
        </Botao>
        <Botao titulo="Itálico (Ctrl+I)" ativo={editor.isActive('italic')} onClick={() => c.toggleItalic().run()}>
          <Italico className="h-4 w-4" />
        </Botao>
        <Botao titulo="Riscado" ativo={editor.isActive('strike')} onClick={() => c.toggleStrike().run()}>
          <Riscado className="h-4 w-4" />
        </Botao>
        <Botao titulo="Marca-texto" ativo={editor.isActive('highlight')} onClick={() => c.toggleHighlight().run()}>
          <Marcador className="h-4 w-4" />
        </Botao>
        <span className="mx-1 h-5 w-px bg-border" />
        <Botao titulo="Lista" ativo={editor.isActive('bulletList')} onClick={() => c.toggleBulletList().run()}>
          <ListaPontos className="h-4 w-4" />
        </Botao>
        <Botao titulo="Lista numerada" ativo={editor.isActive('orderedList')} onClick={() => c.toggleOrderedList().run()}>
          <ListaNumeros className="h-4 w-4" />
        </Botao>
        <Botao titulo="Lista de tarefas" ativo={editor.isActive('taskList')} onClick={() => c.toggleTaskList().run()}>
          <ListaTarefas className="h-4 w-4" />
        </Botao>
        <Botao titulo="Citação" ativo={editor.isActive('blockquote')} onClick={() => c.toggleBlockquote().run()}>
          <Citacao className="h-4 w-4" />
        </Botao>
        <Botao titulo="Bloco de código (erro, log, SQL...)" ativo={editor.isActive('codeBlock')} onClick={() => c.toggleCodeBlock().run()}>
          <Codigo className="h-4 w-4" />
        </Botao>
        <Botao titulo="Link" ativo={editor.isActive('link')} onClick={definirLink}>
          <LinkIcone className="h-4 w-4" />
        </Botao>
        <Botao titulo="Inserir imagem" onClick={() => entradaArquivo.current?.click()}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagemAdd className="h-4 w-4" />}
        </Botao>
        <span className="mx-1 h-5 w-px bg-border" />
        <Botao titulo="Desfazer (Ctrl+Z)" onClick={() => c.undo().run()}>
          <Desfazer className="h-4 w-4" />
        </Botao>
        <Botao titulo="Refazer (Ctrl+Y)" onClick={() => c.redo().run()}>
          <Refazer className="h-4 w-4" />
        </Botao>
        <input
          ref={entradaArquivo}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            inserirImagens(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
