import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { abaEmFoco, avisarNoSistema } from '@/lib/notificacoesSistema';

const ORIGEM: Record<string, string> = { slack: 'Slack', zapcontabil: 'WhatsApp' };
const TITULO_BASE = 'ImperTech CRM';

/**
 * Avisos de qualquer tela do sistema:
 *  - mensagem nova num chamado (Slack/WhatsApp) → aviso do sistema operacional
 *    quando o usuário está em outra aba/programa, ou toast quando está olhando
 *    o sistema (fora da tela de Chamados, que já atualiza sozinha);
 *  - contador de não lidas no título da aba: "(3) ImperTech CRM".
 * O RLS garante que cada um só é avisado dos chamados que pode ver.
 *
 * Devolve o total de mensagens não lidas (para o sino).
 */
export function useAvisosGlobais(): number {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [naoLidas, setNaoLidas] = useState(0);
  const rotaRef = useRef(pathname);
  rotaRef.current = pathname;

  // Contador de não lidas (sino + título da aba).
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
      .channel('avisos-contador')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chamados' }, contar)
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, []);

  useEffect(() => {
    document.title = naoLidas > 0 ? `(${naoLidas > 99 ? '99+' : naoLidas}) ${TITULO_BASE}` : TITULO_BASE;
  }, [naoLidas]);

  // Mensagem nova recebida em chamado.
  useEffect(() => {
    const canal = supabase
      .channel('avisos-mensagens')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chamado_mensagens', filter: 'direcao=eq.entrada' }, async (p) => {
        const m = p.new as { id: string; chamado_id: string; autor_nome: string | null; texto: string };
        const { data: c } = await supabase
          .from('chamados')
          .select('id, origem, contato_nome, canal_nome, status')
          .eq('id', m.chamado_id)
          .maybeSingle();
        if (!c) return; // chamado de outra pessoa (RLS)
        if (c.status === 'dispensado') return; // dispensado não é chamado: não avisa

        const origem = ORIGEM[c.origem] || c.origem;
        const quem = m.autor_nome || c.contato_nome || 'Contato';
        const titulo = `${quem} · ${origem}`;
        const corpo = `${c.canal_nome ? `${c.canal_nome}: ` : ''}${m.texto || '(anexo)'}`;
        const url = `/chamados?abrir=${c.id}`;

        if (abaEmFoco()) {
          if (rotaRef.current !== '/chamados') {
            toast(titulo, { description: corpo.slice(0, 140), action: { label: 'Abrir', onClick: () => navigate(url) } });
          }
          return;
        }
        const avisou = avisarNoSistema({ titulo, corpo, tag: `msg-${m.id}`, url }, navigate);
        if (!avisou) toast(titulo, { description: corpo.slice(0, 140), action: { label: 'Abrir', onClick: () => navigate(url) } });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [navigate]);

  return naoLidas;
}
