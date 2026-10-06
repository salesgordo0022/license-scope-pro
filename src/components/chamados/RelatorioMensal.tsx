import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight, Download, Loader2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  atendenteDe,
  deslocarMes,
  formatarDuracaoMin,
  intervaloMes,
  mesDe,
  paraCsv,
  resumirMes,
  serieMensal,
  solicitantesDoMes,
  type Solicitante,
  type ChamadoResumo,
  type LinhaContagem,
} from '@/lib/chamadosResumo';

type ChamadoRelatorio = ChamadoResumo & { contato_nome: string | null; contato_id: string | null; canal_nome: string | null; assunto: string | null };

const COLUNAS = 'id, origem, status, created_at, primeira_resposta_em, resolvido_em, dono_id, responsavel_id, cliente_id, contato_nome, contato_id, canal_nome, assunto';
const MESES_SERIE = 6;
const ORIGENS: Record<string, string> = { slack: 'Slack', zapcontabil: 'WhatsApp' };

const nomeMes = (mes: string) => format(intervaloMes(mes).inicio, "MMMM 'de' yyyy", { locale: ptBR });
const mesCurto = (mes: string) => format(intervaloMes(mes).inicio, 'MMM/yy', { locale: ptBR });

/**
 * Relatório mensal dos chamados: quantos chegaram, quantos foram resolvidos,
 * quantos seguem em aberto,
 * tempo de 1ª resposta e de resolução, e a divisão por atendente, cliente e
 * origem. Cada usuário vê os números dos chamados que enxerga (admin: todos).
 */
