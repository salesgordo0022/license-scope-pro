# Remix of Revenda Hub

Criar um Web SaaS multiempresa (multi-tenant) chamado "CRM SaaS - Licenças e Revendas". Sistema para gestão de clientes, controle de licenças de software, revendas e CRM básico, com isolamento por empresa usando Row Level Security (RLS). Autenticação via Supabase Auth com email/senha. 

Perfis de usuário: super_admin (acesso total), admin (administra sua empresa), revendedor (acesso limitado a clientes/licenças vinculados).

Arquitetura:
- Frontend: React
- Backend/BaaS: Supabase
- Banco: PostgreSQL com RLS
- Deploy frontend: Vercel

Entidades principais:
- empresa (id, nome, plano_id, status, created_at)
- usuario_perfil (user_id, empresa_id, tipo)
- cliente (id, empresa_id, nome_empresa, segmento, email, telefone, status, observacoes, created_at)
- licenca (id, empresa_id, cliente_id, tipo, quantidade, validade, status, created_at)
- revenda (id, empresa_id, cliente_id, revendedor_id, sistema, data_venda, created_at)
- modulo (id, nome)
- cliente_modulo (cliente_id, modulo_id)
- plano (nome, limite_clientes, limite_usuarios, preco)

Regras importantes:
- Multi-tenant obrigatório: usuário só acessa dados da sua empresa
- RLS no Supabase usando empresa_id vinculado ao auth.uid()
- Rotas protegidas por sessão
- Bloquear criação de clientes/usuários ao exceder limites do plano

Funcionalidades:
Dashboard com métricas (total de clientes, licenças ativas, licenças vencendo, clientes por segmento, módulos mais usados).
CRM: cadastro de clientes, filtros por segmento, busca, status.
Licenças: controle por cliente, validade, status, histórico de liberação.
Revendas: vínculo cliente-revendedor, relatório por revendedor, permissões limitadas.
Planos: controle de limites e preços.

Páginas do frontend:
- Login
- Dashboard
- Clientes
- Licenças
- Módulos
- Revendas
- Usuários

Design: UI moderna de SaaS B2B, layout limpo, sidebar com navegação, foco em produtividade.
Estado inicial: produto SaaS funcional, pronto para evoluir com billing, notificações e relatórios em PDF.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://license-scope-pro.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6cff00d6-b021-4c0a-97a0-56ed5b7d8de5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
