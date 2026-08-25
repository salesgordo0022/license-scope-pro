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

interface ClienteBusca {
  id: string;
  nome_empresa: string;
  telefone: string | null;
  cnpj: string | null;
}

type EntryStatus =
  | "pendente"
  | "sem_cliente"
  | "sem_telefone"
  | "enviando"
  | "enviado"
  | "enviado_sem_anexo"
  | "erro"
  | "ja_enviado";

interface FileEntry {
  key: string; // nome|tamanho|dataModificacao — identifica o arquivo de forma estável
  name: string;
  size: number;
  fileHandle?: FileSystemFileHandle;
  file?: File; // usado no modo de seleção manual (sem File System Access API)
  clienteId: string | null;
  clienteNome: string | null;
  telefone: string | null;
  status: EntryStatus;
  erro?: string;
}

const AUTO_SCAN_INTERVAL_MS = 20000;
const SENT_KEYS_STORAGE = "boletos_pasta_enviados_v1";
const TEMPLATE_STORAGE = "boletos_pasta_template_v1";
const IDB_NAME = "license-scope-pro-fs";
const IDB_STORE = "handles";
const DIR_HANDLE_KEY = "boletosDirHandle";

const DEFAULT_TEMPLATE =
  "Olá {nome}, tudo bem?\n\nSegue o boleto referente à mensalidade do seu sistema.\n\nQualquer dúvida estamos à disposição.";

const onlyDigits = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

