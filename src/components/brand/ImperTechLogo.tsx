import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

/**
 * Marcas da ImperTech usadas no sistema:
 * - modo claro: "Janela com corte" (grade 2×2 com o quadrado superior direito
 *   cortado na diagonal);
 * - modo escuro: "Bloco IT" (T com a ponta cortada + i), nas cores escuras
 *   do sistema (T #2F8BF5, i branco).
 * Desenhadas em SVG para ficarem nítidas em qualquer tamanho.
 *
 * `tom="escuro"` é para fundo marinho (quarto bloco claro, texto branco);
 * `tom="claro"` é para fundo branco (quarto bloco marinho, texto marinho).
 */
export function ImperTechSimbolo({ tom = 'claro', className }: { tom?: 'claro' | 'escuro'; className?: string }) {
  return (
    <svg viewBox="28 28 200 200" className={cn('shrink-0', className)} aria-hidden="true">
      <rect x="28" y="28" width="96" height="96" rx="6" fill="#2D8CF0" />
      <path d="M132 28H228L200 124H132Z" fill="#5BB8F9" />
      <rect x="28" y="132" width="96" height="96" rx="6" fill="#0B5CAD" />
      <rect x="132" y="132" width="96" height="96" rx="6" fill={tom === 'escuro' ? '#FFFFFF' : '#14223B'} />
    </svg>
  );
}

/** "Bloco IT" na versão escura (arquivo LOGOS/v1 - Bloco IT/cores-sistema/bloco-it-escuro.svg). */
export function BlocoItSimbolo({ className }: { className?: string }) {
  return (
    <svg viewBox="31 28 200 200" className={cn('shrink-0', className)} aria-hidden="true">
      <path fill="#2F8BF5" d="M36 44H226L203 84H160V212H120V84H36Z" />
      <path fill="#FFFFFF" d="M36 112H76V212H36Z" />
    </svg>
  );
}

interface ImperTechLogoProps {
  tom?: 'claro' | 'escuro';
  /** Altura do símbolo em classes Tailwind (ex.: "h-9 w-9"). */
  tamanho?: string;
  textoClassName?: string;
  className?: string;
  /** Oculta o nome e mostra só o símbolo (menu recolhido). */
  soSimbolo?: boolean;
}

export function ImperTechLogo({
  tom = 'claro',
  tamanho = 'h-9 w-9',
  textoClassName = 'text-2xl',
  className,
  soSimbolo = false,
}: ImperTechLogoProps) {
  const { resolvedTheme } = useTheme();
  const modoEscuro = resolvedTheme === 'dark';
  // No modo escuro tudo fica sobre fundo marinho: texto branco e "Tech" azul.
  const textoEscuro = modoEscuro || tom === 'escuro';

  return (
    <div className={cn('flex items-center gap-3', className)}>
      {modoEscuro ? <BlocoItSimbolo className={tamanho} /> : <ImperTechSimbolo tom={tom} className={tamanho} />}
      {!soSimbolo && (
        <span className={cn('font-semibold tracking-tight leading-none', textoClassName)}>
          <span className={textoEscuro ? 'text-white' : 'text-[#14223B]'}>Imper</span>
          <span className={modoEscuro ? 'text-[#2F8BF5]' : tom === 'escuro' ? 'text-[#5BB8F9]' : 'text-[#2D8CF0]'}>Tech</span>
        </span>
      )}
    </div>
  );
}
