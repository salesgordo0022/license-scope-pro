import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Junta classes do Tailwind resolvendo conflitos.
 *
 * `clsx` monta a lista (aceitando condicionais e objetos) e `twMerge` descarta
 * as classes sobrepostas — em `cn("p-2", "p-4")` vence `p-4`, em vez das duas
 * irem para o HTML e o resultado depender da ordem do CSS.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Data no formato AAAA-MM-DD pelo fuso local. `toISOString()` usa UTC, e no
 * Brasil (UTC-3) depois das 21h ele já devolve o dia seguinte — o que fazia
 * filtros de "vence até hoje" pegarem um dia a mais.
 */
export function dataLocalIso(d: Date = new Date()) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
