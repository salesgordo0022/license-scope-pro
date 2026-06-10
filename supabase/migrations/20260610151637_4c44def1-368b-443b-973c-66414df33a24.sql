ALTER TABLE public.clientes ADD COLUMN data_entrada DATE;

COMMENT ON COLUMN public.clientes.data_entrada IS 'Data de entrada/cadastro do cliente';