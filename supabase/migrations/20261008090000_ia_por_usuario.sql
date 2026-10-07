-- Cada colaborador parametriza a própria IA ("Minha IA"). Campos vazios
-- seguem a regra geral da empresa (ia_config).
ALTER TABLE public.ia_equipe
  ADD COLUMN IF NOT EXISTS alerta_limite integer CHECK (alerta_limite BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS alerta_intervalo_min integer CHECK (alerta_intervalo_min BETWEEN 10 AND 1440),
  ADD COLUMN IF NOT EXISTS horario_dias integer[],
  ADD COLUMN IF NOT EXISTS horario_inicio time,
  ADD COLUMN IF NOT EXISTS horario_fim time,
  ADD COLUMN IF NOT EXISTS aviso_demora_ativo boolean,
  ADD COLUMN IF NOT EXISTS aviso_demora_min integer CHECK (aviso_demora_min BETWEEN 1 AND 1440),
  ADD COLUMN IF NOT EXISTS aviso_demora_texto text;

NOTIFY pgrst, 'reload schema';
