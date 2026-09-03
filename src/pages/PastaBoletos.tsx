import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  FolderOpen,
  RefreshCw,
  Send,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  HelpCircle,
  Upload,
  Link2,
  FileSearch,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import {
  analisarBoleto,
  extrairTextoPdf,
  identificarCliente,
  montarMensagem,
  formatarValor,
  CRITERIO_LABEL,
  type ClienteIdentificavel,
  type CriterioMatch,
  type DadosBoleto,
} from "@/lib/boletoPdf";

interface ClienteBusca extends ClienteIdentificavel {
  id: string;
  nome_empresa: string;
  telefone: string | null;
  cnpj: string | null;
  cpf_dono: string | null;
  nome_dono: string | null;
}

type EntryStatus =
  | "analisando"
  | "pendente"
  | "sem_cliente"
  | "sem_telefone"
  | "enviando"
  | "enviado"
  | "enviado_link"
  | "enviado_sem_anexo"
  | "erro"
  | "ja_enviado";

interface FileEntry {
  key: string; // nome|tamanho|dataModificacao — identifica o arquivo de forma estável
  name: string;
  size: number;
  fileHandle?: FileSystemFileHandle;
  file?: File; // usado no modo de seleção manual / arrastar-e-soltar
  clienteId: string | null;
  clienteNome: string | null;
  telefone: string | null;
  criterio: CriterioMatch | "manual" | null;
  confianca: "alta" | "media" | "baixa" | null;
  dados: DadosBoleto | null;
  status: EntryStatus;
  erro?: string;
}

const AUTO_SCAN_INTERVAL_MS = 20000;
const DELAY_ENTRE_ENVIOS_MS = 1500;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const SENT_KEYS_STORAGE = "boletos_pasta_enviados_v1";
const TEMPLATE_STORAGE = "boletos_pasta_template_v2";
const IDB_NAME = "license-scope-pro-fs";
const IDB_STORE = "handles";
const DIR_HANDLE_KEY = "boletosDirHandle";