export function RelatorioMensal({
  aberta,
  onFechar,
  usuarios,
  clientes,
}: {
  aberta: boolean;
  onFechar: () => void;
  usuarios: { id: string; nome: string | null; email: string | null }[];
  clientes: { id: string; nome_empresa: string }[];
}) {
  const [mes, setMes] = useState(() => mesDe(new Date()));
  const [dados, setDados] = useState<ChamadoRelatorio[]>([]);
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!aberta) return;
    let cancelado = false;
    (async () => {
      setCarregando(true);
      const desde = intervaloMes(deslocarMes(mes, -(MESES_SERIE - 1))).inicio.toISOString();
      // Criados na janela da série + pendentes mais antigos (para o "pendentes no fim do mês").
      const [janela, antigos] = await Promise.all([
        supabase.from('chamados').select(COLUNAS).gte('created_at', desde).limit(20000),
        supabase.from('chamados').select(COLUNAS).lt('created_at', desde).or(`resolvido_em.is.null,resolvido_em.gte.${desde}`).limit(20000),
      ]);
      if (cancelado) return;
      setCarregando(false);
      if (janela.error || antigos.error) {
        toast.error('Não foi possível carregar o relatório', { description: (janela.error || antigos.error)?.message });
        return;
      }
      setDados([...(janela.data || []), ...(antigos.data || [])] as ChamadoRelatorio[]);
    })();
    return () => {
      cancelado = true;
    };
  }, [aberta, mes]);

  const resumo = useMemo(() => resumirMes(dados, mes), [dados, mes]);
  const pedemSlack = useMemo(() => solicitantesDoMes(dados, mes, 'slack'), [dados, mes]);
  const pedemZap = useMemo(() => solicitantesDoMes(dados, mes, 'zapcontabil'), [dados, mes]);
  const serie = useMemo(() => serieMensal(dados, mes, MESES_SERIE).map((s) => ({ ...s, rotulo: mesCurto(s.mes) })), [dados, mes]);

  const nomeUsuario = (id: string | null) => {
    if (!id) return 'Sem atendente';
    const u = usuarios.find((x) => x.id === id);
    return u?.nome || u?.email || 'Usuário removido';
  };
  const nomeCliente = (id: string | null) => (id ? clientes.find((c) => c.id === id)?.nome_empresa || 'Cliente removido' : 'Sem cliente vinculado');

  const exportar = () => {
    const { inicio, fim } = intervaloMes(mes);
    const doMes = dados
      .filter((c) => {
        const t = new Date(c.created_at).getTime();
        return t >= inicio.getTime() && t < fim.getTime();
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const dataHora = (iso: string | null) => (iso ? format(parseISO(iso), 'dd/MM/yyyy HH:mm') : '');
    const csv = paraCsv([
      ['Aberto em', 'Origem', 'Canal', 'Contato', 'Assunto', 'Cliente', 'Atendente', 'Status', '1ª resposta em', 'Resolvido em'],
      ...doMes.map((c) => [
        dataHora(c.created_at),
        ORIGENS[c.origem] || c.origem,
        c.canal_nome,
        c.contato_nome,
        c.assunto,
        c.cliente_id ? nomeCliente(c.cliente_id) : '',
        nomeUsuario(atendenteDe(c)),
        c.status,
        dataHora(c.primeira_resposta_em),
        dataHora(c.resolvido_em),
      ]),
    ]);
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `chamados-${mes}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const Tabela = ({ titulo, linhas, nome }: { titulo: string; linhas: LinhaContagem[]; nome: (k: string | null) => string }) => (
    <div className="rounded-xl border">
      <p className="border-b px-3 py-2 text-sm font-semibold">{titulo}</p>
      {linhas.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">Nada neste mês</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th className="px-3 py-1.5 text-left font-medium" />
              <th className="px-3 py-1.5 text-right font-medium">Em aberto</th>
              <th className="px-3 py-1.5 text-right font-medium">Resolvidos</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.chave ?? '-'} className="border-t border-border/50">
                <td className="max-w-[220px] truncate px-3 py-1.5">{nome(l.chave)}</td>
                <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${l.emAberto > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{l.emAberto}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-emerald-600">{l.resolvidos}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );

  const QuemMaisPede = ({ titulo, cor, linhas, rotuloPessoa }: { titulo: string; cor: string; linhas: Solicitante[]; rotuloPessoa: string }) => {
    const total = linhas.reduce((s, l) => s + l.abertos, 0);
    return (
      <div className="rounded-xl border">
        <p className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
          <span className={`h-2.5 w-2.5 rounded-full ${cor}`} /> {titulo}
          <span className="ml-auto text-xs font-normal text-muted-foreground">{linhas.length} pessoa(s) · {total} chamado(s)</span>
        </p>
        {linhas.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">Ninguém abriu chamado neste mês</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="text-[11px] text-muted-foreground">
                  <th className="w-8 px-3 py-1.5 text-left font-medium">#</th>
                  <th className="px-3 py-1.5 text-left font-medium">{rotuloPessoa}</th>
                  <th className="px-3 py-1.5 text-left font-medium">Onde pediu</th>
                  <th className="px-3 py-1.5 text-right font-medium">Chamados</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={l.chave} className="border-t border-border/50 align-top">
                    <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{i + 1}</td>
                    <td className="max-w-[180px] truncate px-3 py-1.5 font-medium">{l.nome}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      {l.canais.map((c) => `${c.canal} (${c.abertos})`).join(' · ')}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                      {l.abertos}
                      <span className="ml-1 text-[10px] font-normal text-muted-foreground">{Math.round((l.abertos / total) * 100)}%</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  const cartoes = [
    {
      rotulo: mes >= mesDe(new Date()) ? 'Em aberto agora' : 'Em aberto no fim do mês',
      valor: String(resumo.emAberto),
      cor: resumo.emAberto > 0 ? 'text-amber-600' : 'text-emerald-600',
      dica: 'Chamados não resolvidos (inclui os que chegaram em meses anteriores). Resolver tira daqui.',
    },
    { rotulo: 'Em aberto sem resposta', valor: String(resumo.semResposta), cor: resumo.semResposta > 0 ? 'text-red-500' : undefined, dica: 'Em aberto que ninguém respondeu ainda' },
    { rotulo: 'Mais antigo em aberto', valor: resumo.maisAntigoEmAbertoMin === null ? '—' : formatarDuracaoMin(resumo.maisAntigoEmAbertoMin), dica: 'Há quanto tempo o chamado pendente mais velho espera' },
    { rotulo: 'Resolvidos no mês', valor: String(resumo.resolvidos), cor: 'text-emerald-600' },
    { rotulo: '1ª resposta (mediana)', valor: formatarDuracaoMin(resumo.medianaPrimeiraRespostaMin) },
    { rotulo: 'Resolução (mediana)', valor: formatarDuracaoMin(resumo.medianaResolucaoHoras === null ? null : resumo.medianaResolucaoHoras * 60) },
  ];

  const mesAtual = mesDe(new Date());

  return (
    <Dialog open={aberta} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chamados por mês</DialogTitle>
          <DialogDescription>
            O que está pendente: chamados ainda não resolvidos. O que já foi resolvido não conta como pendente.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setMes((m) => deslocarMes(m, -1))} title="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[170px] text-center font-semibold capitalize">{nomeMes(mes)}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" disabled={mes >= mesAtual} onClick={() => setMes((m) => deslocarMes(m, 1))} title="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </Button>
            {carregando && <Loader2 className="ml-2 h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
          <Button variant="outline" className="gap-2" onClick={exportar} disabled={carregando || resumo.recebidos === 0}>
            <Download className="h-4 w-4" /> Exportar CSV
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {cartoes.map((c: { rotulo: string; valor: string; cor?: string; dica?: string }) => (
            <div key={c.rotulo} className="rounded-xl border p-3" title={c.dica}>
              <p className="text-[11px] text-muted-foreground">{c.rotulo}</p>
              <p className={`text-2xl font-bold tabular-nums ${c.cor ?? ''}`}>{c.valor}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border">
          <p className="flex items-center gap-2 border-b px-3 py-2 text-sm font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Chamados em aberto
            <span className="ml-auto text-xs font-normal text-muted-foreground">do mais antigo para o mais novo</span>
          </p>
          {resumo.listaEmAberto.length === 0 ? (
            <p className="px-3 py-5 text-center text-sm text-emerald-600">Nenhum chamado pendente. Tudo resolvido!</p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card">
                  <tr className="text-[11px] text-muted-foreground">
                    <th className="px-3 py-1.5 text-left font-medium">Contato</th>
                    <th className="px-3 py-1.5 text-left font-medium">Onde</th>
                    <th className="px-3 py-1.5 text-left font-medium">Com quem</th>
                    <th className="px-3 py-1.5 text-right font-medium">Esperando há</th>
                  </tr>
                </thead>
                <tbody>
                  {(resumo.listaEmAberto as ChamadoRelatorio[]).map((c) => (
                    <tr
                      key={c.id}
                      className="cursor-pointer border-t border-border/50 hover:bg-muted/50"
                      title="Abrir a conversa"
                      onClick={() => {
                        onFechar();
                        navigate(`/chamados?chamado=${c.id}`);
                      }}
                    >
                      <td className="max-w-[200px] px-3 py-1.5">
                        <span className="block truncate font-medium">{c.contato_nome || c.contato_id || 'Contato'}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{c.assunto}</span>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">
                        {ORIGENS[c.origem] || c.origem}
                        {c.canal_nome ? ` · ${c.canal_nome}` : ''}
                        {!c.primeira_resposta_em && <span className="ml-1 rounded bg-red-50 px-1 text-[10px] text-red-600">sem resposta</span>}
                      </td>
                      <td className="px-3 py-1.5 text-xs">{nomeUsuario(atendenteDe(c))}</td>
                      <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums text-amber-600">
                        {formatarDuracaoMin((Math.min(Date.now(), intervaloMes(mes).fim.getTime()) - new Date(c.created_at).getTime()) / 60000)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="rounded-xl border p-3">
          <p className="mb-2 text-sm font-semibold">Últimos {MESES_SERIE} meses</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie} margin={{ left: -20, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="rotulo" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="emAberto" name="Em aberto (fim do mês)" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={30} />
                <Bar dataKey="resolvidos" name="Resolvidos" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <QuemMaisPede titulo="Quem mais pediu no Slack (mês)" cor="bg-[#4A154B]" linhas={pedemSlack} rotuloPessoa="Pessoa" />
          <QuemMaisPede titulo="Quem mais pediu no WhatsApp (mês)" cor="bg-[#25D366]" linhas={pedemZap} rotuloPessoa="Contato" />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Tabela titulo="Por atendente" linhas={resumo.porAtendente} nome={nomeUsuario} />
          <Tabela titulo="Por cliente" linhas={resumo.porCliente} nome={nomeCliente} />
          <Tabela titulo="Por origem" linhas={resumo.porOrigem} nome={(k) => ORIGENS[k ?? ''] || k || '—'} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
