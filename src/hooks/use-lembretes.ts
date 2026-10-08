import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { abaEmFoco, avisarNoSistema } from '@/lib/notificacoesSistema';

export interface LembreteDevido {
  id: string;
  chamado_id: string;
  texto: string;
  lembrar_em: string;
}

const CHAVE_AVISADOS = 'impertech-lembretes-avisados';

function jaAvisados(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CHAVE_AVISADOS) || '[]'));
  } catch {
    return new Set();
  }
}

function marcarAvisado(id: string) {
  try {
    const s = jaAvisados();
    s.add(id);
    localStorage.setItem(CHAVE_AVISADOS, JSON.stringify([...s].slice(-300)));
  } catch {
    /* sem storage */
  }
}

/**
 * Lembretes das anotações dos chamados que já chegaram na hora, para quem está
 * logado. Avisa uma vez (área de trabalho ou toast) e devolve a lista para o sino.
 * O WhatsApp é enviado pelo servidor (plantão da IA).
 */
export function useLembretes(): LembreteDevido[] {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [devidos, setDevidos] = useState<LembreteDevido[]>([]);

  useEffect(() => {
    if (!profile?.id) return;
    const verificar = async () => {
      const { data, error } = await supabase
        .from('chamado_notas')
        .select('id, chamado_id, texto, lembrar_em')
        .eq('lembrete_para', profile.id)
        .eq('lembrete_concluido', false)
        .lte('lembrar_em', new Date().toISOString())
        .order('lembrar_em')
        .limit(20);
      if (error) return;
      const lista = (data || []) as LembreteDevido[];
      setDevidos(lista);
      const avisados = jaAvisados();
      for (const l of lista) {
        if (avisados.has(l.id)) continue;
        marcarAvisado(l.id);
        const url = `/chamados?abrir=${l.chamado_id}`;
        const corpo = l.texto.slice(0, 200);
        if (abaEmFoco() || !avisarNoSistema({ titulo: '⏰ Lembrete de chamado', corpo, tag: `lembrete-${l.id}`, url, fixo: true }, navigate)) {
          toast('⏰ Lembrete de chamado', { description: corpo, duration: 15000, action: { label: 'Abrir', onClick: () => navigate(url) } });
        }
      }
    };
    verificar();
    const t = setInterval(verificar, 60_000);
    const canal = supabase
      .channel('lembretes-notas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chamado_notas' }, verificar)
      .subscribe();
    return () => {
      clearInterval(t);
      supabase.removeChannel(canal);
    };
  }, [profile?.id, navigate]);

  return devidos;
}
