import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  NodeResizer,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTheme } from 'next-themes';
import { Nota, Galeria, Trash2, AjustarTela, Loader2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { urlsAssinadas } from '@/lib/forumArquivos';
import { toast } from 'sonner';

/**
 * Quadro estilo Canvas do Obsidian para desenhar o fluxo de um problema:
 * cartões de nota (texto, com cor), cartões de imagem e setas com legenda.
 * O estado é um JSON { nodes, edges } salvo no post (coluna canvas).
 */
export interface CanvasDados {
  nodes: Node[];
  edges: Edge[];
}

// Cores dos cartões (as do Obsidian Canvas, adaptadas ao sistema).
const CORES: Record<string, { borda: string; fundo: string; rotulo: string }> = {
  padrao: { borda: '#94A3B8', fundo: 'transparent', rotulo: 'Sem cor' },
  vermelho: { borda: '#EF4444', fundo: 'rgba(239,68,68,0.10)', rotulo: 'Problema' },
  laranja: { borda: '#F59E0B', fundo: 'rgba(245,158,11,0.10)', rotulo: 'Atenção' },
  azul: { borda: '#2F8BF5', fundo: 'rgba(47,139,245,0.10)', rotulo: 'Análise' },
  roxo: { borda: '#8B5CF6', fundo: 'rgba(139,92,246,0.10)', rotulo: 'Ideia' },
  verde: { borda: '#10B981', fundo: 'rgba(16,185,129,0.12)', rotulo: 'Solução' },
};

type DadosNota = { texto: string; cor: string; onTexto?: (id: string, t: string) => void };
type DadosImagem = { path: string; url?: string; nome?: string; cor: string };

const NoNota = memo(({ id, data, selected }: NodeProps<Node<DadosNota>>) => {
  const cor = CORES[data.cor] ?? CORES.padrao;
  return (
    <div className="h-full w-full rounded-xl border-2 bg-card text-card-foreground shadow-sm" style={{ borderColor: cor.borda, background: `linear-gradient(${cor.fundo}, ${cor.fundo}), hsl(var(--card))` }}>
      <NodeResizer isVisible={selected} minWidth={160} minHeight={80} color={cor.borda} />
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} id="l" />
      <textarea
        className="nodrag nowheel h-full w-full resize-none bg-transparent p-3 text-sm leading-snug outline-none"
        value={data.texto}
        placeholder="Escreva aqui..."
        onChange={(e) => data.onTexto?.(id, e.target.value)}
      />
      <Handle type="source" position={Position.Bottom} />
      <Handle type="source" position={Position.Right} id="r" />
    </div>
  );
});
NoNota.displayName = 'NoNota';

const NoImagem = memo(({ data, selected }: NodeProps<Node<DadosImagem>>) => {
  const cor = CORES[data.cor] ?? CORES.padrao;
  return (
    <div className="h-full w-full overflow-hidden rounded-xl border-2 bg-card shadow-sm" style={{ borderColor: cor.borda }}>
      <NodeResizer isVisible={selected} minWidth={120} minHeight={80} keepAspectRatio color={cor.borda} />
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} id="l" />
      {data.url ? (
        <img src={data.url} alt={data.nome || 'imagem'} className="pointer-events-none h-full w-full object-contain" draggable={false} />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          <Loader2 className="mr-1 h-4 w-4 animate-spin" /> carregando
        </div>
      )}
      <Handle type="source" position={Position.Bottom} />
      <Handle type="source" position={Position.Right} id="r" />
    </div>
  );
});
NoImagem.displayName = 'NoImagem';

const tiposNo = { nota: NoNota, imagem: NoImagem };

const arestaPadrao = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
  style: { strokeWidth: 2 },
  labelBgPadding: [6, 3] as [number, number],
  labelBgBorderRadius: 6,
};

interface Props {
  valor: CanvasDados;
  onChange: (v: CanvasDados) => void;
  enviarImagem: (arquivo: File) => Promise<{ url: string; path: string }>;
}

