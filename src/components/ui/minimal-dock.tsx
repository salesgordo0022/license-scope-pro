'use client'
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Key,
  DollarSign,
  ClipboardList,
  Layers,
  Monitor,
  FileText,
  ShoppingCart,
  LogOut,
  UserCog,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface DockItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  href: string;
}

const dockItems: DockItem[] = [
  { id: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Dashboard', href: '/dashboard' },
  { id: 'clientes', icon: <Users className="w-5 h-5" />, label: 'Clientes', href: '/clientes' },
  { id: 'licencas', icon: <Key className="w-5 h-5" />, label: 'Licenças', href: '/licencas' },
  { id: 'pagamentos', icon: <DollarSign className="w-5 h-5" />, label: 'Pagamentos', href: '/pagamentos' },
  { id: 'implantacoes', icon: <ClipboardList className="w-5 h-5" />, label: 'Implantações', href: '/implantacoes' },
  { id: 'segmentos', icon: <Layers className="w-5 h-5" />, label: 'Segmentos', href: '/segmentos' },
  { id: 'sistemas', icon: <Monitor className="w-5 h-5" />, label: 'Sistemas', href: '/sistemas' },
  { id: 'contratos', icon: <FileText className="w-5 h-5" />, label: 'Contratos', href: '/contratos' },
  { id: 'revendas', icon: <ShoppingCart className="w-5 h-5" />, label: 'Revendas', href: '/revendas' },
  { id: 'usuarios', icon: <UserCog className="w-5 h-5" />, label: 'Usuários', href: '/usuarios' },
];

interface DockItemComponentProps {
  item: DockItem;
  isHovered: boolean;
  isActive: boolean;
  onHover: (id: string | null) => void;
  onClick: () => void;
}

const DockItemComponent: React.FC<DockItemComponentProps> = ({ item, isHovered, isActive, onHover, onClick }) => {
  return (
    <div className="relative group flex flex-col items-center">
      <button
        onClick={onClick}
        onMouseEnter={() => onHover(item.id)}
        onMouseLeave={() => onHover(null)}
        className={cn(
          'relative p-2.5 rounded-xl transition-all duration-300 ease-out',
          'hover:scale-125 hover:-translate-y-2',
          isActive
            ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/30'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
        )}
      >
        <div className="relative z-10 transition-transform duration-300">
          {item.icon}
        </div>
      </button>

      {/* Tooltip */}
      <div
        className={cn(
          'absolute -top-10 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all duration-200 pointer-events-none',
          'bg-popover text-popover-foreground shadow-md border border-border',
          isHovered ? 'opacity-100 -translate-y-1' : 'opacity-0 translate-y-1'
        )}
      >
        {item.label}
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
          <div className="w-2 h-2 rotate-45 bg-popover border-r border-b border-border" />
        </div>
      </div>
    </div>
  );
};

const MinimalistDock: React.FC = () => {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();

  return (
    <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-card/80 backdrop-blur-xl border border-border shadow-xl shadow-black/10">
        {dockItems.map((item) => (
          <DockItemComponent
            key={item.id}
            item={item}
            isHovered={hoveredItem === item.id}
            isActive={location.pathname === item.href}
            onHover={setHoveredItem}
            onClick={() => navigate(item.href)}
          />
        ))}

        {/* Separator */}
        <div className="w-px h-8 bg-border mx-1" />

        {/* Logout */}
        <div className="relative group flex flex-col items-center">
          <button
            onClick={signOut}
            onMouseEnter={() => setHoveredItem('logout')}
            onMouseLeave={() => setHoveredItem(null)}
            className="relative p-2.5 rounded-xl transition-all duration-300 ease-out text-muted-foreground hover:text-destructive hover:bg-destructive/10 hover:scale-125 hover:-translate-y-2"
          >
            <LogOut className="w-5 h-5" />
          </button>
          <div
            className={cn(
              'absolute -top-10 px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-all duration-200 pointer-events-none',
              'bg-popover text-popover-foreground shadow-md border border-border',
              hoveredItem === 'logout' ? 'opacity-100 -translate-y-1' : 'opacity-0 translate-y-1'
            )}
          >
            Sair
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
              <div className="w-2 h-2 rotate-45 bg-popover border-r border-b border-border" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MinimalistDock;
