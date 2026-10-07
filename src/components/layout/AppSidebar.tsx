import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutGrid,
  Inbox,
  Forum as ForumIcone,
  Users,
  KeyRound,
  ShoppingCart,
  LogOut,
  ChevronLeft,
  DollarSign,
  Layers,
  Monitor,
  ClipboardList,
  ShieldCheck,
  Tags,
  FileText,
  UserCog,
  MessageSquare,
  Map as MapIcon,
  FolderOpen,
  Zap,
} from '@/components/icons';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ImperTechLogo } from '@/components/brand/ImperTechLogo';

/**
 * Itens do menu lateral.
 *
 * `adminOnly` esconde o item de quem não é admin. Isso é conveniência de
 * interface, não controle de acesso: a autorização de verdade está na própria
 * página (`Usuarios.tsx` bloqueia com `if (!isAdmin)`) e nas policies de RLS.
 */
const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutGrid },
  { name: 'Chamados', href: '/chamados', icon: Inbox },
  { name: 'Fórum', href: '/forum', icon: ForumIcone },
  { name: 'Assistente IA', href: '/ia', icon: Zap },
  { name: 'Clientes', href: '/clientes', icon: Users },
  { name: 'Licenças', href: '/licencas', icon: KeyRound },
  { name: 'Pagamentos', href: '/pagamentos', icon: DollarSign },
  { name: 'Implantações', href: '/implantacoes', icon: ClipboardList },
  { name: 'Segmentos', href: '/segmentos', icon: Layers },
  { name: 'Sistemas', href: '/sistemas', icon: Monitor },
  { name: 'Contratos', href: '/contratos', icon: FileText },
  { name: 'Planos e Preços', href: '/planos', icon: Tags },
  { name: 'Revendas', href: '/revendas', icon: ShoppingCart },
  { name: 'Rotas & GPS', href: '/rotas', icon: MapIcon },
  { name: 'Mensagens', href: '/mensagens', icon: MessageSquare },
  { name: 'Pasta de Boletos', href: '/pasta-boletos', icon: FolderOpen },
  { name: 'Usuários', href: '/usuarios', icon: UserCog, adminOnly: true },
  { name: 'Segurança', href: '/seguranca', icon: ShieldCheck },
];

interface AppSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

/**
 * Menu lateral fixo do painel: logo, navegação e logout. A identificação do
 * usuário fica na barra superior (`TopBar`).
 * Pode ser controlado de fora (`collapsed` + `onToggleCollapse`) ou gerenciar o
 * próprio estado de recolhido quando usado sem props.
 */
export function AppSidebar({ collapsed: controlledCollapsed, onToggleCollapse }: AppSidebarProps = {}) {
  const location = useLocation();
  const { signOut, isAdmin: ehAdmin } = useAuth();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const toggleCollapse = onToggleCollapse ?? (() => setInternalCollapsed(!internalCollapsed));

  // Mensagens não lidas dos chamados em aberto (selo no item "Chamados").
  const [naoLidas, setNaoLidas] = useState(0);
  useEffect(() => {
    const contar = () =>
      supabase
        .from('chamados')
        .select('nao_lidas')
        .not('status', 'in', '(resolvido,dispensado)')
        .gt('nao_lidas', 0)
        .then(({ data, error }) => {
          if (!error) setNaoLidas((data || []).reduce((s, c) => s + (c.nao_lidas || 0), 0));
        });
    contar();
    const canal = supabase
      .channel('chamados-menu')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chamados' }, contar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      data-collapsed={collapsed}
      className={cn(
        'peer fixed left-0 top-0 z-40 h-screen overflow-hidden bg-gradient-to-b from-[#0B1A3D] via-[#0C1C42] to-[#081433] transition-all duration-300 dark:border-r dark:border-white/5 dark:from-[#071230] dark:via-[#081433] dark:to-[#050C22]',
        collapsed ? 'w-[4.5rem]' : 'w-64'
      )}
    >
      {/* Faixas diagonais decorativas no rodapé do menu */}
      <div className="pointer-events-none absolute -bottom-10 -left-16 h-48 w-80 rotate-[-28deg] bg-gradient-to-r from-[#1E4FD8]/40 to-transparent" />
      <div className="pointer-events-none absolute -bottom-20 left-10 h-40 w-72 rotate-[-28deg] bg-gradient-to-r from-[#2F7BF5]/25 to-transparent" />

      <div className="relative flex h-full flex-col">
        {/* Logo */}
        <div className={cn('flex h-20 items-center px-5', collapsed ? 'justify-center px-0' : 'justify-between')}>
          <button
            type="button"
            onClick={collapsed ? toggleCollapse : undefined}
            className={cn(!collapsed && 'cursor-default')}
            title={collapsed ? 'Expandir menu' : undefined}
          >
            <ImperTechLogo tom="escuro" soSimbolo={collapsed} tamanho="h-9 w-9" textoClassName="text-[26px]" />
          </button>
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapse}
              title="Recolher menu"
              className="h-8 w-8 text-sidebar-muted hover:bg-white/10 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navigation
            .filter((item) => !item.adminOnly || ehAdmin)
            .map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <NavLink
                key={item.name}
                to={item.href}
                title={collapsed ? item.name : undefined}
                className={cn(
                  'sidebar-item',
                  collapsed && 'justify-center px-0',
                  isActive && 'sidebar-item-active'
                )}
              >
                <span className="relative">
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {item.href === '/chamados' && naoLidas > 0 && collapsed && (
                    <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-[#0B1A3D]" />
                  )}
                </span>
                {!collapsed && <span className="truncate">{item.name}</span>}
                {!collapsed && item.href === '/chamados' && naoLidas > 0 && (
                  <span className="ml-auto rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                    {naoLidas > 99 ? '99+' : naoLidas}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Rodapé */}
        <div className="px-4 pb-6 pt-3">
          <button
            onClick={signOut}
            title="Sair"
            className={cn(
              'sidebar-item w-full text-sidebar-muted hover:text-red-300',
              collapsed && 'justify-center px-0'
            )}
          >
            <LogOut className="h-5 w-5" />
            {!collapsed && <span>Sair</span>}
          </button>
          {!collapsed && (
            <p className="mt-4 px-3.5 text-sm leading-snug text-sidebar-muted">
              Tecnologia e gestão
              <br />
              para o seu negócio.
            </p>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
