import { motion } from 'framer-motion';
import { Target, Columns3, Search } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import MetasVendas from '@/components/vendas/MetasVendas';
import KanbanVendas from '@/components/vendas/KanbanVendas';
import ProspeccaoEmpresas from '@/components/vendas/ProspeccaoEmpresas';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function Revendas() {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="page-header"
      >
        <h1 className="page-title">Vendas</h1>
        <p className="page-description">Gerencie seu pipeline e acompanhe suas metas</p>
      </motion.div>

      <Tabs defaultValue="kanban" className="space-y-4">
        <TabsList>
          <TabsTrigger value="kanban" className="gap-2">
            <Columns3 className="h-4 w-4" /> Kanban
          </TabsTrigger>
          <TabsTrigger value="prospeccao" className="gap-2">
            <Search className="h-4 w-4" /> Prospecção
          </TabsTrigger>
          <TabsTrigger value="metas" className="gap-2">
            <Target className="h-4 w-4" /> Metas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kanban">
          <ErrorBoundary>
            <KanbanVendas />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="prospeccao">
          <ErrorBoundary>
            <ProspeccaoEmpresas />
          </ErrorBoundary>
        </TabsContent>

        <TabsContent value="metas">
          <ErrorBoundary>
            <MetasVendas />
          </ErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
