-- Revogar execução das funções críticas para as roles 'PUBLIC' e 'authenticated'
REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.is_admin_or_super() FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.prevent_role_escalation() FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.get_user_role() FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.get_user_empresa_id() FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, authenticated;

-- Garantir acesso apenas para a 'service_role' (que é usada pelo sistema/backend)
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_role_escalation() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_empresa_id() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;