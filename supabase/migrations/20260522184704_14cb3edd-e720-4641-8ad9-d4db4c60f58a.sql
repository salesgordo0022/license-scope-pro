CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
  v_tipo user_role;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.usuario_perfil;
  IF v_count = 0 THEN
    v_tipo := 'super_admin';
  ELSE
    v_tipo := 'revendedor';
  END IF;

  INSERT INTO public.usuario_perfil (user_id, email, nome, tipo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    v_tipo
  );
  RETURN NEW;
END;
$function$;