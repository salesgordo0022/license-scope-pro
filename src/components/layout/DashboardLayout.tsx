import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { TopBar } from '@/components/layout/TopBar';
import TetrisLoading from '@/components/ui/tetris-loader';
import { Suspense, useEffect, useState } from 'react';
import { DesafioMfa } from '@/components/auth/DesafioMfa';

/**
 * Moldura das telas autenticadas: sidebar + barra superior + área de conteúdo.
 *
 * Também é o guarda de rota — sem sessão, redireciona para /login. Isso é
 * proteção de navegação, não de dados: quem chamasse a API direto esbarraria
 * no RLS do Postgres, que é onde o isolamento por empresa é garantido.
 */
export function DashboardLayout() {
  const { user, loading, mfa } = useAuth();
  // Em telas estreitas (celular/tablet) o menu já começa recolhido para não
  // cobrir metade do conteúdo.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.innerWidth < 1024);
  // Acompanha a largura: ao encolher a janela (ou girar o tablet) abaixo de
  // 1024px o menu recolhe; ao voltar para tela larga, abre de novo.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const aoMudar = (e: MediaQueryListEvent) => setSidebarCollapsed(!e.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

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
      <div
        className="flex min-w-0 flex-1 flex-col transition-all duration-300"
        style={{ marginLeft: sidebarCollapsed ? '4.5rem' : '16rem' }}
      >
        <TopBar />
        <main className="flex-1 overflow-auto px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          {/* Enquanto a tela é baixada, menu e barra superior continuam na tela. */}
          <Suspense
            fallback={
              <div className="flex h-[60vh] items-center justify-center">
                <TetrisLoading size="sm" speed="fast" loadingText="Carregando..." />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
