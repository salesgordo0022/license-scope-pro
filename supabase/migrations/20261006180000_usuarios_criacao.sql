-- Criação de usuário pelo painel.
--
-- A trava prevent_role_escalation (BEFORE UPDATE em usuario_perfil) só deixava
-- mudar tipo/empresa quando is_super_admin() — que olha auth.uid(). A function
-- create-user usa a service role (sem auth.uid()), então ao amarrar o novo
-- usuário à empresa e ao tipo escolhido a trava disparava: o usuário ficava
-- criado no Auth, sem empresa, e a tela mostrava "perfil não pôde ser
-- configurado". A service role (Edge Functions, que já checam permissão) e o
-- SQL Editor (sem JWT) passam a ser aceitos; usuário logado continua barrado.
CREATE OR REPLACE FUNCTION public.prevent_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_super_admin()
     OR coalesce(auth.role(), '') = 'service_role'
     OR current_setting('request.jwt.claims', true) IS NULL
     OR current_setting('request.jwt.claims', true) = '' THEN
    RETURN NEW;
  END IF;
  IF NEW.tipo IS DISTINCT FROM OLD.tipo THEN
    RAISE EXCEPTION 'Não autorizado: alteração de tipo do usuário requer super_admin';
  END IF;
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    RAISE EXCEPTION 'Não autorizado: alteração de empresa requer super_admin';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Não autorizado: user_id imutável';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.prevent_role_escalation() FROM PUBLIC, anon, authenticated;

-- Usuários criados antes desta correção que ficaram sem empresa: o admin que
-- os criou precisa reatribuir. Esta consulta mostra quem está nessa situação:
--   SELECT id, nome, email, tipo, created_at FROM public.usuario_perfil
--    WHERE empresa_id IS NULL AND tipo <> 'super_admin' ORDER BY created_at DESC;
