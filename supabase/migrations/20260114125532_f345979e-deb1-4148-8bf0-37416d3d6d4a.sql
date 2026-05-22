-- Atualizar a política de INSERT para clientes permitindo empresa_id NULL
DROP POLICY IF EXISTS "Admin/Super podem criar clientes" ON public.clientes;

CREATE POLICY "Admin/Super podem criar clientes" 
ON public.clientes 
FOR INSERT 
WITH CHECK (
  -- Super admin pode criar qualquer cliente
  is_super_admin() 
  OR 
  -- Admin pode criar cliente da própria empresa
  ((empresa_id = get_user_empresa_id()) AND is_admin_or_super())
  OR
  -- Admin pode criar cliente sem empresa associada (leads)
  (empresa_id IS NULL AND is_admin_or_super())
);

-- Também permitir SELECT de clientes sem empresa_id
DROP POLICY IF EXISTS "Usuários veem clientes da sua empresa" ON public.clientes;

CREATE POLICY "Usuários veem clientes da sua empresa" 
ON public.clientes 
FOR SELECT 
USING (
  is_super_admin() 
  OR 
  (empresa_id = get_user_empresa_id())
  OR
  (empresa_id IS NULL AND is_admin_or_super())
);

-- Atualizar política de UPDATE
DROP POLICY IF EXISTS "Admin/Super podem atualizar clientes" ON public.clientes;

CREATE POLICY "Admin/Super podem atualizar clientes" 
ON public.clientes 
FOR UPDATE 
USING (
  is_super_admin() 
  OR 
  ((empresa_id = get_user_empresa_id()) AND is_admin_or_super())
  OR
  (empresa_id IS NULL AND is_admin_or_super())
);

-- Atualizar política de DELETE
DROP POLICY IF EXISTS "Admin/Super podem deletar clientes" ON public.clientes;

CREATE POLICY "Admin/Super podem deletar clientes" 
ON public.clientes 
FOR DELETE 
USING (
  is_super_admin() 
  OR 
  ((empresa_id = get_user_empresa_id()) AND is_admin_or_super())
  OR
  (empresa_id IS NULL AND is_admin_or_super())
);