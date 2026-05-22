-- Criar trigger para criar automaticamente o perfil do usuário quando ele se registra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.usuario_perfil (user_id, email, nome, tipo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email),
    'revendedor'
  );
  RETURN NEW;
END;
$$;

-- Criar o trigger que chama a função acima
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Criar perfis para usuários existentes que não têm perfil
INSERT INTO public.usuario_perfil (user_id, email, nome, tipo)
SELECT 
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'nome', au.email),
  'admin' -- Os primeiros usuários serão admins
FROM auth.users au
LEFT JOIN public.usuario_perfil up ON au.id = up.user_id
WHERE up.id IS NULL
ON CONFLICT (user_id) DO NOTHING;