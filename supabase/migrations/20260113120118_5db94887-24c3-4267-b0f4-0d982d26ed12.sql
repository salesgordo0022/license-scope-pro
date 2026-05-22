-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Admin gerencia segmentos" ON public.segmentos;

-- Create a PERMISSIVE policy for admins to manage segmentos
CREATE POLICY "Admin gerencia segmentos" 
ON public.segmentos 
FOR ALL 
TO authenticated
USING (is_admin_or_super())
WITH CHECK (is_admin_or_super());