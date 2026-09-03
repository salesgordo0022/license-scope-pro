import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Send, FileText, Receipt, History, Search, Paperclip, Users, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

interface Cliente {
  id: string;
  nome_empresa: string;
  telefone: string | null;
}

interface Pagamento {
  id: string;
  cliente_id: string;
  tipo: string;
  valor_final: number;
  data_vencimento: string;
  status: string;
}

interface MensagemHist {
  id: string;
  tipo: string;
  telefone: string;
  mensagem: string;
  status: string;
  erro: string | null;
  created_at: string;
  cliente_id: string | null;
}

const TEMPLATES: Record<string, (nome: string, link?: string) => string> = {
  avulsa: (nome) => `Olá ${nome}, tudo bem?\n\n`,
  boleto: (nome, link) =>
    `Olá ${nome}, segue o boleto referente à mensalidade do seu sistema.\n\n${link ? `Boleto: ${link}\n\n` : ""}Qualquer dúvida estamos à disposição.`,
  contrato: (nome, link) =>
    `Olá ${nome}, segue o contrato para sua análise e assinatura.\n\n${link ? `Contrato: ${link}\n\n` : ""}Ficamos no aguardo do retorno.`,
};

type Modo = "individual" | "massa";

export default function Mensagens() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [historico, setHistorico] = useState<MensagemHist[]>([]);

  const [modo, setModo] = useState<Modo>("individual");
  const [clienteId, setClienteId] = useState<string>("");
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [filtroClientes, setFiltroClientes] = useState("");

  const [tipo, setTipo] = useState<"avulsa" | "boleto" | "contrato">("avulsa");
  const [link, setLink] = useState("");
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");

  const [pagamentoSelecionado, setPagamentoSelecionado] = useState<string>("");
  const uploading = false;
  const [arquivo, setArquivo] = useState<File | null>(null);
  const arquivoNome = arquivo?.name ?? "";
  const arquivoUrl = arquivo ? "anexo" : ""; // flag: há anexo selecionado (o arquivo vai em base64 na hora do envio)

  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");

  const cliente = useMemo(() => clientes.find((c) => c.id === clienteId), [clientes, clienteId]);

  useEffect(() => {
    carregarClientes();
    carregarPagamentos();
    carregarHistorico();
  }, []);

  // Preenche telefone/mensagem quando muda cliente individual
  useEffect(() => {
    if (modo !== "individual") return;
    if (cliente) {
      setTelefone(cliente.telefone || "");
      setMensagem(TEMPLATES[tipo](cliente.nome_empresa, link));
    }
  }, [cliente, tipo, link, arquivoUrl, modo]);

  // Em modo massa, regenera mensagem template baseado no tipo
  useEffect(() => {
    if (modo !== "massa") return;
    setMensagem(TEMPLATES[tipo]("{nome}", link));
  }, [tipo, link, arquivoUrl, modo]);

  async function carregarClientes() {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nome_empresa, telefone")
      .order("nome_empresa");
    if (error) {
      toast.error("Erro ao carregar clientes");
      return;
    }
    setClientes((data || []) as Cliente[]);
  }

  async function carregarPagamentos() {
    const { data, error } = await supabase
      .from("pagamentos")
      .select("id, cliente_id, tipo, valor_final, data_vencimento, status")
      .order("data_vencimento", { ascending: false })
      .limit(500);
    if (error) {
      console.error(error);
      return;
    }
    setPagamentos((data || []) as Pagamento[]);
  }

  async function carregarHistorico() {
    const { data, error } = await supabase
      .from("mensagens_enviadas")
      .select("id, tipo, telefone, mensagem, status, erro, created_at, cliente_id")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) {
      console.error(error);
      return;
    }
    setHistorico((data || []) as MensagemHist[]);
  }

  const pagamentosCliente = useMemo(() => {
    const ids = modo === "individual" ? (clienteId ? [clienteId] : []) : selecionados;
    if (ids.length === 0) return [];
    return pagamentos.filter((p) => ids.includes(p.cliente_id));
  }, [pagamentos, clienteId, selecionados, modo]);

  // O arquivo NÃO é enviado ao Storage aqui: ele vai em base64 para a função
  // send-whatsapp, que grava no bucket com a service role e anexa no WhatsApp.
  // Assim o envio funciona mesmo para usuários sem empresa vinculada.
  function handleUpload(file: File) {
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 8MB)");
      return;
    }
    setArquivo(file);
    toast.success(`Anexo selecionado: ${file.name}`);
  }

  function fileToBase64(file: Blob): Promise<string> {
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

  function aplicarPagamento(pagId: string) {
    setPagamentoSelecionado(pagId);
    // pagamentos não têm URL — vamos pedir link manual ou usar como referência no texto
    const p = pagamentos.find((x) => x.id === pagId);
    if (p) {
      const ref = `Boleto • ${p.tipo} • Venc.: ${new Date(p.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")} • Valor: R$ ${Number(p.valor_final).toFixed(2)}`;
      setLink((prev) => prev || ref);
    }
  }

  function toggleSelecionado(id: string) {
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function selecionarTodos() {
    const filtrados = clientes.filter((c) => c.telefone && c.nome_empresa.toLowerCase().includes(filtroClientes.toLowerCase()));
    setSelecionados(filtrados.map((c) => c.id));
  }

  function limparSelecao() {
    setSelecionados([]);
  }

  async function enviarUm(c: Cliente, base64?: string) {
    const msgPersonalizada = mensagem.replace(/\{nome\}/g, c.nome_empresa);
    const { data, error } = await supabase.functions.invoke("send-whatsapp", {
      body: {
        telefone: c.telefone,
        mensagem: msgPersonalizada,
        cliente_id: c.id,
        tipo,
        media_base64: base64 || undefined,
        media_content_type: arquivo?.type || "application/pdf",
        media_filename: arquivoNome || undefined,
      },
    });
    if (error) return { ok: false, docOk: false, msg: error.message };
    const res = data as { success: boolean; error?: string; usedMedia?: boolean; documentByLink?: boolean; docFalhou?: boolean; warning?: string | null };
    if (!res?.success) return { ok: false, docOk: false, msg: res?.error };
    const docOk = !arquivoUrl || !!res.usedMedia || !!res.documentByLink;
    return { ok: true, docOk, msg: res.warning || undefined };
  }

  async function enviar() {
    if (!mensagem.trim()) {
      toast.error("Mensagem vazia");
      return;
    }
    if (mensagem.length > 4000) {
      toast.error("Mensagem muito longa (máx 4000)");
      return;
    }

    setEnviando(true);
    try {
      if (modo === "individual") {
        if (!telefone.trim() || telefone.replace(/\D/g, "").length < 10) {
          toast.error("Telefone inválido");
          return;
        }
        const base64 = arquivo ? await fileToBase64(arquivo) : undefined;
        const { data, error } = await supabase.functions.invoke("send-whatsapp", {
          body: {
            telefone,
            mensagem,
            cliente_id: clienteId || undefined,
            tipo,
            media_base64: base64,
            media_content_type: arquivo?.type || "application/pdf",
            media_filename: arquivoNome || undefined,
          },
        });
        if (error) throw error;
        const res = data as { success: boolean; version?: number; error?: string; usedMedia?: boolean; documentByLink?: boolean; docFalhou?: boolean; warning?: string | null };
        if (!res.success) {
          toast.error(res.error || "Falha ao enviar");
        } else if (arquivo && (!res.version || res.version < 3)) {
          toast.error("A função send-whatsapp publicada no Supabase está desatualizada e ignorou o anexo. Republique a função e reenvie.", { duration: 10000 });
          carregarHistorico();
        } else if (arquivoUrl && !res.usedMedia && !res.documentByLink) {
          toast.warning("Mensagem enviada, mas o DOCUMENTO falhou — apenas o texto chegou ao cliente.", {
            description: res.warning || undefined,
            duration: 8000,
          });
          carregarHistorico();
        } else if (arquivoUrl && !res.usedMedia && res.documentByLink) {
          toast.warning("Mensagem enviada; o documento foi entregue como LINK para download.", {
            description: res.warning || undefined,
            duration: 8000,
          });
          carregarHistorico();
        } else {
          toast.success("Mensagem enviada!");
          carregarHistorico();
        }
      } else {
        if (selecionados.length === 0) {
          toast.error("Selecione ao menos 1 cliente");
          return;
        }
        const alvos = clientes.filter((c) => selecionados.includes(c.id) && c.telefone);
        if (alvos.length === 0) {
          toast.error("Nenhum cliente selecionado tem telefone");
          return;
        }
        let okComDoc = 0;
        let okSemDoc = 0;
        let fail = 0;
        const base64 = arquivo ? await fileToBase64(arquivo) : undefined;
        for (const c of alvos) {
          const r = await enviarUm(c, base64);
          if (!r.ok) fail++;
          else if (!r.docOk) okSemDoc++;
          else okComDoc++;
        }
        if (okSemDoc > 0) {
          toast.warning(
            `Envios concluídos: ${okComDoc + okSemDoc} ok (${okSemDoc} SEM o documento), ${fail} falhas`,
            { duration: 8000 }
          );
        } else {
          toast.success(`Envios concluídos: ${okComDoc} ok, ${fail} falhas`);
        }
        carregarHistorico();
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro";
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  }

  const histFiltrado = historico.filter((h) => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (
      h.telefone.includes(q) ||
      h.mensagem.toLowerCase().includes(q) ||
      h.tipo.toLowerCase().includes(q)
    );
  });

  const nomeCliente = (id: string | null) =>
    clientes.find((c) => c.id === id)?.nome_empresa ?? "—";

  const clientesFiltrados = clientes.filter(
    (c) => c.nome_empresa.toLowerCase().includes(filtroClientes.toLowerCase())
  );

  return (
    <div className="w-full space-y-6 p-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold">Mensagens</h1>
          <p className="text-muted-foreground">
            Envio de WhatsApp — individual ou em massa, com anexo de boleto
          </p>
        </div>
      </motion.div>

      <Tabs defaultValue="enviar" className="w-full">
        <TabsList>
          <TabsTrigger value="enviar">
            <Send className="mr-2 h-4 w-4" /> Enviar
          </TabsTrigger>
          <TabsTrigger value="historico">
            <History className="mr-2 h-4 w-4" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="enviar" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" /> Nova mensagem
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Modo */}
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant={modo === "individual" ? "default" : "outline"} onClick={() => setModo("individual")}>
                    <User className="mr-2 h-4 w-4" /> Individual
                  </Button>
                  <Button type="button" variant={modo === "massa" ? "default" : "outline"} onClick={() => setModo("massa")}>
                    <Users className="mr-2 h-4 w-4" /> Em massa
                  </Button>
                </div>

                {/* Tipo */}
                <div className="grid grid-cols-3 gap-2">
                  <Button type="button" variant={tipo === "avulsa" ? "default" : "outline"} onClick={() => setTipo("avulsa")}>
                    <MessageSquare className="mr-2 h-4 w-4" /> Avulsa
                  </Button>
                  <Button type="button" variant={tipo === "boleto" ? "default" : "outline"} onClick={() => setTipo("boleto")}>
                    <Receipt className="mr-2 h-4 w-4" /> Boleto
                  </Button>
                  <Button type="button" variant={tipo === "contrato" ? "default" : "outline"} onClick={() => setTipo("contrato")}>
                    <FileText className="mr-2 h-4 w-4" /> Contrato
                  </Button>
                </div>

                {modo === "individual" ? (
                  <>
                    <div>
                      <Label>Cliente (opcional)</Label>
                      <Select value={clienteId} onValueChange={setClienteId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um cliente" />
                        </SelectTrigger>
                        <SelectContent>
                          {clientes.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome_empresa}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Telefone (com DDD)</Label>
                      <Input
                        value={telefone}
                        onChange={(e) => setTelefone(e.target.value)}
                        placeholder="(11) 91234-5678"
                      />
                    </div>
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Clientes ({selecionados.length} selecionados)</Label>
                      <div className="flex gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={selecionarTodos}>
                          Selecionar todos
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={limparSelecao}>
                          Limpar
                        </Button>
                      </div>
                    </div>
                    <Input
                      placeholder="Filtrar..."
                      value={filtroClientes}
                      onChange={(e) => setFiltroClientes(e.target.value)}
                    />
                    <ScrollArea className="h-56 rounded-md border p-2">
                      <div className="space-y-1">
                        {clientesFiltrados.map((c) => (
                          <label
                            key={c.id}
                            className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-muted"
                          >
                            <Checkbox
                              checked={selecionados.includes(c.id)}
                              onCheckedChange={() => toggleSelecionado(c.id)}
                              disabled={!c.telefone}
                            />
                            <span className="flex-1 text-sm">{c.nome_empresa}</span>
                            <span className="text-xs text-muted-foreground">
                              {c.telefone || "sem telefone"}
                            </span>
                          </label>
                        ))}
                      </div>
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground">
                      Use <code>{"{nome}"}</code> na mensagem para personalizar com o nome de cada cliente.
                    </p>
                  </div>
                )}

                {/* Anexo de boleto */}
                {tipo === "boleto" && (
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    <Label className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4" /> Anexar boleto
                    </Label>

                    {pagamentosCliente.length > 0 && (
                      <div>
                        <Label className="text-xs">Selecionar do sistema (Pagamentos)</Label>
                        <Select value={pagamentoSelecionado} onValueChange={aplicarPagamento}>
                          <SelectTrigger>
                            <SelectValue placeholder="Escolha um pagamento..." />
                          </SelectTrigger>
                          <SelectContent>
                            {pagamentosCliente.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.tipo} • {new Date(p.data_vencimento + "T00:00:00").toLocaleDateString("pt-BR")} • R$ {Number(p.valor_final).toFixed(2)} • {p.status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    <div>
                      <Label className="text-xs">Ou enviar PDF (upload)</Label>
                      <Input
                        type="file"
                        accept="application/pdf,image/*"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(f);
                        }}
                      />
                      {arquivoUrl && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          ✓ {arquivoNome}{" "}
                          <button
                            type="button"
                            className="underline"
                            onClick={() => setArquivo(null)}
                          >
                            remover
                          </button>
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {(tipo === "boleto" || tipo === "contrato") && (
                  <div>
                    <Label>Link manual (opcional)</Label>
                    <Input
                      value={link}
                      onChange={(e) => setLink(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                )}

                <div>
                  <Label>Mensagem</Label>
                  <Textarea
                    rows={8}
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    placeholder="Digite a mensagem..."
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {mensagem.length}/4000 caracteres
                  </p>
                </div>

                <Button onClick={enviar} disabled={enviando || uploading} className="w-full">
                  <Send className="mr-2 h-4 w-4" />
                  {enviando ? "Enviando..." : modo === "massa" ? `Enviar para ${selecionados.length} cliente(s)` : "Enviar WhatsApp"}
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pré-visualização</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <Badge variant="outline">{tipo}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {modo === "individual" ? (telefone || "sem telefone") : `${selecionados.length} destinatário(s)`}
                    </span>
                  </div>
                  {arquivoUrl && (
                    <div className="mb-2 flex items-center gap-2 text-xs text-primary">
                      <Paperclip className="h-3 w-3" /> {arquivoNome}
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap font-sans text-sm">
                    {mensagem || "Sem conteúdo..."}
                  </pre>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Mensagens enviadas</span>
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Buscar..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                  />
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {histFiltrado.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  Nenhuma mensagem registrada ainda.
                </p>
              ) : (
                <div className="space-y-3">
                  {histFiltrado.map((h) => (
                    <div key={h.id} className="rounded-lg border p-3">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{h.tipo}</Badge>
                          <Badge
                            variant={
                              h.status === "enviado"
                                ? "default"
                                : h.status === "enviado_sem_anexo" || h.status === "enviado_link"
                                  ? "outline"
                                  : "destructive"
                            }
                          >
                            {h.status === "enviado_sem_anexo"
                              ? "enviado sem anexo"
                              : h.status === "enviado_link"
                                ? "enviado (link)"
                                : h.status}
                          </Badge>
                          <span className="text-sm font-medium">
                            {nomeCliente(h.cliente_id)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {h.telefone}
                          </span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(h.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
                        {h.mensagem}
                      </pre>
                      {h.erro && (
                        <p className="mt-2 text-xs text-destructive">{h.erro}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
