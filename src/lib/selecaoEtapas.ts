import { ETAPAS_PADRAO, SEPARADOR, type EtapaModelo } from '@/lib/implantacaoPadrao';

/** Etapa na tela de criação: dá para desmarcar a etapa inteira ou só alguns itens. */
export interface SelecaoEtapa {
  chave: string;
  modelo: EtapaModelo;
  marcada: boolean;
  itens: { texto: string; marcado: boolean }[];
  /** Criada agora, só para esta implantação (pode ou não virar modelo). */
  avulsa?: boolean;
}

export function selecaoInicial(personalizadas: EtapaModelo[]): SelecaoEtapa[] {
  return [
    ...ETAPAS_PADRAO.map((m) => ({ chave: `p:${m.nome}`, modelo: m, marcada: true, itens: m.itens.map((t) => ({ texto: t, marcado: true })) })),
    ...personalizadas.map((m) => ({ chave: `c:${m.id}`, modelo: m, marcada: false, itens: m.itens.map((t) => ({ texto: t, marcado: true })) })),
  ];
}

/** Etapas escolhidas, na ordem da tela, só com os itens marcados. */
export function etapasEscolhidas(selecao: SelecaoEtapa[]): EtapaModelo[] {
  return selecao
    .filter((s) => s.marcada)
    .map((s) => ({ ...s.modelo, itens: s.itens.filter((i) => i.marcado).map((i) => i.texto) }))
    .filter((e) => e.itens.length > 0);
}

/** Valida o nome de uma etapa nova. Devolve a mensagem de erro ou null. */
export function validarNomeEtapa(nome: string, existentes: string[]) {
  const n = nome.trim();
  if (!n) return 'Dê um nome para a etapa';
  if (n.includes(SEPARADOR.trim())) return 'O nome não pode ter o caractere "·"';
  if (existentes.some((e) => e.trim().toLowerCase() === n.toLowerCase())) return 'Já existe uma etapa com esse nome';
  return null;
}

