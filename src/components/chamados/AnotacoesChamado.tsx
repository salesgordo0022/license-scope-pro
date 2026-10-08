import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Bell, Check, Trash2, Loader2 } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface Nota {
  id: string;
  chamado_id: string;
  cliente_id: string | null;
  autor_id: string | null;
  texto: string;
  fixada: boolean;
  lembrar_em: string | null;
  lembrete_para: string | null;
  lembrete_enviado_em: string | null;
  lembrete_concluido: boolean;
  created_at: string;
}

const quando = (iso: string) => format(parseISO(iso), "dd/MM 'às' HH:mm", { locale: ptBR });

/** "AAAA-MM-DDTHH:MM" local, para o campo datetime-local. */
function local(d: Date) {
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}T${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/**
 * Cartão de anotações internas do chamado. Só a equipe vê: nada daqui vai
 * para o cliente. Notas fixadas ficam no topo; uma nota pode ter lembrete
 * (sino + WhatsApp de quem deve lembrar). Notas de outros chamados do mesmo
 * cliente aparecem embaixo, como histórico.
 */
export function AnotacoesChamado({
  aberta,
  onFechar,
  chamado,
  usuarios,
}: {
  aberta: boolean;
  onFechar: () => void;
  chamado: { id: string; cliente_id: string | null; contato_nome: string | null; contato_id: string | null };
  usuarios: { id: string; nome: string | null; email: string | null }[];
}) {
  const { profile, isAdmin } = useAuth();
  const [notas, setNotas] = useState<Nota[]>([]);
  const [doCliente, setDoCliente] = useState<Nota[]>([]);
  const [texto, setTexto] = useState('');
  const [comLembrete, setComLembrete] = useState(false);
  const [lembrarEm, setLembrarEm] = useState('');
  const [lembrarQuem, setLembrarQuem] = useState<string>('');
  const [salvando, setSalvando] = useState(false);

  const nomeDe = (id: string | null) => {
    const u = usuarios.find((x) => x.id === id);
    return u?.nome || u?.email || 'Alguém da equipe';
  };

  const carregar = useCallback(async () => {
    const { data } = await supabase.from('chamado_notas').select('*').eq('chamado_id', chamado.id).order('created_at', { ascending: false });
    setNotas((data || []) as Nota[]);
    if (chamado.cliente_id) {
      const { data: hist } = await supabase
        .from('chamado_notas')
        .select('*')
        .eq('cliente_id', chamado.cliente_id)
        .neq('chamado_id', chamado.id)
        .order('created_at', { ascending: false })
        .limit(30);
      setDoCliente((hist || []) as Nota[]);
    } else setDoCliente([]);
  }, [chamado.id, chamado.cliente_id]);

  useEffect(() => {
    if (!aberta) return;
    carregar();
    const canal = supabase
      .channel(`notas-${chamado.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chamado_notas', filter: `chamado_id=eq.${chamado.id}` }, () => carregar())
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [aberta, carregar, chamado.id]);

  useEffect(() => {
    if (aberta) setLembrarQuem(profile?.id || '');
  }, [aberta, profile?.id]);

  const abrirLembrete = (v: boolean) => {
    setComLembrete(v);
    if (v && !lembrarEm) {
      const d = new Date(Date.now() + 60 * 60_000);
      d.setMinutes(0, 0, 0);
      setLembrarEm(local(d));
    }
  };

  const salvar = async () => {
    if (!texto.trim()) return;
    let lembrar: string | null = null;
    if (comLembrete) {
      const d = new Date(lembrarEm);
      if (isNaN(d.getTime()) || d.getTime() < Date.now() - 60_000) return toast.error('Escolha uma data futura para o lembrete');
      lembrar = d.toISOString();
    }
    setSalvando(true);
    const { error } = await supabase.from('chamado_notas').insert({
      chamado_id: chamado.id,
      cliente_id: chamado.cliente_id,
      texto: texto.trim(),
      lembrar_em: lembrar,
      lembrete_para: lembrar ? lembrarQuem || profile?.id || null : null,
    });
    setSalvando(false);
    if (error) return toast.error('Não foi possível salvar a anotação', { description: error.message });
    setTexto('');
    setComLembrete(false);
    setLembrarEm('');
    if (lembrar) toast.success('Anotação salva com lembrete', { description: `Aviso em ${quando(lembrar)} para ${nomeDe(lembrarQuem)}.` });
    carregar();
  };

  const alterar = async (n: Nota, campos: Partial<Nota>) => {
    const { error } = await supabase.from('chamado_notas').update({ ...campos, updated_at: new Date().toISOString() }).eq('id', n.id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const excluir = async (n: Nota) => {
    if (!window.confirm('Apagar esta anotação?')) return;
    const { error } = await supabase.from('chamado_notas').delete().eq('id', n.id);
    if (error) return toast.error(error.message);
    carregar();
  };

  const ordenadas = [...notas].sort((a, b) => Number(b.fixada) - Number(a.fixada) || b.created_at.localeCompare(a.created_at));

  const Cartao = ({ n, historico }: { n: Nota; historico?: boolean }) => {
    const podeApagar = isAdmin || n.autor_id === profile?.id;
    const atrasado = n.lembrar_em && !n.lembrete_concluido && new Date(n.lembrar_em).getTime() <= Date.now();
    return (
      <div className={cn('rounded-lg border p-3 text-sm', n.fixada && 'border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20')}>
        <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{nomeDe(n.autor_id)}</span>
          <span>{quando(n.created_at)}</span>
          {n.fixada && <span className="rounded bg-amber-100 px-1 text-amber-700">📌 fixada</span>}
          {!historico && (
            <span className="ml-auto flex gap-1">
              <button type="button" className="rounded px-1 hover:bg-muted" title={n.fixada ? 'Desafixar' : 'Fixar no topo'} onClick={() => alterar(n, { fixada: !n.fixada })}>
                📌
              </button>
              {podeApagar && (
                <button type="button" className="rounded px-1 text-destructive hover:bg-muted" title="Apagar" onClick={() => excluir(n)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          )}
        </div>
        <p className="whitespace-pre-wrap break-words">{n.texto}</p>
        {n.lembrar_em && (
          <div
            className={cn(
              'mt-2 flex items-center gap-2 rounded-md px-2 py-1 text-[11px]',
              n.lembrete_concluido ? 'bg-muted text-muted-foreground line-through' : atrasado ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700'
            )}
          >
            <Bell className="h-3.5 w-3.5" /> Lembrar {nomeDe(n.lembrete_para)} em {quando(n.lembrar_em)}
            {!n.lembrete_concluido && !historico && (
              <button type="button" className="ml-auto flex items-center gap-1 font-medium hover:underline" onClick={() => alterar(n, { lembrete_concluido: true })}>
                <Check className="h-3.5 w-3.5" /> Feito
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Sheet open={aberta} onOpenChange={(v) => !v && onFechar()}>
      <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>📝 Anotações do chamado</SheetTitle>
          <SheetDescription>
            {chamado.contato_nome || chamado.contato_id}. Só a equipe vê: nada daqui é enviado ao cliente. A IA usa como contexto quando assume o chamado.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 rounded-xl border p-3">
          <Textarea
            rows={3}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: cliente usa a versão antiga do Domínio; já mandei o link do treinamento por e-mail."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                salvar();
              }
            }}
          />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={comLembrete} onChange={(e) => abrirLembrete(e.target.checked)} />
            <Bell className="h-3.5 w-3.5" /> Lembrar
          </label>
          {comLembrete && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[11px]">Quando</Label>
                <Input type="datetime-local" value={lembrarEm} min={local(new Date())} onChange={(e) => setLembrarEm(e.target.value)} className="h-8 text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Quem</Label>
                <Select value={lembrarQuem} onValueChange={setLembrarQuem}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {usuarios.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.id === profile?.id ? 'Eu' : u.nome || u.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="col-span-full text-[11px] text-muted-foreground">Na hora chega no sino e no WhatsApp cadastrado em Minha IA.</p>
            </div>
          )}
          <div className="flex justify-end">
            <Button size="sm" onClick={salvar} disabled={salvando || !texto.trim()} className="gap-2">
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Anotar
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {ordenadas.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma anotação neste chamado.</p>
          ) : (
            ordenadas.map((n) => <Cartao key={n.id} n={n} />)
          )}
        </div>

        {doCliente.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-semibold text-muted-foreground">Anotações de outros chamados deste cliente</p>
            {doCliente.map((n) => (
              <Cartao key={n.id} n={n} historico />
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
