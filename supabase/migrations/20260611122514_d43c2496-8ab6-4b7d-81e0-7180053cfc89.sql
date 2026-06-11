-- Drop existing restrictive policies for clientes
DROP POLICY IF EXISTS "Usuários veem clientes da sua empresa" ON public.clientes;
DROP POLICY IF EXISTS "Admin/Super podem criar clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin/Super podem atualizar clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admin/Super podem deletar clientes" ON public.clientes;

-- Create more robust policies for clientes
CREATE POLICY "Super admins veem todos os clientes" ON public.clientes
    FOR SELECT TO authenticated USING (is_super_admin());

CREATE POLICY "Admins veem clientes da empresa ou sem empresa" ON public.clientes
    FOR SELECT TO authenticated 
    USING (is_admin_or_super() AND (empresa_id = get_user_empresa_id() OR empresa_id IS NULL));

CREATE POLICY "Usuários veem clientes da sua empresa" ON public.clientes
    FOR SELECT TO authenticated USING (empresa_id = get_user_empresa_id());

CREATE POLICY "Admins e Supers gerenciam clientes" ON public.clientes
    FOR ALL TO authenticated 
    USING (is_admin_or_super())
    WITH CHECK (is_admin_or_super());

-- Ensure sistemas are visible
DROP POLICY IF EXISTS "Sistemas visíveis para autenticados" ON public.sistemas;
CREATE POLICY "Sistemas visíveis para todos autenticados" ON public.sistemas
    FOR SELECT TO authenticated USING (true);

-- Revendas policies fix
DROP POLICY IF EXISTS "Usuários veem revendas" ON public.revendas;
CREATE POLICY "Visibilidade de revendas" ON public.revendas
    FOR SELECT TO authenticated 
    USING (
        is_super_admin() OR 
        is_admin_or_super() OR 
        empresa_id = get_user_empresa_id() OR
        revendedor_id IN (SELECT id FROM usuario_perfil WHERE user_id = auth.uid())
    );

-- Grant necessary permissions just in case
GRANT SELECT ON public.clientes TO authenticated;
GRANT SELECT ON public.sistemas TO authenticated;
GRANT SELECT ON public.revendas TO authenticated;
GRANT SELECT ON public.usuario_perfil TO authenticated;