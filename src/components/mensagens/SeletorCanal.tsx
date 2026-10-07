import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useConexoesZap } from '@/hooks/use-conexoes-zap';
import { cn } from '@/lib/utils';

/** Escolha do canal (conexão do ZapContábil) por onde a mensagem sai. */
export function SeletorCanal({
  valor,
  onChange,
  className,
}: {
  valor: number | null;
  onChange: (id: number | null) => void;
  className?: string;
}) {
  const { conexoes, erro, carregando } = useConexoesZap();
  return (
    <div className={cn('space-y-1', className)}>
      <Select value={valor == null ? 'padrao' : String(valor)} onValueChange={(v) => onChange(v === 'padrao' ? null : Number(v))}>
        <SelectTrigger>
          <SelectValue placeholder="Canal" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="padrao">Canal padrão</SelectItem>
          {conexoes.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.nome}
              {c.status && c.status !== 'CONNECTED' ? ` (${c.status.toLowerCase()})` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {carregando ? (
        <p className="text-[11px] text-muted-foreground">Carregando canais do ZapContábil...</p>
      ) : erro ? (
        <p className="text-[11px] text-destructive">Canais indisponíveis: {erro}</p>
      ) : conexoes.length === 0 ? (
        <p className="text-[11px] text-amber-600">Nenhum canal retornado pelo ZapContábil; será usado o canal padrão.</p>
      ) : null}
    </div>
  );
}
