import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, LogOut, Search, ShieldCheck, UserCog, User, KeyRound, Receipt, Plus, Users, ClipboardList, FileText, Inbox } from '@/components/icons';
import { Switch } from '@/components/ui/switch';
import { useAvisosGlobais } from '@/hooks/use-avisos-globais';
import { useLembretes } from '@/hooks/use-lembretes';
import {
  avisarNoSistema,
  definirNotificacoesLigadas,
  notificacoesLigadas,
  pedirPermissao,
  permissaoAtual,
  type PermissaoNotificacao,
} from '@/lib/notificacoesSistema';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AlternarTema } from '@/components/layout/AlternarTema';
import { dataLocalIso } from '@/lib/utils';

interface ComCliente {
  clientes: { nome_empresa: string } | null;
}

const ROTULO_PAPEL: Record<string, string> = {
  super_admin: 'Super Administrador',
  admin: 'Administrador',
  revendedor: 'Revendedor',
};

interface Alerta {
  id: string;
  tipo: 'licenca' | 'boleto';
  titulo: string;
  detalhe: string;
}

const dataBr = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR');

/**
 * Barra superior das telas autenticadas: busca global (abre a tela de clientes
 * já filtrada), sino com mensagens novas dos Chamados, licenças a vencer e
 * boletos atrasados, e o menu do usuário com atalhos de conta e logout.
 *
 * O sino também liga os avisos do sistema operacional (fora do navegador):
 * mensagens novas dos Chamados na hora e um resumo diário de boletos/licenças.
 */
