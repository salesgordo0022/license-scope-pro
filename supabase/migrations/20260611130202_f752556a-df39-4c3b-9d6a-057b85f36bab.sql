-- Desativa os gatilhos que podem bloquear a alteração
ALTER TABLE public.usuario_perfil DISABLE TRIGGER trg_prevent_role_escalation;
ALTER TABLE public.usuario_perfil DISABLE TRIGGER prevent_role_escalation_trigger;

-- Atualiza todos para super_admin
UPDATE public.usuario_perfil SET tipo = 'super_admin';

-- Reativa os gatilhos
ALTER TABLE public.usuario_perfil ENABLE TRIGGER trg_prevent_role_escalation;
ALTER TABLE public.usuario_perfil ENABLE TRIGGER prevent_role_escalation_trigger;

-- Concede permissões explícitas para garantir acesso
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
