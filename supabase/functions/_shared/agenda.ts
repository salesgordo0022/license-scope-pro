/**
 * Calendário dos envios agendados (horário de Brasília, UTC−3 fixo).
 *
 * CÓPIA IDÊNTICA em supabase/functions/_shared/agenda.ts — a tela usa para
 * mostrar a próxima data e a function para decidir quando enviar. Alterou
 * aqui, altere lá.
 */

export type Recorrencia = 'uma_vez' | 'diaria' | 'semanal' | 'mensal' | 'ultimo_dia_mes';

export interface RegraAgenda {
  recorrencia: Recorrencia;
  dia_mes?: number | null;
  dia_semana?: number | null;
  data_unica?: string | null; // AAAA-MM-DD
  hora: string; // HH:MM ou HH:MM:SS
}

const FUSO_HORAS = 3; // Brasília = UTC−3 (sem horário de verão)

/** Instante UTC de uma data/hora de Brasília (mês 0–11; dia pode estourar). */
function brasilia(ano: number, mes: number, dia: number, h: number, m: number): Date {
  return new Date(Date.UTC(ano, mes, dia, h + FUSO_HORAS, m));
}

/** Partes da data em Brasília. */
function partes(d: Date) {
  const l = new Date(d.getTime() - FUSO_HORAS * 3600_000);
  return { ano: l.getUTCFullYear(), mes: l.getUTCMonth(), dia: l.getUTCDate(), semana: l.getUTCDay() };
}

const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();

/** Próximo envio estritamente depois de `depoisDe`; null se a regra acabou. */
export function proximaExecucao(r: RegraAgenda, depoisDe: Date): Date | null {
  const [h, m] = r.hora.split(':').map(Number);
  const { ano, mes, dia } = partes(depoisDe);
  const depois = (d: Date) => d.getTime() > depoisDe.getTime();

  switch (r.recorrencia) {
    case 'uma_vez': {
      if (!r.data_unica) return null;
      const [a, ms, d] = r.data_unica.split('-').map(Number);
      const t = brasilia(a, ms - 1, d, h, m);
      return depois(t) ? t : null;
    }
    case 'diaria': {
      const hoje = brasilia(ano, mes, dia, h, m);
      return depois(hoje) ? hoje : brasilia(ano, mes, dia + 1, h, m);
    }
    case 'semanal': {
      const alvo = r.dia_semana ?? 1;
      for (let i = 0; i <= 7; i++) {
        const t = brasilia(ano, mes, dia + i, h, m);
        if (partes(t).semana === alvo && depois(t)) return t;
      }
      return null;
    }
    case 'mensal': {
      const alvo = r.dia_mes ?? 1;
      for (let i = 0; i <= 1; i++) {
        const t = brasilia(ano, mes + i, Math.min(alvo, diasNoMes(ano, mes + i)), h, m);
        if (depois(t)) return t;
      }
      return null;
    }
    case 'ultimo_dia_mes': {
      for (let i = 0; i <= 1; i++) {
        const t = brasilia(ano, mes + i, diasNoMes(ano, mes + i), h, m);
        if (depois(t)) return t;
      }
      return null;
    }
  }
}

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "Todo dia 10 às 09:00", "Último dia do mês às 17:00"... */
export function descreverRegra(r: RegraAgenda): string {
  const hora = r.hora.slice(0, 5);
  switch (r.recorrencia) {
    case 'uma_vez':
      return r.data_unica ? `Uma vez, em ${r.data_unica.split('-').reverse().join('/')} às ${hora}` : 'Uma vez';
    case 'diaria':
      return `Todos os dias às ${hora}`;
    case 'semanal': {
      const d = r.dia_semana ?? 1;
      return d === 0 || d === 6 ? `Todo ${SEMANA[d]} às ${hora}` : `Toda ${SEMANA[d]}-feira às ${hora}`;
    }
    case 'mensal':
      return `Todo dia ${r.dia_mes ?? 1} às ${hora}`;
    case 'ultimo_dia_mes':
      return `Último dia do mês às ${hora}`;
  }
}

export interface DadosVariaveis {
  nome?: string | null;
  contato?: string | null;
  mensalidade?: number | null;
}

/** Troca {nome} {contato} {mes} {mes_anterior} {ano} {data} {mensalidade} (data de Brasília). */
export function preencherVariaveis(texto: string, v: DadosVariaveis, quando: Date): string {
  const p = partes(quando);
  const mesAnt = (p.mes + 11) % 12;
  const valor =
    v.mensalidade != null && Number(v.mensalidade) > 0
      ? Number(v.mensalidade).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '';
  const mapa: Record<string, string> = {
    nome: v.nome || '',
    contato: v.contato || v.nome || '',
    mes: MESES[p.mes],
    mes_anterior: MESES[mesAnt],
    ano: String(p.ano),
    data: `${String(p.dia).padStart(2, '0')}/${String(p.mes + 1).padStart(2, '0')}/${p.ano}`,
    mensalidade: valor,
  };
  return texto.replace(/\{(\w+)\}/g, (todo, k: string) => (k in mapa ? mapa[k] : todo));
}