export function TopBar() {
  const navigate = useNavigate();
  const { profile, signOut, isAdmin } = useAuth();
  const [busca, setBusca] = useState('');
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const naoLidas = useAvisosGlobais();
  const lembretes = useLembretes();
  const [permissao, setPermissao] = useState<PermissaoNotificacao>(permissaoAtual);
  const [ligadas, setLigadas] = useState(notificacoesLigadas);
  const avisosAtivos = permissao === 'granted' && ligadas;

  const alternarAvisos = async (ligar: boolean) => {
    if (!ligar) {
      definirNotificacoesLigadas(false);
      setLigadas(false);
      return;
    }
    const p = await pedirPermissao();
    setPermissao(p);
    if (p === 'granted') {
      definirNotificacoesLigadas(true);
      setLigadas(true);
      avisarNoSistema({ titulo: 'Avisos ligados', corpo: 'Você vai receber os avisos do ImperTech aqui, mesmo com o navegador em segundo plano.', tag: 'teste-avisos', naoRepetirPorMs: 1000 });
    } else if (p === 'denied') {
      toast.error('O navegador bloqueou os avisos', {
        description: 'Clique no cadeado ao lado do endereço do site → Notificações → Permitir, e recarregue a página.',
      });
    } else if (p === 'indisponivel') {
      toast.error('Este navegador não suporta avisos na área de trabalho');
    }
  };

  useEffect(() => {
    const carregarAlertas = async () => {
      const hoje = new Date();
      const hojeIso = dataLocalIso(hoje);
      const em30 = new Date(hoje);
      em30.setDate(em30.getDate() + 30);

      const [{ data: lics }, { data: pags }] = await Promise.all([
        supabase
          .from('licencas')
          .select('id, tipo, validade, clientes(nome_empresa)')
          .eq('status', 'ativo')
          .not('validade', 'is', null)
          .lte('validade', dataLocalIso(em30))
          .order('validade')
          .limit(10),
        supabase
          .from('pagamentos')
          .select('id, valor_final, data_vencimento, status, clientes(nome_empresa)')
          .in('status', ['pendente', 'atrasado'])
          .lt('data_vencimento', hojeIso)
          .order('data_vencimento')
          .limit(10),
      ]);

      setAlertas([
        ...((lics || []) as unknown as (ComCliente & { id: string; tipo: string; validade: string })[]).map((l) => ({
          id: `l-${l.id}`,
          tipo: 'licenca' as const,
          titulo: `Licença ${l.tipo} ${l.validade < hojeIso ? 'venceu' : 'vence'} em ${dataBr(l.validade)}`,
          detalhe: l.clientes?.nome_empresa || 'Cliente',
        })),
        ...((pags || []) as unknown as (ComCliente & { id: string; valor_final: number; data_vencimento: string })[]).map((p) => ({
          id: `p-${p.id}`,
          tipo: 'boleto' as const,
          titulo: `Boleto vencido em ${dataBr(p.data_vencimento)} · ${Number(p.valor_final).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
          detalhe: p.clientes?.nome_empresa || 'Cliente',
        })),
      ]);
    };
    carregarAlertas().catch((e) => console.error('Erro ao carregar alertas:', e));
  }, []);

  // Resumo de boletos/licenças no sistema operacional: uma vez por dia.
  useEffect(() => {
    if (!avisosAtivos || alertas.length === 0) return;
    const boletos = alertas.filter((a) => a.tipo === 'boleto').length;
    const licencas = alertas.length - boletos;
    const partes = [boletos && `${boletos} boleto(s) vencido(s)`, licencas && `${licencas} licença(s) vencendo`].filter(Boolean);
    avisarNoSistema(
      { titulo: 'Pendências do dia', corpo: partes.join(' · '), tag: `pendencias-${dataLocalIso(new Date())}`, url: boletos ? '/pagamentos' : '/licencas', naoRepetirPorMs: 24 * 3600 * 1000 },
      navigate,
    );
  }, [avisosAtivos, alertas, navigate]);

  const totalSino = alertas.length + (naoLidas > 0 ? 1 : 0) + lembretes.length;

  const pesquisar = (e: React.FormEvent) => {
    e.preventDefault();
    const termo = busca.trim();
    navigate(termo ? `/clientes?busca=${encodeURIComponent(termo)}` : '/clientes');
  };

  return (
    <header className="sticky top-0 z-30 flex h-[72px] items-center gap-4 border-b border-border/60 bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <form onSubmit={pesquisar} className="relative w-full max-w-3xl flex-1">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente, CNPJ, sistema ou segmento..."
          className="h-11 w-full rounded-xl border border-transparent bg-muted pl-11 pr-4 text-sm outline-none transition placeholder:text-muted-foreground/80 focus:border-primary/40 focus:bg-background"
        />
      </form>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Atalhos de criação: abrem a tela já com o formulário de "novo". */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="hidden h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 md:inline-flex">
              <Plus className="h-4 w-4" /> Novo
              <ChevronDown className="h-3.5 w-3.5 opacity-80" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => navigate('/clientes?novo=1')}>
              <Users className="mr-2 h-4 w-4" /> Novo cliente
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/licencas?novo=1')}>
              <KeyRound className="mr-2 h-4 w-4" /> Nova licença
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/implantacoes?novo=1')}>
              <ClipboardList className="mr-2 h-4 w-4" /> Nova implantação
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate('/contratos?novo=1')}>
              <FileText className="mr-2 h-4 w-4" /> Novo contrato
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlternarTema />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition hover:bg-muted" title="Notificações">
              <Bell className="h-5 w-5" />
              {totalSino > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-background">
                  {totalSino > 9 ? '9+' : totalSino}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notificações</DropdownMenuLabel>
            <div className="mx-2 mb-1 flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2">
              <span className="min-w-0">
                <span className="block text-xs font-semibold">Avisos na área de trabalho</span>
                <span className="block text-[11px] leading-snug text-muted-foreground">
                  {permissao === 'denied'
                    ? 'Bloqueado no navegador: libere no cadeado ao lado do endereço'
                    : avisosAtivos
                      ? 'Ligado: aparecem mesmo fora do navegador'
                      : 'Receba os avisos mesmo com o sistema em segundo plano'}
                </span>
              </span>
              <Switch checked={avisosAtivos} onCheckedChange={alternarAvisos} disabled={permissao === 'indisponivel'} />
            </div>
            <DropdownMenuSeparator />
            {lembretes.map((l) => (
              <DropdownMenuItem key={l.id} className="items-start gap-3 py-2" onClick={() => navigate(`/chamados?abrir=${l.chamado_id}`)}>
                <span className="mt-0.5 rounded-lg bg-red-100 p-1.5 text-red-600">
                  <Bell className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug">Lembrete de chamado</span>
                  <span className="line-clamp-2 block text-xs text-muted-foreground">{l.texto}</span>
                </span>
              </DropdownMenuItem>
            ))}
            {naoLidas > 0 && (
              <DropdownMenuItem className="items-start gap-3 py-2" onClick={() => navigate('/chamados')}>
                <span className="mt-0.5 rounded-lg bg-blue-100 p-1.5 text-blue-600">
                  <Inbox className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug">
                    {naoLidas} mensage{naoLidas === 1 ? 'm' : 'ns'} não lida{naoLidas === 1 ? '' : 's'} nos Chamados
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">Slack e WhatsApp</span>
                </span>
              </DropdownMenuItem>
            )}
            {alertas.length === 0 && naoLidas === 0 && lembretes.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nenhum alerta no momento.</p>
            ) : (
              alertas.map((a) => (
                <DropdownMenuItem
                  key={a.id}
                  className="items-start gap-3 py-2"
                  onClick={() => navigate(a.tipo === 'licenca' ? '/licencas' : '/pagamentos')}
                >
                  <span className={`mt-0.5 rounded-lg p-1.5 ${a.tipo === 'licenca' ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'}`}>
                    {a.tipo === 'licenca' ? <KeyRound className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium leading-snug">{a.titulo}</span>
                    <span className="block truncate text-xs text-muted-foreground">{a.detalhe}</span>
                  </span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-3 rounded-xl py-1.5 pl-1.5 pr-2 transition hover:bg-muted">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#14223B] text-white">
                <User className="h-5 w-5" />
              </span>
              <span className="hidden text-left sm:block">
                <span className="block text-sm font-semibold leading-tight">{profile?.nome || 'Usuário'}</span>
                <span className="block text-xs text-muted-foreground">{ROTULO_PAPEL[profile?.tipo || ''] || profile?.tipo}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-sm font-semibold">{profile?.nome || 'Usuário'}</span>
              <span className="block truncate text-xs text-muted-foreground">{profile?.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/seguranca')}>
              <ShieldCheck className="mr-2 h-4 w-4" /> Segurança da conta
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => navigate('/usuarios')}>
                <UserCog className="mr-2 h-4 w-4" /> Usuários
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={signOut} className="text-red-600 focus:text-red-600">
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
