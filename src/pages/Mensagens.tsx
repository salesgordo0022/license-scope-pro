import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MessageSquare, Send, FileText, Receipt, History, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Cliente {
  id: string;
  nome_empresa: string;
  telefone: string | null;
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
    `Olá ${nome}, segue o boleto referente à mensalidade do seu sistema.\n\nLink do boleto: ${link || "[cole o link aqui]"}\n\nQualquer dúvida estamos à disposição.`,
  contrato: (nome, link) =>
    `Olá ${nome}, segue o contrato para sua análise e assinatura.\n\nLink do contrato: ${link || "[cole o link aqui]"}\n\nFicamos no aguardo do retorno.`,
};

export default function Mensagens() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [historico, setHistorico] = useState<MensagemHist[]>([]);
  const [clienteId, setClienteId] = useState<string>("");
  const [tipo, setTipo] = useState<"avulsa" | "boleto" | "contrato">("avulsa");
  const [link, setLink] = useState("");
  const [telefone, setTelefone] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [busca, setBusca] = useState("");

  const cliente = useMemo(() => clientes.find((c) => c.id === clienteId), [clientes, clienteId]);

  useEffect(() => {
    carregarClientes();
    carregarHistorico();
  }, []);

  useEffect(() => {
    if (cliente) {
      setTelefone(cliente.telefone || "");
      setMensagem(TEMPLATES[tipo](cliente.nome_empresa, link));
    }
  }, [cliente, tipo, link]);

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

  async function enviar() {
    if (!telefone.trim() || telefone.replace(/\D/g, "").length < 10) {
      toast.error("Telefone inválido");
      return;
    }
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
      const { data, error } = await supabase.functions.invoke("send-whatsapp", {
        body: {
          telefone,
          mensagem,
          cliente_id: clienteId || undefined,
          tipo,
        },
      });
      if (error) throw error;
      const res = data as { success: boolean; error?: string };
      if (!res.success) {
        toast.error(res.error || "Falha ao enviar");
      } else {
        toast.success("Mensagem enviada!");
        setMensagem("");
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
            Envio de WhatsApp via Gzappy — boletos, contratos e mensagens avulsas
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
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    type="button"
                    variant={tipo === "avulsa" ? "default" : "outline"}
                    onClick={() => setTipo("avulsa")}
                  >
                    <MessageSquare className="mr-2 h-4 w-4" /> Avulsa
                  </Button>
                  <Button
                    type="button"
                    variant={tipo === "boleto" ? "default" : "outline"}
                    onClick={() => setTipo("boleto")}
                  >
                    <Receipt className="mr-2 h-4 w-4" /> Boleto
                  </Button>
                  <Button
                    type="button"
                    variant={tipo === "contrato" ? "default" : "outline"}
                    onClick={() => setTipo("contrato")}
                  >
                    <FileText className="mr-2 h-4 w-4" /> Contrato
                  </Button>
                </div>

                <div>
                  <Label>Cliente (opcional)</Label>
                  <Select value={clienteId} onValueChange={setClienteId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um cliente para preencher" />
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

                {(tipo === "boleto" || tipo === "contrato") && (
                  <div>
                    <Label>
                      Link do {tipo === "boleto" ? "boleto" : "contrato"} (cole a URL)
                    </Label>
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

                <Button onClick={enviar} disabled={enviando} className="w-full">
                  <Send className="mr-2 h-4 w-4" />
                  {enviando ? "Enviando..." : "Enviar WhatsApp"}
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
                      {telefone || "sem telefone"}
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap text-sm font-sans">
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
                            variant={h.status === "enviado" ? "default" : "destructive"}
                          >
                            {h.status}
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
