
ALTER TABLE public.clientes
  ADD COLUMN cnpj text DEFAULT '',
  ADD COLUMN endereco text DEFAULT '',
  ADD COLUMN cidade text DEFAULT '',
  ADD COLUMN estado text DEFAULT '';
