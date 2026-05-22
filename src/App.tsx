import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Clientes from "./pages/Clientes";
import Licencas from "./pages/Licencas";
import Revendas from "./pages/Revendas";
import Pagamentos from "./pages/Pagamentos";
import Segmentos from "./pages/Segmentos";
import Sistemas from "./pages/Sistemas";
import Implantacoes from "./pages/Implantacoes";
import Contratos from "./pages/Contratos";
import Usuarios from "./pages/Usuarios";
import Mensagens from "./pages/Mensagens";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route element={<DashboardLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
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
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
