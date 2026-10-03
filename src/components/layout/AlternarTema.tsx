import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { Moon, Sun } from '@/components/icons';
import { cn } from '@/lib/utils';

/** Botão sol/lua que alterna entre o modo claro e o escuro (a escolha fica salva no navegador). */
export function AlternarTema({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // O tema só é conhecido depois de montar; antes disso o ícone não é desenhado.
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  const escuro = resolvedTheme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTheme(escuro ? 'light' : 'dark')}
      title={escuro ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
      aria-label={escuro ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
      className={cn('flex h-10 w-10 items-center justify-center rounded-full text-foreground/80 transition hover:bg-muted', className)}
    >
      {montado && (escuro ? <Sun className="h-5 w-5 text-amber-300" /> : <Moon className="h-5 w-5" />)}
    </button>
  );
}