function normalizeToken(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function extractDigitRuns(name: string): string[] {
  return name.match(/\d{8,}/g) || [];
}

function matchCliente(filename: string, clientes: ClienteBusca[]): ClienteBusca | null {
  const baseName = filename.replace(/\.[^.]+$/, "");
  const digitRuns = extractDigitRuns(baseName);

  // 1) Telefone: compara os últimos 8 dígitos (ignora DDI 55 e variações de DDD)
  for (const run of digitRuns) {
    const cli = clientes.find((c) => {
      const tel = onlyDigits(c.telefone);
      if (tel.length < 8) return false;
      return run.endsWith(tel.slice(-8));
    });
    if (cli) return cli;
  }

  // 2) CNPJ (14 dígitos exatos em algum trecho do nome)
  for (const run of digitRuns) {
    const cli = clientes.find((c) => {
      const cnpj = onlyDigits(c.cnpj);
      return cnpj.length === 14 && run.includes(cnpj);
    });
    if (cli) return cli;
  }

  // 3) Nome do cliente contido no nome do arquivo (usa o casamento mais longo)
  const normFile = normalizeToken(baseName);
  let best: ClienteBusca | null = null;
  let bestLen = 0;
  for (const c of clientes) {
    const normNome = normalizeToken(c.nome_empresa);
    if (normNome.length >= 4 && normFile.includes(normNome) && normNome.length > bestLen) {
      best = c;
      bestLen = normNome.length;
    }
  }
  return best;
}

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

const STATUS_INFO: Record<EntryStatus, { label: string; icon: typeof Clock; className: string }> = {
  pendente: { label: "Pendente", icon: Clock, className: "text-muted-foreground" },
  sem_cliente: { label: "Cliente não identificado", icon: HelpCircle, className: "text-amber-600" },
  sem_telefone: { label: "Cliente sem telefone", icon: HelpCircle, className: "text-amber-600" },
  enviando: { label: "Enviando...", icon: RefreshCw, className: "text-primary" },
  enviado: { label: "Enviado", icon: CheckCircle2, className: "text-emerald-600" },
  enviado_sem_anexo: { label: "Enviado sem documento", icon: AlertTriangle, className: "text-amber-600" },
  erro: { label: "Erro", icon: XCircle, className: "text-destructive" },
  ja_enviado: { label: "Já enviado antes", icon: CheckCircle2, className: "text-muted-foreground" },
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
  const [template, setTemplate] = useState(
    () => localStorage.getItem(TEMPLATE_STORAGE) || DEFAULT_TEMPLATE
  );
  const [enviandoTodos, setEnviandoTodos] = useState(false);

  const clientesRef = useRef<ClienteBusca[]>([]);
  const sentKeysRef = useRef<Set<string>>(new Set());
  const entriesRef = useRef<FileEntry[]>([]);
  const autoSendRef = useRef(false);

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
    try {
      const raw = localStorage.getItem(SENT_KEYS_STORAGE);
      if (raw) sentKeysRef.current = new Set(JSON.parse(raw));
    } catch {
      // ignora storage corrompido
    }
    carregarClientes();
    restaurarPasta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(TEMPLATE_STORAGE, template);
  }, [template]);

  async function carregarClientes() {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome_empresa, telefone, cnpj")
      .order("nome_empresa");
    if (error) {
      toast.error("Erro ao carregar clientes");
      return;
    }
    setClientes((data || []) as ClienteBusca[]);
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

  async function getEmpresaId(): Promise<string> {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) throw new Error("Sessão expirada");
    const { data: perfil, error } = await supabase
      .from("usuario_perfil")
      .select("empresa_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!perfil?.empresa_id) throw new Error("Sua conta não está vinculada a uma empresa");
    return perfil.empresa_id;
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

  const rescan = useCallback(
    async (handle: FileSystemDirectoryHandle, opts?: { silent?: boolean }) => {
      setScanning(true);
      try {
        const list: FileEntry[] = [];
        for await (const [name, h] of handle.entries()) {
          if (h.kind !== "file" || !/\.pdf$/i.test(name)) continue;
          const fh = h as FileSystemFileHandle;
          const file = await fh.getFile();
          const key = `${name}|${file.size}|${file.lastModified}`;
          const match = matchCliente(name, clientesRef.current);
          const jaEnviado = sentKeysRef.current.has(key);
          list.push({
            key,
            name,
            size: file.size,
            fileHandle: fh,
            clienteId: match?.id ?? null,
            clienteNome: match?.nome_empresa ?? null,
            telefone: match?.telefone ?? null,
            status: jaEnviado ? "ja_enviado" : !match ? "sem_cliente" : match.telefone ? "pendente" : "sem_telefone",
          });
        }
        list.sort((a, b) => a.name.localeCompare(b.name));

        const novos = list.filter(
          (e) => e.status === "pendente" && !entriesRef.current.some((prev) => prev.key === e.key)
        );

        setEntries(list);

        if (!opts?.silent && novos.length === 0 && list.length > 0) {
          toast.success(`${list.length} arquivo(s) encontrado(s) na pasta`);
        }
        if (novos.length > 0 && opts?.silent) {
          toast.info(`${novos.length} novo(s) boleto(s) detectado(s) na pasta`);
        }
        if (novos.length > 0 && autoSendRef.current) {
          for (const entry of novos) {
            await enviarEntryInterno(entry);
          }
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

  function updateEntry(key: string, patch: Partial<FileEntry>) {
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, ...patch } : e)));
  }

  function marcarComoEnviado(key: string) {
    sentKeysRef.current.add(key);
    localStorage.setItem(SENT_KEYS_STORAGE, JSON.stringify(Array.from(sentKeysRef.current)));
  }

  async function enviarEntryInterno(entry: FileEntry) {
    if (!entry.clienteId || !entry.telefone) return;
    updateEntry(entry.key, { status: "enviando", erro: undefined });
    try {
      const file = entry.fileHandle ? await entry.fileHandle.getFile() : entry.file;
      if (!file) throw new Error("Arquivo indisponível");

      const empresaId = await getEmpresaId();
      const contentType = file.type || "application/pdf";
      const path = `${empresaId}/pasta-${entry.clienteId}-${Date.now()}.pdf`;

      const { error: upErr } = await supabase.storage
        .from("boletos")
        .upload(path, file, { upsert: true, contentType });
      if (upErr) throw upErr;

      const { data: signed, error: signErr } = await supabase.storage
        .from("boletos")
        .createSignedUrl(path, 60 * 60 * 24 * 30);
      if (signErr) throw signErr;

      const mensagem = template.replace(/\{nome\}/g, entry.clienteNome || "");

      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          telefone: entry.telefone,
          mensagem,
          cliente_id: entry.clienteId,
          tipo: "boleto",
          media_url: signed.signedUrl,
          media_filename: entry.name,
        },
      });
      if (error) throw error;
      const res = data as { success: boolean; error?: string; usedMedia?: boolean; warning?: string | null };
      if (!res.success) throw new Error(res.error || "Falha ao enviar");

      marcarComoEnviado(entry.key);
      if (res.usedMedia) {
        updateEntry(entry.key, { status: "enviado" });
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

  async function enviarTodosPendentes() {
    const pendentes = entriesRef.current.filter((e) => e.status === "pendente");
    if (pendentes.length === 0) {
      toast.info("Nenhum boleto pendente para enviar");
      return;
    }
    setEnviandoTodos(true);
    for (const entry of pendentes) {
      await enviarEntryInterno(entry);
    }
    setEnviandoTodos(false);
    toast.success("Envio em lote concluído");
  }

  function definirClienteManual(key: string, clienteId: string) {
    const cliente = clientes.find((c) => c.id === clienteId);
    if (!cliente) return;
    updateEntry(key, {
      clienteId: cliente.id,
      clienteNome: cliente.nome_empresa,
      telefone: cliente.telefone,
      status: cliente.telefone ? "pendente" : "sem_telefone",
    });
  }

  async function handleFallbackFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const list: FileEntry[] = [];
    for (const file of Array.from(fileList)) {
      if (!/\.pdf$/i.test(file.name)) continue;
      const key = `${file.name}|${file.size}|${file.lastModified}`;
      const match = matchCliente(file.name, clientesRef.current);
      const jaEnviado = sentKeysRef.current.has(key);
      list.push({
        key,
        name: file.name,
        size: file.size,
        file,
        clienteId: match?.id ?? null,
        clienteNome: match?.nome_empresa ?? null,
        telefone: match?.telefone ?? null,
        status: jaEnviado ? "ja_enviado" : !match ? "sem_cliente" : match.telefone ? "pendente" : "sem_telefone",
      });
    }
    list.sort((a, b) => a.name.localeCompare(b.name));
    setEntries(list);
    toast.success(`${list.length} arquivo(s) PDF carregado(s)`);
  }

  const resumo = {
    pendentes: entries.filter((e) => e.status === "pendente").length,
    semCliente: entries.filter((e) => e.status === "sem_cliente").length,
    enviados: entries.filter((e) => e.status === "enviado" || e.status === "ja_enviado").length,
    comAviso: entries.filter((e) => e.status === "enviado_sem_anexo" || e.status === "erro").length,
  };

  return (
    <div className="w-full space-y-6 p-6">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold">Pasta de Boletos</h1>
        <p className="text-muted-foreground">
          Monitore uma pasta local: cada PDF é associado a um cliente pelo nome do arquivo e enviado por WhatsApp
        </p>
      </motion.div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Como nomear os arquivos</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>
            Para o sistema identificar o cliente automaticamente, o nome do arquivo PDF deve conter{" "}
            <strong>o telefone</strong> (ex: <code>11991234567-boleto.pdf</code>), <strong>o CNPJ</strong> (ex:{" "}
            <code>12345678000199_set2026.pdf</code>) ou <strong>o nome do cliente</strong> cadastrado (ex:{" "}
            <code>Boleto Empresa ACME Ltda.pdf</code>).
          </p>
          <p>Arquivos sem nenhuma correspondência ficam marcados como "Cliente não identificado" para associação manual.</p>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" /> Pasta monitorada
          </CardTitle>
          <CardDescription>
            {supported
              ? "Selecione a pasta do seu computador onde os boletos são salvos."
              : "Seu navegador não suporta monitorar uma pasta em tempo real (recurso disponível apenas em Chrome/Edge/Opera no desktop). Você ainda pode selecionar os arquivos manualmente abaixo."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {supported ? (
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
          ) : (
            <div>
              <Label>Selecionar arquivos PDF</Label>
              <input
                type="file"
                accept="application/pdf"
                multiple
                className="mt-1 block w-full text-sm"
                onChange={(e) => handleFallbackFiles(e.target.files)}
              />
            </div>
          )}

          {supported && dirHandle && !needsPermission && (
            <div className="flex flex-wrap items-center gap-6 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-2">
                <Switch checked={autoWatch} onCheckedChange={setAutoWatch} id="auto-watch" />
                <Label htmlFor="auto-watch" className="cursor-pointer text-sm">
                  Monitorar automaticamente (a cada {AUTO_SCAN_INTERVAL_MS / 1000}s, enquanto esta aba estiver aberta)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={autoSend} onCheckedChange={setAutoSend} id="auto-send" disabled={!autoWatch} />
                <Label htmlFor="auto-send" className="cursor-pointer text-sm">
                  Enviar automaticamente ao detectar um novo boleto
                </Label>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mensagem enviada com o boleto</CardTitle>
          <CardDescription>
            Use <code>{"{nome}"}</code> para inserir o nome do cliente identificado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea rows={4} value={template} onChange={(e) => setTemplate(e.target.value)} />
        </CardContent>
      </Card>

      {entries.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Arquivos encontrados ({entries.length})</CardTitle>
              <CardDescription>
                {resumo.pendentes} pendente(s) · {resumo.semCliente} sem cliente · {resumo.enviados} enviado(s)
                {resumo.comAviso > 0 && ` · ${resumo.comAviso} com aviso/erro`}
              </CardDescription>
            </div>
            <Button onClick={enviarTodosPendentes} disabled={enviandoTodos || resumo.pendentes === 0}>
              <Send className="mr-2 h-4 w-4" />
              {enviandoTodos ? "Enviando..." : `Enviar todos pendentes (${resumo.pendentes})`}
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
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const info = STATUS_INFO[entry.status];
                    const Icon = info.icon;
                    return (
                      <TableRow key={entry.key}>
                        <TableCell className="max-w-[220px] truncate font-medium" title={entry.name}>
                          {entry.name}
                        </TableCell>
                        <TableCell>
                          {entry.clienteId ? (
                            entry.clienteNome
                          ) : (
                            <Select onValueChange={(v) => definirClienteManual(entry.key, v)}>
                              <SelectTrigger className="h-8 w-48">
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
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {entry.telefone || (entry.clienteId ? "sem telefone" : "—")}
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center gap-1.5 text-sm ${info.className}`} title={entry.erro}>
                            <Icon className={`h-4 w-4 ${entry.status === "enviando" ? "animate-spin" : ""}`} />
                            {info.label}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!entry.clienteId || !entry.telefone || entry.status === "enviando"}
                            onClick={() => enviarEntryInterno(entry)}
                          >
                            {entry.status === "enviado" ||
                            entry.status === "ja_enviado" ||
                            entry.status === "enviado_sem_anexo" ||
                            entry.status === "erro"
                              ? "Reenviar"
                              : "Enviar"}
                          </Button>
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
