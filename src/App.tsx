import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { lazy, Suspense } from "react";
import TetrisLoading from "@/components/ui/tetris-loader";

// Cada tela vira um arquivo separado, baixado só quando é aberta: o sistema
// abre mais rápido e telas pesadas (mapa, PDF, planilhas) não pesam nas outras.
const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Chamados = lazy(() => import("./pages/Chamados"));
const Forum = lazy(() => import("./pages/Forum"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Licencas = lazy(() => import("./pages/Licencas"));
const Revendas = lazy(() => import("./pages/Revendas"));
const Pagamentos = lazy(() => import("./pages/Pagamentos"));
const Segmentos = lazy(() => import("./pages/Segmentos"));
const Sistemas = lazy(() => import("./pages/Sistemas"));
const Implantacoes = lazy(() => import("./pages/Implantacoes"));
const Contratos = lazy(() => import("./pages/Contratos"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Mensagens = lazy(() => import("./pages/Mensagens"));
const PastaBoletos = lazy(() => import("./pages/PastaBoletos"));
const Rotas = lazy(() => import("./pages/Rotas"));
const TabelaPrecos = lazy(() => import("./pages/TabelaPrecos"));
const Seguranca = lazy(() => import("./pages/Seguranca"));
const NotFound = lazy(() => import("./pages/NotFound"));


const queryClient = new QueryClient();

/**
 * Raiz da aplicação: providers (React Query, tooltips, notificações e
 * autenticação) e a tabela de rotas.
 *
 * Tudo que fica dentro de `DashboardLayout` exige sessão ativa; `/login` e a
 * 404 ficam de fora.
 */
const App = () => (
  // Tema claro/escuro: classe "dark" no <html>, escolha salva em localStorage.
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} storageKey="impertech-tema">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense
            fallback={
              <div className="flex h-screen items-center justify-center bg-background">
                <TetrisLoading size="sm" speed="fast" loadingText="Carregando..." />
              </div>
            }
          >
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/chamados" element={<Chamados />} />
              <Route path="/forum" element={<Forum />} />
              <Route path="/clientes" element={<Clientes />} />
              <Route path="/licencas" element={<Licencas />} />
              <Route path="/pagamentos" element={<Pagamentos />} />
              <Route path="/implantacoes" element={<Implantacoes />} />
              <Route path="/segmentos" element={<Segmentos />} />
              <Route path="/sistemas" element={<Sistemas />} />
              <Route path="/contratos" element={<Contratos />} />
              <Route path="/revendas" element={<Revendas />} />
              <Route path="/usuarios" element={<Usuarios />} />
              <Route path="/mensagens" element={<Mensagens />} />
              <Route path="/pasta-boletos" element={<PastaBoletos />} />
              <Route path="/rotas" element={<Rotas />} />
              <Route path="/planos" element={<TabelaPrecos />} />
              <Route path="/seguranca" element={<Seguranca />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
