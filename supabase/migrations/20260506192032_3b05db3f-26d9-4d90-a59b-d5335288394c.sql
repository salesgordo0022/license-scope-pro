-- Drop existing policies for contratos
DROP POLICY IF EXISTS "Admin gerencia contratos" ON public.contratos;
DROP POLICY IF EXISTS "Usuários veem contratos" ON public.contratos;

-- Create more flexible policies for contratos
CREATE POLICY "Admin gerencia contratos" 
ON public.contratos 
FOR ALL 
TO authenticated
USING (
  is_super_admin() OR 
  (is_admin_or_super() AND (
    (empresa_id = get_user_empresa_id()) OR 
    (empresa_id IS NULL AND get_user_empresa_id() IS NULL)
  ))
)
WITH CHECK (
  is_super_admin() OR 
  (is_admin_or_super() AND (
    (empresa_id = get_user_empresa_id()) OR 
    (empresa_id IS NULL AND get_user_empresa_id() IS NULL)
  ))
);

CREATE POLICY "Usuários veem contratos" 
ON public.contratos 
FOR SELECT 
TO authenticated
USING (
  is_super_admin() OR 
  (is_admin_or_super() AND (
    (empresa_id = get_user_empresa_id()) OR 
    (empresa_id IS NULL AND get_user_empresa_id() IS NULL)
  )) OR
  (empresa_id = get_user_empresa_id()) OR
  (empresa_id IS NULL AND get_user_empresa_id() IS NULL)
);