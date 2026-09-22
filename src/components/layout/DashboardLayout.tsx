import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from '@/components/layout/AppSidebar';
import TetrisLoading from '@/components/ui/tetris-loader';
import { useState } from 'react';
import { DesafioMfa } from '@/components/auth/DesafioMfa';

/**
 * Moldura das telas autenticadas: sidebar + área de conteúdo.
 *
 * Também é o guarda de rota — sem sessão, redireciona para /login. Isso é
 * proteção de navegação, não de dados: quem chamasse a API direto esbarraria
 * no RLS do Postgres, que é onde o isolamento por empresa é garantido.
 */
export function DashboardLayout() {
  const { user, loading, mfa } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <TetrisLoading size="sm" speed="fast" loadingText="Carregando..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Senha aceita, mas falta o segundo fator: a sessão existe e mesmo assim não
  // pode ver o painel. Sem esta trava o usuário entraria com a sessão em `aal1`
  // e as telas quebrariam de forma confusa ao esbarrar nas policies que exigem
  // `aal2` — ou pior, veria dados se alguma policy não exigisse.
  if (mfa.precisaMfa) {
    return <DesafioMfa />;
  }

  return (
    <div className="min-h-screen flex bg-background">
      <AppSidebar collapsed={sidebarCollapsed} onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <main
        className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 overflow-auto transition-all duration-300"
        style={{ marginLeft: sidebarCollapsed ? '4rem' : '16rem' }}
      >
        <Outlet />
      </main>
    </div>
  );
}
