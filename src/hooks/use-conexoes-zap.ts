import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { erroDaFunction } from '@/lib/erroFunction';

export interface ConexaoZap {
  id: number;
  nome: string;
  status: string;
  padrao: boolean;
}

const CHAVE_CANAL = 'impertech-canal-whatsapp';

/** Conexões (canais) do ZapContábil, para escolher por onde a mensagem sai. */
export function useConexoesZap() {
  const [conexoes, setConexoes] = useState<ConexaoZap[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  useEffect(() => {
    supabase.functions.invoke('envios-agendados', { body: { acao: 'conexoes' } }).then(async ({ data, error }) => {
      setCarregando(false);
      if (error || data?.error) {
        setErro((await erroDaFunction(error, data)) || 'Não foi possível carregar os canais');
        return;
      }
      setConexoes((data?.conexoes as ConexaoZap[]) || []);
    });
  }, []);
  return { conexoes, erro, carregando };
}

/** Último canal escolhido neste navegador (null = padrão). */
export function canalLembrado(): number | null {
  try {
    const v = localStorage.getItem(CHAVE_CANAL);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

export function lembrarCanal(id: number | null) {
  try {
    if (id === null) localStorage.removeItem(CHAVE_CANAL);
    else localStorage.setItem(CHAVE_CANAL, String(id));
  } catch {
    /* sem storage */
  }
}
