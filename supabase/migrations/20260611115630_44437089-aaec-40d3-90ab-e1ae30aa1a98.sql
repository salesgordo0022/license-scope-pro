-- Revogar execução pública de funções críticas que usam SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_super() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_empresa_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- Garantir acesso apenas para as roles necessárias (authenticated e service_role)
-- Normalmente, essas funções são usadas internamente por triggers ou RLS,
-- mas vamos garantir que o sistema possa usá-las.
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prevent_role_escalation() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_empresa_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated, service_role;