const DEFAULT_TEMPLATE =
  "Olá {nome}, tudo bem?\n\nSegue o boleto referente à mensalidade do seu sistema.\nValor: {valor}\nVencimento: {vencimento}\n\nQualquer dúvida estamos à disposição.";

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown) {
  const db = await openIdb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STATUS_INFO: Record<EntryStatus, { label: string; icon: typeof Clock; className: string }> = {
  analisando: { label: "Lendo PDF...", icon: FileSearch, className: "text-muted-foreground" },
  pendente: { label: "Pronto para enviar", icon: Clock, className: "text-muted-foreground" },
  sem_cliente: { label: "Cliente não identificado", icon: HelpCircle, className: "text-amber-600" },
  sem_telefone: { label: "Cliente sem telefone", icon: HelpCircle, className: "text-amber-600" },
  enviando: { label: "Enviando...", icon: RefreshCw, className: "text-primary" },
  enviado: { label: "Enviado com anexo", icon: CheckCircle2, className: "text-emerald-600" },
  enviado_link: { label: "Enviado como link", icon: Link2, className: "text-emerald-600" },
  enviado_sem_anexo: { label: "Enviado sem documento", icon: AlertTriangle, className: "text-amber-600" },
  erro: { label: "Erro", icon: XCircle, className: "text-destructive" },
  ja_enviado: { label: "Já enviado antes", icon: CheckCircle2, className: "text-muted-foreground" },
};

const CONFIANCA_BADGE: Record<"alta" | "media" | "baixa", { label: string; variant: "default" | "secondary" | "outline" }> = {
  alta: { label: "confiança alta", variant: "default" },
  media: { label: "confiança média", variant: "secondary" },
  baixa: { label: "confiança baixa — confira", variant: "outline" },
};

export default function PastaBoletos() {
  const supported = typeof window !== "undefined" && !!window.showDirectoryPicker;

  const [clientes, setClientes] = useState<ClienteBusca[]>([]);
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [dirName, setDirName] = useState("");
  const [needsPermission, setNeedsPermission] = useState(false);
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [autoWatch, setAutoWatch] = useState(false);
  const [autoSend, setAutoSend] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [template, setTemplate] = useState(
    () => localStorage.getItem(TEMPLATE_STORAGE) || DEFAULT_TEMPLATE
  );
  const [enviandoTodos, setEnviandoTodos] = useState(false);

  const clientesRef = useRef<ClienteBusca[]>([]);
  const sentKeysRef = useRef<Set<string>>(new Set()); // chaves (nome|tamanho|data) já enviadas neste navegador
  const sentNamesRef = useRef<Set<string>>(new Set()); // nomes de arquivo já enviados (histórico do servidor)
  const entriesRef = useRef<FileEntry[]>([]);
  const autoSendRef = useRef(false);
  const templateRef = useRef(template);
  const dadosCacheRef = useRef<Map<string, DadosBoleto | null>>(new Map());
  const filaEnvioRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    clientesRef.current = clientes;
  }, [clientes]);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);
  useEffect(() => {
    autoSendRef.current = autoSend;
  }, [autoSend]);
  useEffect(() => {
    templateRef.current = template;
    localStorage.setItem(TEMPLATE_STORAGE, template);
  }, [template]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SENT_KEYS_STORAGE);
      if (raw) sentKeysRef.current = new Set(JSON.parse(raw));
    } catch {
      // ignora storage corrompido
    }
    (async () => {
      await Promise.all([carregarClientes(), carregarHistoricoEnviados()]);
      await restaurarPasta();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarClientes() {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome_empresa, telefone, cnpj, cpf_dono, nome_dono")
      .order("nome_empresa");
    if (error) {
      toast.error("Erro ao carregar clientes");
      return;
    }
    const lista = (data || []) as ClienteBusca[];
    setClientes(lista);
    clientesRef.current = lista;
  }

  // Histórico do servidor: a função send-whatsapp registra "📎 <arquivo>" na
  // mensagem, o que permite reconhecer boletos já enviados mesmo em outro
  // computador/navegador.
  async function carregarHistoricoEnviados() {
    const { data, error } = await supabase
      .from("mensagens_enviadas")
      .select("mensagem, status")
      .eq("tipo", "boleto")
      .like("status", "enviado%")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      console.error(error);
      return;
    }
    const nomes = new Set<string>();
    for (const m of data || []) {
      const match = /📎 (.+)$/m.exec(m.mensagem || "");
      if (match) nomes.add(match[1].trim().toLowerCase());
    }
    sentNamesRef.current = nomes;
  }

  async function restaurarPasta() {
    if (!supported) return;
    try {
      const handle = await idbGet<FileSystemDirectoryHandle>(DIR_HANDLE_KEY);
      if (!handle) return;
      setDirHandle(handle);
      setDirName(handle.name);
      const perm = await handle.queryPermission({ mode: "read" });
      if (perm === "granted") {
        await rescan(handle);
      } else {
        setNeedsPermission(true);
      }
    } catch {
      // pasta pode ter sido movida/removida — usuário seleciona novamente
    }
  }

  // Converte o PDF para base64: o upload no Storage é feito pela função
  // send-whatsapp (service role), então não depende do vínculo do usuário com
  // uma empresa nem das policies do bucket.
  async function fileToBase64(file: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        resolve(result.includes(",") ? result.slice(result.indexOf(",") + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function selecionarPasta() {
    if (!window.showDirectoryPicker) return;
    try {
      const handle = await window.showDirectoryPicker({ id: "boletos-pasta", mode: "read" });
      setDirHandle(handle);
      setDirName(handle.name);
      setNeedsPermission(false);
      await idbSet(DIR_HANDLE_KEY, handle);
      await rescan(handle);
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        toast.error("Não foi possível abrir a pasta");
      }
    }
  }

  async function concederAcesso() {
    if (!dirHandle) return;
    const perm = await dirHandle.requestPermission({ mode: "read" });
    if (perm === "granted") {
      setNeedsPermission(false);
      await rescan(dirHandle);
    } else {
      toast.error("Acesso à pasta negado pelo navegador");
    }
  }

  function updateEntry(key: string, patch: Partial<FileEntry>) {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  function statusInicial(entry: Pick<FileEntry, "key" | "name" | "clienteId" | "telefone">): EntryStatus {
    if (sentKeysRef.current.has(entry.key) || sentNamesRef.current.has(entry.name.toLowerCase())) return "ja_enviado";
    if (!entry.clienteId) return "sem_cliente";
    if (!entry.telefone) return "sem_telefone";
    return "pendente";
  }

  /** Lê o PDF (se ainda não lido) e identifica o cliente. */
  async function analisarEntry(entry: FileEntry): Promise<FileEntry> {
    let dados = dadosCacheRef.current.get(entry.key);
    if (dados === undefined) {
      try {
        const file = entry.fileHandle ? await entry.fileHandle.getFile() : entry.file;
        const texto = file ? await extrairTextoPdf(file) : "";
        dados = analisarBoleto(texto);
      } catch (e) {
        console.warn("Falha ao ler PDF", entry.name, e);
        dados = null;
      }
      dadosCacheRef.current.set(entry.key, dados);
    }
    const match = identificarCliente(entry.name, dados, clientesRef.current);
    const atualizado: FileEntry = {
      ...entry,
      dados,
      clienteId: match?.cliente.id ?? null,
      clienteNome: match?.cliente.nome_empresa ?? null,
      telefone: match?.cliente.telefone ?? null,
      criterio: match?.criterio ?? null,
      confianca: match?.confianca ?? null,
    };
    atualizado.status = statusInicial(atualizado);
    return atualizado;
  }

  /**
   * Incorpora uma lista de arquivos à tabela: mantém o estado dos que já
   * estavam lá (evita reenviar/reler), analisa os novos e devolve os que
   * ficaram prontos para envio.
   */
  async function incorporarArquivos(
    brutos: Array<{ name: string; size: number; lastModified: number; fileHandle?: FileSystemFileHandle; file?: File }>,
    opts: { substituir: boolean }
  ): Promise<FileEntry[]> {
    const anteriores = new Map(entriesRef.current.map((e) => [e.key, e]));
    const base: FileEntry[] = brutos.map((b) => {
      const key = `${b.name}|${b.size}|${b.lastModified}`;
      const prev = anteriores.get(key);
      if (prev) return { ...prev, fileHandle: b.fileHandle ?? prev.fileHandle, file: b.file ?? prev.file };
      return {
        key,
        name: b.name,
        size: b.size,
        fileHandle: b.fileHandle,
        file: b.file,
        clienteId: null,
        clienteNome: null,
        telefone: null,
        criterio: null,
        confianca: null,
        dados: null,
        status: "analisando",
      };
    });

    const lista = opts.substituir
      ? base
      : [...entriesRef.current.filter((e) => !base.some((b) => b.key === e.key)), ...base];
    lista.sort((a, b) => a.name.localeCompare(b.name));
    setEntries(lista);
    entriesRef.current = lista;

    const novos: FileEntry[] = [];
    for (const entry of base) {
      if (entry.status !== "analisando") continue;
      const analisado = await analisarEntry(entry);
      updateEntry(entry.key, analisado);
      entriesRef.current = entriesRef.current.map((e) => (e.key === entry.key ? analisado : e));
      if (analisado.status === "pendente") novos.push(analisado);
    }
    return novos;
  }

  const rescan = useCallback(
    async (handle: FileSystemDirectoryHandle, opts?: { silent?: boolean }) => {
      setScanning(true);
      try {
        const brutos: Array<{ name: string; size: number; lastModified: number; fileHandle: FileSystemFileHandle }> = [];
        for await (const [name, h] of handle.entries()) {
          if (h.kind !== "file" || !/\.pdf$/i.test(name)) continue;
          const fh = h as FileSystemFileHandle;
          const file = await fh.getFile();
          brutos.push({ name, size: file.size, lastModified: file.lastModified, fileHandle: fh });
        }
        const novos = await incorporarArquivos(brutos, { substituir: true });

        if (!opts?.silent && brutos.length > 0) {
          toast.success(`${brutos.length} arquivo(s) na pasta · ${novos.length} pronto(s) para envio`);
        }
        if (novos.length > 0 && opts?.silent) {
          toast.info(`${novos.length} novo(s) boleto(s) detectado(s) na pasta`);
        }
        if (novos.length > 0 && autoSendRef.current) {
          enfileirarEnvios(novos);
        }
      } catch (e) {
        console.error(e);
        if (!opts?.silent) toast.error("Erro ao ler a pasta");
      } finally {
        setScanning(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  useEffect(() => {
    if (!autoWatch || !dirHandle) return;
    const id = setInterval(() => {
      rescan(dirHandle, { silent: true });
    }, AUTO_SCAN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoWatch, dirHandle, rescan]);

  function marcarComoEnviado(entry: FileEntry) {
    sentKeysRef.current.add(entry.key);
    sentNamesRef.current.add(entry.name.toLowerCase());
    localStorage.setItem(SENT_KEYS_STORAGE, JSON.stringify(Array.from(sentKeysRef.current)));
  }

  function desmarcarEnviado(entry: FileEntry) {
    sentKeysRef.current.delete(entry.key);
    sentNamesRef.current.delete(entry.name.toLowerCase());
    localStorage.setItem(SENT_KEYS_STORAGE, JSON.stringify(Array.from(sentKeysRef.current)));
    updateEntry(entry.key, { status: !entry.clienteId ? "sem_cliente" : !entry.telefone ? "sem_telefone" : "pendente" });
  }

  async function enviarEntryInterno(entry: FileEntry) {
    if (!entry.clienteId || !entry.telefone) return;
    updateEntry(entry.key, { status: "enviando", erro: undefined });
    try {
      const file = entry.fileHandle ? await entry.fileHandle.getFile() : entry.file;
      if (!file) throw new Error("Arquivo indisponível");
      if (file.size > MAX_PDF_BYTES) throw new Error("PDF maior que 8 MB");
      const base64 = await fileToBase64(file);

      const mensagem = montarMensagem(templateRef.current, {
        nome: entry.clienteNome || "",
        arquivo: entry.name,
        dados: entry.dados,
      });

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          telefone: entry.telefone,
          mensagem,
          cliente_id: entry.clienteId,
          tipo: "boleto",
          media_base64: base64,
          media_content_type: file.type || "application/pdf",
          media_filename: entry.name,
          media_bucket: "boletos",
        },
      });
      if (error) throw error;
      const res = data as {
        success: boolean;
        error?: string;
        usedMedia?: boolean;
        documentByLink?: boolean;
        warning?: string | null;
      };
      if (!res?.success) throw new Error(res?.error || "Falha ao enviar");

      marcarComoEnviado(entry);
      if (res.usedMedia) {
        updateEntry(entry.key, { status: "enviado", erro: undefined });
      } else if (res.documentByLink) {
        updateEntry(entry.key, { status: "enviado_link", erro: res.warning || undefined });
      } else {
        updateEntry(entry.key, {
          status: "enviado_sem_anexo",
          erro: res.warning || "O documento não foi entregue; apenas o texto chegou ao cliente.",
        });
      }
    } catch (e) {
      updateEntry(entry.key, {
        status: "erro",
        erro: e instanceof Error ? e.message : "Erro desconhecido",
      });
    }
  }

  /** Envia em série (uma mensagem por vez, com pausa) para não estourar limites do WhatsApp. */
  function enfileirarEnvios(lista: FileEntry[]) {
    for (const entry of lista) {
      filaEnvioRef.current = filaEnvioRef.current.then(async () => {
        const atual = entriesRef.current.find((e) => e.key === entry.key) ?? entry;
        if (atual.status === "enviando" || atual.status === "enviado" || atual.status === "enviado_link") return;
        await enviarEntryInterno(atual);
        await sleep(DELAY_ENTRE_ENVIOS_MS);
      });
    }
    return filaEnvioRef.current;
  }

  async function enviarTodosPendentes() {
    const pendentes = entriesRef.current.filter((e) => e.status === "pendente");
    if (pendentes.length === 0) {
      toast.info("Nenhum boleto pendente para enviar");
      return;
    }
    setEnviandoTodos(true);
    await enfileirarEnvios(pendentes);
    setEnviandoTodos(false);
    const finais = entriesRef.current.filter((e) => pendentes.some((p) => p.key === e.key));
    const ok = finais.filter((e) => e.status === "enviado" || e.status === "enviado_link").length;
    const erros = finais.filter((e) => e.status === "erro" || e.status === "enviado_sem_anexo").length;
    if (erros > 0) toast.warning(`Envio concluído: ${ok} ok, ${erros} com problema`);
    else toast.success(`Envio em lote concluído: ${ok} boleto(s) enviado(s)`);
  }

  function definirClienteManual(key: string, clienteId: string) {
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) return;
    const entry = entriesRef.current.find((e) => e.key === key);
    const patch: Partial<FileEntry> = {
      clienteId: cliente.id,
      clienteNome: cliente.nome_empresa,
      telefone: cliente.telefone,
      criterio: "manual",
      confianca: "alta",
    };
    const jaEnviado = entry && (sentKeysRef.current.has(entry.key) || sentNamesRef.current.has(entry.name.toLowerCase()));
    patch.status = jaEnviado ? "ja_enviado" : cliente.telefone ? "pendente" : "sem_telefone";
    updateEntry(key, patch);
  }

  async function adicionarArquivos(fileList: FileList | File[] | null) {
    if (!fileList) return;
    const pdfs = Array.from(fileList).filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
    if (pdfs.length === 0) {
      toast.error("Selecione arquivos PDF");
      return;
    }
    setScanning(true);
    try {
      const novos = await incorporarArquivos(
        pdfs.map((f) => ({ name: f.name, size: f.size, lastModified: f.lastModified, file: f })),
        { substituir: false }
      );
      toast.success(`${pdfs.length} PDF(s) adicionado(s) · ${novos.length} pronto(s) para envio`);
    } finally {
      setScanning(false);
    }
  }

  function removerEntry(key: string) {
    setEntries((prev) => prev.filter((e) => e.key !== key));
    entriesRef.current = entriesRef.current.filter((e) => e.key !== key);
  }

  const resumo = {
    pendentes: entries.filter((e) => e.status === "pendente").length,
    semCliente: entries.filter((e) => e.status === "sem_cliente" || e.status === "sem_telefone").length,
    enviados: entries.filter((e) => e.status === "enviado" || e.status === "enviado_link" || e.status === "ja_enviado").length,
    comAviso: entries.filter((e) => e.status === "enviado_sem_anexo" || e.status === "erro").length,
    analisando: entries.filter((e) => e.status === "analisando").length,
  };

  return (
    <div className="w-full space-y-6 p-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold">Pasta de Boletos</h1>
        <p className="text-muted-foreground">
          Jogue os PDFs dos boletos aqui: o sistema lê cada boleto, identifica o cliente e envia pelo WhatsApp com o
          arquivo anexado
        </p>
      </motion.div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Como o cliente é identificado</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>
            O sistema lê o conteúdo do PDF e procura o <strong>CNPJ</strong> ou <strong>CPF</strong> do pagador (deve estar
            igual ao cadastro do cliente), depois o <strong>nome do pagador</strong>. Se o PDF for uma imagem escaneada, usa o
            nome do arquivo: telefone (ex: <code>11991234567-boleto.pdf</code>), CNPJ (ex: <code>12345678000199_set2026.pdf</code>)
            ou nome do cliente (ex: <code>Boleto Empresa ACME Ltda.pdf</code>).
          </p>
          <p>
            Arquivos sem correspondência ficam como "Cliente não identificado" para você associar manualmente. Boletos já
            enviados (neste navegador ou registrados no histórico) não são reenviados automaticamente.
          </p>
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" /> Enviar vários boletos
            </CardTitle>
            <CardDescription>Arraste os PDFs para a área abaixo ou clique para selecionar vários de uma vez.</CardDescription>
          </CardHeader>
          <CardContent>
            <label
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:bg-muted/40"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                adicionarArquivos(e.dataTransfer.files);
              }}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">Solte os boletos (PDF) aqui</span>
              <span className="text-xs text-muted-foreground">ou clique para escolher os arquivos</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="hidden"
                onChange={(e) => {
                  adicionarArquivos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderOpen className="h-5 w-5" /> Pasta monitorada (opcional)
            </CardTitle>
            <CardDescription>
              {supported
                ? "Selecione a pasta do computador onde os boletos são salvos; novos PDFs podem ser enviados automaticamente."
                : "Seu navegador não suporta monitorar uma pasta (recurso do Chrome/Edge/Opera no desktop). Use a área ao lado para selecionar os arquivos."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {supported && (
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={selecionarPasta} variant="outline">
                  <FolderOpen className="mr-2 h-4 w-4" />
                  {dirName ? "Trocar pasta" : "Selecionar pasta"}
                </Button>
                {dirName && (
                  <Badge variant="secondary" className="text-sm">
                    {dirName}
                  </Badge>
                )}
                {needsPermission && (
                  <Button size="sm" variant="destructive" onClick={concederAcesso}>
                    Conceder acesso novamente
                  </Button>
                )}
                {dirHandle && !needsPermission && (
                  <Button size="sm" variant="ghost" onClick={() => rescan(dirHandle)} disabled={scanning}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
                    Verificar agora
                  </Button>
                )}
              </div>
            )}

            {supported && dirHandle && !needsPermission && (
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-center gap-2">
                  <Switch checked={autoWatch} onCheckedChange={setAutoWatch} id="auto-watch" />
                  <Label htmlFor="auto-watch" className="cursor-pointer text-sm">
                    Monitorar automaticamente (a cada {AUTO_SCAN_INTERVAL_MS / 1000}s, enquanto esta aba estiver aberta)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={autoSend} onCheckedChange={setAutoSend} id="auto-send" disabled={!autoWatch} />
                  <Label htmlFor="auto-send" className="cursor-pointer text-sm">
                    Enviar automaticamente ao detectar um novo boleto (só quando o cliente é identificado)
                  </Label>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mensagem enviada com o boleto</CardTitle>
          <CardDescription>
            Campos disponíveis: <code>{"{nome}"}</code> cliente · <code>{"{valor}"}</code> · <code>{"{vencimento}"}</code> ·{" "}
            <code>{"{linha_digitavel}"}</code> · <code>{"{arquivo}"}</code>. O PDF vai anexado na sequência da mensagem.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={5} value={template} onChange={(e) => setTemplate(e.target.value)} />
          <Button variant="ghost" size="sm" onClick={() => setTemplate(DEFAULT_TEMPLATE)}>
            Restaurar mensagem padrão
          </Button>
        </CardContent>
      </Card>

      {entries.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Boletos ({entries.length})</CardTitle>
              <CardDescription>
                {resumo.analisando > 0 && `${resumo.analisando} lendo · `}
                {resumo.pendentes} pronto(s) · {resumo.semCliente} sem cliente/telefone · {resumo.enviados} enviado(s)
                {resumo.comAviso > 0 && ` · ${resumo.comAviso} com aviso/erro`}
              </CardDescription>
            </div>
            <Button onClick={enviarTodosPendentes} disabled={enviandoTodos || resumo.pendentes === 0}>
              <Send className="mr-2 h-4 w-4" />
              {enviandoTodos ? "Enviando..." : `Enviar todos prontos (${resumo.pendentes})`}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Arquivo</TableHead>
                    <TableHead>Cliente identificado</TableHead>
                    <TableHead>Telefone</TableHead>
                    <TableHead>Valor / Vencimento</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const info = STATUS_INFO[entry.status];
                    const Icon = info.icon;
                    const podeEnviar = !!entry.clienteId && !!entry.telefone && entry.status !== "enviando" && entry.status !== "analisando";
                    const reenvio =
                      entry.status === "enviado" ||
                      entry.status === "enviado_link" ||
                      entry.status === "ja_enviado" ||
                      entry.status === "enviado_sem_anexo" ||
                      entry.status === "erro";
                    return (
                      <TableRow key={entry.key}>
                        <TableCell className="max-w-[240px] font-medium">
                          <div className="truncate" title={entry.name}>
                            {entry.name}
                          </div>
                          <div className="text-xs text-muted-foreground">{(entry.size / 1024).toFixed(0)} KB</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Select
                              value={entry.clienteId ?? ""}
                              onValueChange={(v) => definirClienteManual(entry.key, v)}
                              disabled={entry.status === "enviando" || entry.status === "analisando"}
                            >
                              <SelectTrigger className="h-8 w-56">
                                <SelectValue placeholder="Associar cliente..." />
                              </SelectTrigger>
                              <SelectContent>
                                {clientes.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.nome_empresa}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {entry.criterio && entry.confianca && (
                              <div className="flex flex-wrap items-center gap-1">
                                <Badge variant={CONFIANCA_BADGE[entry.confianca].variant} className="text-[10px]">
                                  {entry.criterio === "manual" ? "associado manualmente" : CRITERIO_LABEL[entry.criterio]}
                                </Badge>
                                {entry.criterio !== "manual" && entry.confianca !== "alta" && (
                                  <span className="text-[10px] text-amber-600">{CONFIANCA_BADGE[entry.confianca].label}</span>
                                )}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.telefone || (entry.clienteId ? "sem telefone" : "—")}
                        </TableCell>
                        <TableCell className="text-sm">
                          {entry.dados?.valor || entry.dados?.vencimento ? (
                            <>
                              <div>{formatarValor(entry.dados?.valor) || "—"}</div>
                              <div className="text-xs text-muted-foreground">{entry.dados?.vencimento || "—"}</div>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              {entry.status === "analisando" ? "lendo..." : entry.dados?.texto ? "não localizado" : "PDF sem texto"}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1.5 text-sm ${info.className}`} title={entry.erro}>
                            <Icon
                              className={`h-4 w-4 ${entry.status === "enviando" || entry.status === "analisando" ? "animate-spin" : ""}`}
                            />
                            {info.label}
                          </div>
                          {entry.erro && (
                            <p className="mt-1 max-w-[260px] text-xs text-destructive" title={entry.erro}>
                              {entry.erro}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {entry.status === "ja_enviado" && (
                              <Button size="sm" variant="ghost" onClick={() => desmarcarEnviado(entry)} title="Marcar como não enviado">
                                Desmarcar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant={reenvio ? "outline" : "default"}
                              disabled={!podeEnviar}
                              onClick={() => enfileirarEnvios([entry])}
                            >
                              {reenvio ? "Reenviar" : "Enviar"}
                            </Button>
                            {!entry.fileHandle && (
                              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => removerEntry(entry.key)} title="Remover da lista">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
