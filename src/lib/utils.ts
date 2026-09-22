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
