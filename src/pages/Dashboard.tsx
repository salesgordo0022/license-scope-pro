import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Key, AlertTriangle, TrendingUp, Monitor, ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface DashboardStats {
  totalClientes: number;
  licencasAtivas: number;
  licencasVencendo: number;
  totalRevendas: number;
}

const COLORS = ['hsl(234, 89%, 60%)', 'hsl(142, 76%, 36%)', 'hsl(38, 92%, 50%)', 'hsl(199, 89%, 48%)', 'hsl(280, 68%, 60%)'];

/**
 * Painel inicial: consolida os indicadores da empresa do usuário — total de
 * clientes, licenças ativas e a vencer, receita e distribuição por segmento.
 *
 * Todas as consultas passam pelo RLS, então os números já vêm restritos ao
 * tenant de quem está logado; não há filtro de empresa no código da tela.
 */
export default function Dashboard() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalClientes: 0,
    licencasAtivas: 0,
    licencasVencendo: 0,
    totalRevendas: 0,
  });
  const [segmentData, setSegmentData] = useState<{ name: string; value: number }[]>([]);
  const [sistemaData, setSistemaData] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch clients count
        const { count: clientesCount } = await supabase
          .from('clientes')
          .select('*', { count: 'exact', head: true });

        // Fetch active licenses
        const { count: licencasAtivas } = await supabase
          .from('licencas')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ativo');

        // Fetch expiring licenses (next 30 days)
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        
        const { count: licencasVencendo } = await supabase
          .from('licencas')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ativo')
          .lte('validade', thirtyDaysFromNow.toISOString().split('T')[0]);

        // Fetch resales count
        const { count: revendasCount } = await supabase
          .from('revendas')
          .select('*', { count: 'exact', head: true });

        setStats({
          totalClientes: clientesCount || 0,
          licencasAtivas: licencasAtivas || 0,
          licencasVencendo: licencasVencendo || 0,
          totalRevendas: revendasCount || 0,
        });

        // Fetch clients by segment
        const { data: clientes } = await supabase
          .from('clientes')
          .select('segmento');

        if (clientes) {
          const segmentCount = clientes.reduce((acc: Record<string, number>, curr) => {
            const seg = curr.segmento || 'Não definido';
            acc[seg] = (acc[seg] || 0) + 1;
            return acc;
          }, {});

          setSegmentData(
            Object.entries(segmentCount).map(([name, value]) => ({ name, value }))
          );
        }

        // Fetch sistemas mais vendidos (baseado em revendas e clientes)
        const { data: revendas } = await supabase
          .from('revendas')
          .select('sistema')
          .not('sistema', 'is', null);

        if (revendas) {
          const sistemaCount = revendas.reduce((acc: Record<string, number>, curr) => {
            const name = curr.sistema || 'Não definido';
            acc[name] = (acc[name] || 0) + 1;
            return acc;
          }, {});

          setSistemaData(
            Object.entries(sistemaCount)
              .map(([name, count]) => ({ name, count }))
              .sort((a, b) => b.count - a.count)
              .slice(0, 6)
          );
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const statCards = [
    {
      title: 'Total de Clientes',
      value: stats.totalClientes,
      icon: Users,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Licenças Ativas',
      value: stats.licencasAtivas,
      icon: Key,
      color: 'text-success',
      bgColor: 'bg-success/10',
    },
    {
      title: 'Licenças Vencendo',
      value: stats.licencasVencendo,
      icon: AlertTriangle,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
    {
      title: 'Total de Revendas',
      value: stats.totalRevendas,
      icon: ShoppingCart,
      color: 'text-info',
      bgColor: 'bg-info/10',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="page-header"
      >
        <h1 className="page-title">Dashboard</h1>
        <p className="page-description">
          Bem-vindo de volta, {profile?.nome || 'Usuário'}! Aqui está o resumo do seu CRM.
        </p>
      </motion.div>

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat, index) => (
          <motion.div
            key={stat.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="stat-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="text-3xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Clients by Segment */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-muted-foreground" />
                Clientes por Segmento
              </CardTitle>
            </CardHeader>
            <CardContent>
              {segmentData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={segmentData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {segmentData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  Nenhum dado disponível
                </div>
              )}
              {segmentData.length > 0 && (
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {segmentData.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm text-muted-foreground">{item.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Sistemas Mais Vendidos */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-muted-foreground" />
                Sistemas Mais Vendidos
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sistemaData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={sistemaData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(234, 89%, 60%)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                  Nenhum dado disponível
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Quick Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-muted-foreground" />
              Resumo Rápido
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Taxa de Licenças Ativas</p>
                <p className="text-2xl font-bold text-success">
                  {stats.totalClientes > 0
                    ? Math.round((stats.licencasAtivas / stats.totalClientes) * 100)
                    : 0}%
                </p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Atenção Necessária</p>
                <p className="text-2xl font-bold text-warning">{stats.licencasVencendo}</p>
                <p className="text-xs text-muted-foreground">licenças vencendo em 30 dias</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Média Revendas/Cliente</p>
                <p className="text-2xl font-bold text-info">
                  {stats.totalClientes > 0
                    ? (stats.totalRevendas / stats.totalClientes).toFixed(1)
                    : 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