function Quadro({ valor, onChange, enviarImagem }: Props) {
  const { resolvedTheme } = useTheme();
  const rf = useReactFlow();
  const entradaArquivo = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const carregado = useRef(false);

  // Texto digitado num cartão.
  const onTexto = useCallback((id: string, texto: string) => {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, texto } } : n)));
  }, []);

  // Carrega o JSON salvo e gera URLs assinadas das imagens.
  useEffect(() => {
    carregado.current = false;
    const ns = (valor.nodes || []).map((n) => ({ ...n, data: { ...n.data, onTexto } }));
    setNodes(ns);
    setEdges((valor.edges || []).map((e) => ({ ...arestaPadrao, ...e })));
    const paths = ns.filter((n) => n.type === 'imagem').map((n) => (n.data as unknown as DadosImagem).path);
    if (paths.length) {
      urlsAssinadas(paths).then((urls) =>
        setNodes((atual) => atual.map((n) => (n.type === 'imagem' ? { ...n, data: { ...n.data, url: urls[(n.data as unknown as DadosImagem).path] } } : n)))
      );
    }
    setTimeout(() => {
      carregado.current = true;
      rf.fitView({ padding: 0.2, duration: 200 });
    }, 50);
    // Recarrega só quando outro post é aberto (o pai troca a key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Avisa o pai das mudanças, sem as funções e URLs temporárias.
  useEffect(() => {
    if (!carregado.current) return;
    onChange({
      nodes: nodes.map(({ id, type, position, width, height, measured, data, style }) => {
        const { onTexto: _f, url: _u, ...resto } = data as Record<string, unknown>;
        return { id, type, position, width: width ?? measured?.width, height: height ?? measured?.height, style, data: resto } as Node;
      }),
      edges: edges.map(({ id, source, target, sourceHandle, targetHandle, label }) => ({ id, source, target, sourceHandle, targetHandle, label }) as Edge),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges]);

  const onNodesChange = useCallback((c: NodeChange[]) => setNodes((ns) => applyNodeChanges(c, ns)), []);
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges((es) => applyEdgeChanges(c, es)), []);
  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, ...arestaPadrao, id: `e-${Date.now()}` }, es)), []);

  const centro = () => {
    const el = document.querySelector('.forum-quadro') as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 600) / 2 - 110, y: (r?.top ?? 0) + (r?.height ?? 400) / 2 - 60 });
  };

  const novaNota = (cor = 'padrao') => {
    const id = `n-${Date.now()}`;
    setNodes((ns) => [
      ...ns.map((n) => ({ ...n, selected: false })),
      { id, type: 'nota', position: centro(), width: 220, height: 120, selected: true, data: { texto: '', cor, onTexto } },
    ]);
  };

  const novaImagem = async (arquivos: File[]) => {
    setEnviando(true);
    try {
      for (const [i, arq] of arquivos.filter((f) => f.type.startsWith('image/')).entries()) {
        const { url, path } = await enviarImagem(arq);
        const p = centro();
        setNodes((ns) => [
          ...ns,
          { id: `i-${Date.now()}-${i}`, type: 'imagem', position: { x: p.x + i * 30, y: p.y + i * 30 }, width: 280, height: 180, data: { path, url, nome: arq.name, cor: 'padrao' } },
        ]);
      }
    } catch (e) {
      toast.error('Não foi possível enviar a imagem', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setEnviando(false);
    }
  };

  const selecionados = nodes.filter((n) => n.selected);
  const arestasSelecionadas = edges.filter((e) => e.selected);

  const pintar = (cor: string) => setNodes((ns) => ns.map((n) => (n.selected ? { ...n, data: { ...n.data, cor } } : n)));
  const excluir = () => {
    const ids = new Set(selecionados.map((n) => n.id));
    setNodes((ns) => ns.filter((n) => !ids.has(n.id)));
    setEdges((es) => es.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)));
  };

  return (
    <div className="flex h-[620px] flex-col overflow-hidden rounded-xl border border-border/70 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => novaNota()}>
          <Nota className="h-4 w-4" /> Nota
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => entradaArquivo.current?.click()} disabled={enviando}>
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Galeria className="h-4 w-4" />} Imagem
        </Button>
        <span className="mx-1 h-5 w-px bg-border" />
        <span className="text-xs text-muted-foreground">Cor:</span>
        {Object.entries(CORES).map(([k, c]) => (
          <button
            key={k}
            type="button"
            title={`${c.rotulo}${selecionados.length ? '' : ' (selecione um cartão)'}`}
            disabled={!selecionados.length}
            onClick={() => pintar(k)}
            className="h-5 w-5 rounded-full border-2 transition hover:scale-110 disabled:opacity-40"
            style={{ borderColor: c.borda, background: k === 'padrao' ? 'transparent' : c.borda }}
          />
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <Button size="sm" variant="ghost" className="gap-1.5" disabled={!selecionados.length && !arestasSelecionadas.length} onClick={excluir}>
          <Trash2 className="h-4 w-4" /> Excluir
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => rf.fitView({ padding: 0.2, duration: 300 })}>
          <AjustarTela className="h-4 w-4" /> Ajustar
        </Button>
        <span className="ml-auto hidden text-[11px] text-muted-foreground lg:block">
          Arraste da bolinha de um cartão até outro para ligar · dois cliques na seta para legenda · Delete apaga
        </span>
        <input
          ref={entradaArquivo}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            novaImagem(Array.from(e.target.files || []));
            e.target.value = '';
          }}
        />
      </div>
      <div
        className="forum-quadro min-h-0 flex-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          const arqs = Array.from(e.dataTransfer.files || []);
          if (arqs.length) {
            e.preventDefault();
            novaImagem(arqs);
          }
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={tiposNo}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeDoubleClick={(_e, aresta) => {
            const rotulo = window.prompt('Legenda da seta (vazio remove):', String((aresta as Edge & { label?: unknown }).label ?? ''));
            if (rotulo === null) return;
            setEdges((es) => es.map((x) => (x.id === aresta.id ? { ...x, label: rotulo.trim() || undefined } : x)));
          }}
          onPaneClick={() => undefined}
          onDoubleClick={(e) => {
            // Dois cliques no fundo cria uma nota ali (como no Obsidian).
            if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return;
            const id = `n-${Date.now()}`;
            const p = rf.screenToFlowPosition({ x: e.clientX - 110, y: e.clientY - 60 });
            setNodes((ns) => [...ns, { id, type: 'nota', position: p, width: 220, height: 120, data: { texto: '', cor: 'padrao', onTexto } }]);
          }}
          zoomOnDoubleClick={false}
          deleteKeyCode={['Delete', 'Backspace']}
          colorMode={resolvedTheme === 'dark' ? 'dark' : 'light'}
          fitView
          minZoom={0.1}
          maxZoom={2.5}
        >
          <Background gap={20} size={1.5} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable className="!hidden md:!block" nodeStrokeWidth={3} />
        </ReactFlow>
      </div>
    </div>
  );
}

/** Quadro com o provider do React Flow (cada post abre o seu). */
export function QuadroCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <Quadro {...props} />
    </ReactFlowProvider>
  );
}
