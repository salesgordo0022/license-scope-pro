import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Users,
  Key,
  ShoppingCart,
  LogOut,
  ChevronLeft,
  Menu,
  DollarSign,
  Layers,
  Monitor,
  ClipboardList,
  FileText,
  UserCog,
  MessageSquare,
  Map as MapIcon,
  FolderOpen,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Clientes', href: '/clientes', icon: Users },
  { name: 'Licenças', href: '/licencas', icon: Key },
  { name: 'Pagamentos', href: '/pagamentos', icon: DollarSign },
  { name: 'Implantações', href: '/implantacoes', icon: ClipboardList },
  { name: 'Segmentos', href: '/segmentos', icon: Layers },
  { name: 'Sistemas', href: '/sistemas', icon: Monitor },
  { name: 'Contratos', href: '/contratos', icon: FileText },
  { name: 'Revendas', href: '/revendas', icon: ShoppingCart },
  { name: 'Rotas & GPS', href: '/rotas', icon: MapIcon },
  { name: 'Mensagens', href: '/mensagens', icon: MessageSquare },
  { name: 'Pasta de Boletos', href: '/pasta-boletos', icon: FolderOpen },
  { name: 'Usuários', href: '/usuarios', icon: UserCog },
];

interface AppSidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AppSidebar({ collapsed: controlledCollapsed, onToggleCollapse }: AppSidebarProps = {}) {
  const location = useLocation();
  const { profile, signOut } = useAuth();
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = controlledCollapsed ?? internalCollapsed;
  const toggleCollapse = onToggleCollapse ?? (() => setInternalCollapsed(!internalCollapsed));

  return (
    <motion.aside
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      data-collapsed={collapsed}
      className={cn(
        'peer fixed left-0 top-0 z-40 h-screen bg-sidebar transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-20 items-center justify-between border-b border-sidebar-border px-4 py-2">
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 overflow-hidden"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white overflow-hidden p-1 shadow-sm">
                <img 
                  src="/logo.png" 
                  alt="Logo" 
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = "https://fars-api.pocaweb.com.br/f99ce3aec60e45488a2b9e80f87b303a.png";
                  }}
                />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold leading-none text-sidebar-foreground">Imperial</span>
                <span className="text-[10px] font-medium text-sidebar-muted uppercase tracking-tighter">Tech</span>
              </div>
            </motion.div>
          )}
          {collapsed && (
            <div className="flex h-10 w-10 mx-auto items-center justify-center rounded-lg bg-white overflow-hidden p-1 shadow-sm">
               <img 
                  src="/logo.png" 
                  alt="Logo" 
                  className="h-full w-full object-contain"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.src = "https://fars-api.pocaweb.com.br/f99ce3aec60e45488a2b9e80f87b303a.png";
                  }}
                />
            </div>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapse}
              className="h-8 w-8 text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground ml-1"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 px-2 py-4">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={cn(
                  'sidebar-item',
                  isActive && 'sidebar-item-active'
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="truncate"
                  >
                    {item.name}
                  </motion.span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-sidebar-border p-4">
          {!collapsed && profile && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-3"
            >
              <p className="text-sm font-medium text-sidebar-foreground truncate">
                {profile.nome || 'Usuário'}
              </p>
              <p className="text-xs text-sidebar-muted truncate">{profile.email}</p>
              <span className="mt-1 inline-block rounded-full bg-sidebar-primary/20 px-2 py-0.5 text-xs text-sidebar-primary">
                {profile.tipo}
              </span>
            </motion.div>
          )}
          <button
            onClick={signOut}
            className={cn(
              'sidebar-item w-full text-sidebar-muted hover:text-destructive',
              collapsed && 'justify-center'
            )}
          >
            <LogOut className="h-5 w-5" />
            {!collapsed && <span>Sair</span>}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
