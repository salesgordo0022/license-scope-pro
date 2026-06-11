-- Drop restrictive policies that might be blocking access
DROP POLICY IF EXISTS "Admins e Supers gerenciam clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admins veem clientes da empresa ou sem empresa" ON public.clientes;
DROP POLICY IF EXISTS "Super admins veem todos os clientes" ON public.clientes;
DROP POLICY IF EXISTS "Usuários veem clientes da sua empresa" ON public.clientes;
DROP POLICY IF EXISTS "Admins e Supers gerenciam sistemas" ON public.sistemas;
DROP POLICY IF EXISTS "Admin gerencia sistemas" ON public.sistemas;
DROP POLICY IF EXISTS "Sistemas visíveis para todos autenticados" ON public.sistemas;
DROP POLICY IF EXISTS "Admin gerencia revendas" ON public.revendas;
DROP POLICY IF EXISTS "Visibilidade de revendas" ON public.revendas;

-- Create simplified and robust policies
CREATE POLICY "Permitir leitura para todos autenticados" ON public.clientes
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Permitir gestão para admins e supers" ON public.clientes
    FOR ALL TO authenticated 
    USING (EXISTS (SELECT 1 FROM public.usuario_perfil WHERE user_id = auth.uid() AND tipo IN ('super_admin', 'admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.usuario_perfil WHERE user_id = auth.uid() AND tipo IN ('super_admin', 'admin')));

CREATE POLICY "Sistemas visíveis para todos autenticados" ON public.sistemas
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Sistemas gerenciaveis por admins e supers" ON public.sistemas
    FOR ALL TO authenticated 
    USING (EXISTS (SELECT 1 FROM public.usuario_perfil WHERE user_id = auth.uid() AND tipo IN ('super_admin', 'admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.usuario_perfil WHERE user_id = auth.uid() AND tipo IN ('super_admin', 'admin')));

CREATE POLICY "Revendas visíveis para todos autenticados" ON public.revendas
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Revendas gerenciaveis por admins e supers" ON public.revendas
    FOR ALL TO authenticated 
    USING (EXISTS (SELECT 1 FROM public.usuario_perfil WHERE user_id = auth.uid() AND tipo IN ('super_admin', 'admin')))
    WITH CHECK (EXISTS (SELECT 1 FROM public.usuario_perfil WHERE user_id = auth.uid() AND tipo IN ('super_admin', 'admin')));

-- Ensure profile is readable
DROP POLICY IF EXISTS "Perfis são visíveis por usuários autenticados" ON public.usuario_perfil;
CREATE POLICY "Perfis visíveis por todos autenticados" ON public.usuario_perfil
    FOR SELECT TO authenticated USING (true);

-- Explicitly grant permissions
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
