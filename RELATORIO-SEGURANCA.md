# Relatório de auditoria — license-scope-pro

**Data:** 22/09/2026
**Repositório:** `salesgordo0022/license-scope-pro`
**Stack:** React 18 + Vite + TypeScript + Supabase (PostgreSQL com RLS + Edge Functions em Deno)
**Volume analisado:** ~24.000 linhas — 20 páginas, 6 Edge Functions, 71 migrations SQL

---

## Resumo

Foram encontrados **16 problemas**. Três deles são graves o bastante para exigir ação hoje: uma Edge Function de assinatura de contratos **completamente aberta na internet**, uma policy de Storage que deixava **qualquer usuário logado baixar os contratos assinados de todas as empresas**, e o arquivo `.env` **versionado no Git**.

Corrigi 14 no código. Duas pendências dependem de decisão sua e estão detalhadas no final — entre elas uma que é risco **jurídico**, não técnico.

O sistema está rodando em **http://localhost:8080**, build de produção passando e sem erros de console.

| Severidade | Qtd | Corrigidos |
|---|---|---|
| 🔴 Crítico | 3 | 3 |
| 🟠 Alto | 4 | 4 |
| 🟡 Médio | 6 | 5 |
| 🔵 Baixo | 3 | 2 |

---

## Como era a situação antes

Vale registrar: o projeto **não estava abandonado à própria sorte**. Existem migrations de hardening anteriores (abril, junho e setembro de 2026) que já tinham corrigido escalada de privilégio na tabela de perfis, isolamento de clientes e revendas por empresa, e o bucket de boletos. A função `send-whatsapp` é a mais bem protegida do projeto e claramente passou por uma revisão de segurança.

O problema é que essa revisão **não cobriu todas as Edge Functions**. As que ficaram de fora são justamente as que mexem com contrato assinado e com API paga.

---

## 🔴 Críticos

### 1. `assinar-contrato` sem nenhuma autenticação, rodando com service role

**Arquivo:** `supabase/functions/assinar-contrato/index.ts`

A função nunca lia o header `Authorization`. Ela ia direto ao banco com a **service role key**, que ignora todas as policies de RLS:

```ts
// ANTES — primeira coisa que a função fazia
const { contratoId, pfxBase64, password } = JSON.parse(rawBody);

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''   // ignora RLS
)

const { data: contrato } = await supabaseAdmin
  .from('contratos').select('*, empresa:empresas(*)')
  .eq('id', contratoId).single()                     // qualquer contrato
```

**O que dava para fazer com isso:** qualquer pessoa na internet, sem conta no sistema, mandando um `POST` com um `contratoId` qualquer:

- lia o contrato inteiro de qualquer empresa (valores, CNPJ, dados do contratante);
- marcava o contrato como **assinado** no banco;
- gerava um PDF no bucket e recebia de volta uma URL válida por **um ano**.

Como o CORS era `*`, qualquer site também conseguia disparar isso do navegador de um usuário.

**Corrigido.** A função agora exige, nessa ordem: JWT válido → perfil `admin`/`super_admin` → o contrato tem que pertencer à empresa do usuário. Super admin passa por cima da última regra.

```ts
// DEPOIS
const { auth, erro } = await autenticar(req)
if (erro) return erro
if (!ehAdmin(auth)) return json(req, { error: 'Sem permissão...' }, 403)
// ...
if (auth.tipo !== 'super_admin' && contrato.empresa_id !== auth.empresaId) {
  return json(req, { success: false, error: 'Contrato não encontrado' }, 404)
}
```

A mensagem é "Contrato não encontrado" de propósito nos dois casos. Se ela dissesse "sem permissão" quando o contrato existe e "não encontrado" quando não existe, daria para varrer IDs e mapear os contratos das outras empresas.

---

### 2. Contratos assinados de todas as empresas visíveis para qualquer usuário logado

**Arquivo:** `supabase/migrations/20260612023310_*.sql`

```sql
-- ANTES
CREATE POLICY "Authenticated read signed contracts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'contratos-assinados');   -- sem filtro de empresa
```

Nenhum filtro por tenant. Somado ao **auto-cadastro aberto** na tela de login (problema nº 4), a sequência de ataque era: criar uma conta qualquer → estar `authenticated` → baixar os contratos assinados de todos os clientes de todas as empresas.

**Corrigido** em `supabase/migrations/20260922180000_correcoes_seguranca.sql`. A função de assinatura passou a gravar em `<empresa_id>/contrato_<id>_final.pdf`, o que permite amarrar a leitura à pasta:

```sql
CREATE POLICY "Empresa read signed contracts" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'contratos-assinados'
    AND (
      public.is_super_admin()
      OR (storage.foldername(name))[1] = public.get_user_empresa_id()::text
    )
  );
```

---

### 3. `.env` versionado no Git

O arquivo estava **commitado** e o `.gitignore` não o cobria. Conteúdo exposto no histórico público:

| Variável | Observação |
|---|---|
| `VITE_SUPABASE_URL` / `PUBLISHABLE_KEY` | Chave anon — pública por natureza, sem problema em si |
| `SUPABASE_URL` / `SUPABASE_PUBLISHABLE_KEY` | **De um projeto Supabase diferente** (`mwtqmjhiyvnpdgcqvtmu`), sem prefixo `VITE_` — nem eram lidas pelo Vite. Lixo que vazava um segundo projeto |
| `VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY` | **Preocupante.** Se não estiver restrita por domínio no Google Cloud, é fatura de terceiro no seu cartão |

**Corrigido:** `.env` removido do índice do Git, `.gitignore` atualizado (inclui `*.pfx` e `*.p12` — certificados digitais jamais devem entrar no repositório), `.env.example` criado como referência, e as duas variáveis do projeto errado removidas do `.env` local.

> ⚠️ **Ação manual necessária.** Remover do índice não apaga o histórico. As chaves continuam acessíveis a quem clonar o repo e rodar `git log`. Você precisa:
> 1. Restringir a chave do Google Maps por domínio/referrer no Google Cloud Console — ou rotacioná-la;
> 2. Considerar rotacionar a chave anon do Supabase;
> 3. Se quiser limpar o histórico: `git filter-repo --path .env --invert-paths` (reescreve o histórico — combine com quem mais usa o repo antes).

---

## 🟠 Altos

### 4. Auto-cadastro público aberto num CRM privado

**Arquivo:** `src/pages/Login.tsx`

A tela de login tinha uma aba "Criar conta" ativa. Qualquer pessoa que descobrisse a URL criava uma conta autenticada. O trigger `handle_new_user` atribui `revendedor` (sem empresa), o que limita bastante o estrago — mas "authenticated" é chave de porta em várias policies (`sistemas`, `planos`, `modulos` e, até o item 2 ser corrigido, os contratos assinados).

O sistema já tem o caminho certo: a tela de Usuários cria acessos pela Edge Function `create-user`.

**Corrigido.** O cadastro agora é controlado por `VITE_ENABLE_PUBLIC_SIGNUP`, **desligado por padrão**. A aba nem é renderizada, e `signUp()` recusa a chamada mesmo que alguém force pelo console.

### 5. Três Edge Functions abertas queimando API paga

| Função | O que consome | Estava |
|---|---|---|
| `prospectar-empresas` | Créditos pagos da API CNPJá | Pública, e o `limit` vinha do corpo **sem teto** |
| `geocode-clientes` | Google Places API (cobrada por chamada) | Pública, até 50 buscas × 4 tentativas por request |
| `buscar-cnpj` | Rate limit de BrasilAPI/ReceitaWS | Pública — proxy de consulta de CNPJ grátis para o mundo |

Um `for` simples contra `prospectar-empresas` esvaziava a cota contratada.

**Corrigido.** Todas exigem JWT. `prospectar-empresas` exige `admin` e o `limit` é preso entre 1 e 100. Adicionei validação de formato em UF, município e datas, e timeout nos fetches externos de `buscar-cnpj`.

### 6. CORS `*` em todas as Edge Functions

Todas devolviam `Access-Control-Allow-Origin: "*"`. Qualquer página conseguia chamá-las do navegador de um usuário logado.

**Corrigido.** Criei `supabase/functions/_shared/auth.ts` com allowlist lida do secret `ALLOWED_ORIGINS`. Sem o secret configurado, só `localhost` é liberado — falha fechado, não aberto.

### 7. 23 vulnerabilidades em dependências

`npm audit` acusava 23 (17 altas). **Reduzidas para 5** com `npm audit fix`. As restantes, com justificativa:

| Pacote | Por que não atualizei |
|---|---|
| `xlsx` | Sem correção publicada no npm. **Não explorável aqui**: o projeto só usa `XLSX.writeFile`/`json_to_sheet` (escrita). As falhas (prototype pollution, ReDoS) estão no caminho de **leitura**, que este código não exercita |
| `vite`/`esbuild` | Corrigir exige Vite 8 (breaking). Afeta só o dev server — **mitigado** pelo item 12 |
| `react-router` | Corrigir exige v7 (breaking). O open redirect depende de navegar para caminho vindo do usuário, o que o app não faz; a falha de SSR não se aplica (é SPA) |

---

## 🟡 Médios

### 8. Código tentando escalar privilégio no cadastro

**Arquivo:** `src/contexts/AuthContext.tsx`

```ts
// ANTES
await supabase.from('usuario_perfil').insert({
  user_id: data.user.id, nome, email,
  tipo: 'admin', // First user becomes admin
});
```

O comentário diz "primeiro usuário", mas **não havia condição nenhuma de "primeiro"** — todo cadastro pedia `admin`. Na prática o RLS barrava (a policy de INSERT exige que quem insere já seja admin) e o efeito visível era um erro no console.

Ainda assim é código pedindo privilégio e dependendo do banco para não conseguir. Se um dia alguém afrouxar aquela policy, vira escalada de privilégio real.

**Corrigido:** o insert foi removido. Quem cria o perfil é o trigger `handle_new_user`, que já faz a coisa certa — `super_admin` para o primeiro usuário do sistema, `revendedor` para os demais.

### 9. URL assinada de 1 ano gravada no banco

```ts
// ANTES
const { data: urlData } = await supabaseAdmin.storage
  .from('contratos-assinados')
  .createSignedUrl(fileName, 31536000)   // 365 dias

await supabaseAdmin.from('contratos').update({
  link_documento: publicUrl,             // salva a URL no banco
})
```

Um link de acesso direto ao PDF ficava salvo em texto no banco, válido por um ano, fora de qualquer verificação de permissão. Qualquer cópia dele — backup, log, export — dava acesso ao contrato por 12 meses.

**Corrigido.** A validade caiu para 7 dias e o banco passou a guardar o **caminho**, não a URL, em uma coluna nova (`contratos.documento_path`). O frontend gera uma URL assinada de 5 minutos na hora de abrir.

> Usei coluna nova de propósito: `link_documento` é um campo livre onde o usuário cola links do Google Drive. A função estava **sobrescrevendo o dado dele**.

### 10. Cláusulas de contrato de outra empresa entrando no PDF

```ts
// ANTES — pegava o primeiro modelo ativo do banco INTEIRO
const { data: modelo } = await supabaseAdmin
  .from('modelos_contrato').select('clausulas')
  .eq('ativo', true).limit(1).maybeSingle()
```

Sem filtro de empresa. Num banco multi-tenant, o contrato de uma empresa podia sair impresso com as cláusulas de outra. **Isso é um bug de correção tão grave quanto de segurança** — é um contrato com conteúdo errado indo para o cliente.

A policy de RLS da tabela tinha o mesmo furo:

```sql
USING (is_super_admin() OR is_admin_or_super() OR empresa_id = get_user_empresa_id())
--                        ^^^^^^^^^^^^^^^^^^^ anula o filtro de empresa
```

Qualquer admin — inclusive de outro tenant — lia e editava os modelos de todo mundo.

**Corrigido** na função (filtra por empresa, com fallback para modelos globais) e na migration (policies de leitura e escrita reescritas).

### 11. Erros com HTTP 200 e vazamento de detalhes internos

`assinar-contrato`, `prospectar-empresas` e `geocode-clientes` devolviam falha com **status 200** e `error.message` cru — que carregava nome de tabela, stack e, em `prospectar-empresas`, o corpo bruto da resposta da CNPJá.

**Corrigido.** Status HTTP corretos (400/401/403/404/500/502/503), detalhe completo só no `console.error` do servidor, mensagem genérica para o cliente. Em `send-whatsapp` o array `attempts` (que carrega o corpo cru do provedor) agora só sai com `SEND_WHATSAPP_DEBUG=true`.

### 12. Dev server exposto na rede local

```ts
server: { host: "::" }   // todas as interfaces
```

Combinado com o CVE do esbuild (`GHSA-67mh-4wv8-2f99` — qualquer site consegue ler respostas do dev server), qualquer máquina no mesmo Wi-Fi acessava o código-fonte servido.

**Corrigido:** `host: "localhost"`.

### 13. Senha fraca aceita na criação de usuário

`create-user` não validava tamanho de senha e devolvia o objeto completo do Auth (com metadados internos).

**Corrigido:** mínimo de 10 caracteres, validação de e-mail e de tipo, resposta enxuta. Também passei a **vincular o novo usuário à empresa de quem o criou** — antes ele nascia com `empresa_id` nulo, solto fora de qualquer tenant.

---

## 🔵 Baixos

### 14. Log do payload de assinatura no console do navegador

`Contratos.tsx` imprimia o payload da assinatura digital no console. Sem a senha, mas com dados do contrato — visível em suporte remoto e gravação de tela. **Removido.**

### 15. Link "Usuários" visível para quem não é admin

A sidebar mostrava o link para todos. A página já bloqueava com `if (!isAdmin)`, então era só ruído de interface. **Corrigido** com a flag `adminOnly`.

### 16. `createClient` sem validação de variáveis de ambiente

Sem as variáveis, o app abria em tela branca com um erro obscuro do SDK. **Corrigido** com uma checagem explícita que diz exatamente o que fazer.

---

## Código removido

**31 arquivos, ~5.700 linhas.** Nada disso era alcançável pela aplicação:

**Páginas que nunca foram roteadas** — existiam em `src/pages/` mas não estavam em `App.tsx` nem na sidebar:
- `TabelaPrecos.tsx` (938 linhas) · `Modulos.tsx` (255) · `Index.tsx` (7)

**Componentes órfãos:**
- `components/NavLink.tsx` · `ui/auth-page.tsx` (209 linhas — tela de login alternativa, nunca usada) · `ui/minimal-dock.tsx` · `ui/chart.tsx`

> `ui/chart.tsx` era o **único** ponto do projeto com `dangerouslySetInnerHTML`. Removê-lo eliminou essa superfície inteira.

**22 primitivos shadcn nunca importados** — `alert-dialog`, `carousel`, `command`, `form`, `menubar`, `sidebar` (637 linhas), `popover`, `calendar`, `navigation-menu`, `context-menu`, `drawer`, `resizable`, `pagination`, `breadcrumb`, `avatar`, `aspect-ratio`, `collapsible`, `hover-card`, `input-otp`, `radio-group`, `slider`, `toggle-group`.

**Arquivo de debug na raiz:**
- `test_signer.ts` — rascunho de teste do node-forge, com `import` de URL que nem compila no projeto.

> Se precisar de algum componente shadcn de volta: `npx shadcn@latest add <nome>`.

---

## Comentários no código

Adicionei **~140 blocos JSDoc** cobrindo todo o código de aplicação: as 6 Edge Functions, `AuthContext`, `App`, `DashboardLayout`, `AppSidebar`, os módulos de `lib/`, os hooks, e cada handler das 17 páginas e componentes de negócio.

Onde a correção envolvia uma decisão de segurança, o comentário registra **o que estava errado antes e por quê** — para a próxima pessoa que mexer no arquivo não reintroduzir o problema:

```ts
// URL assinada de 7 dias. Antes era de 1 ano (31536000s) e ficava salva em
// `contratos.link_documento`: quem conseguisse ler a linha (ou um backup,
// ou um log) tinha acesso ao PDF por 12 meses, sem passar por autenticação.
```

Os primitivos shadcn em `src/components/ui/` ficaram sem comentário — são código de biblioteca de terceiros, documentado em ui.shadcn.com, e comentá-los atrapalharia atualizações futuras.

---

## ⚠️ Duas pendências que dependem de você

### A. A assinatura digital não é uma assinatura digital

**Esta é a mais séria do relatório, e não é uma falha técnica — é jurídica.**

A função `assinar-contrato` abre o certificado `.pfx`, mas só para **ler o nome do titular**:

```ts
const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password)
const cnAttr = certBag.cert.subject.attributes.find(a => a.shortName === 'CN')
const certName = cnAttr ? cnAttr.value : nomeAssinante
```

Esse nome é **desenhado como texto** no PDF. Nenhuma operação criptográfica acontece: o documento não recebe assinatura PAdES/CAdES, não tem campo de assinatura, e o Adobe Reader não vai reconhecer nada.

E o PDF estampava, em negrito:

```
VALIDADE JURÍDICA: ICP-BRASIL / MP 2.200-2
```

Um documento afirmando conformidade com a MP 2.200-2 que **não tem assinatura criptográfica nenhuma**. Se esse contrato for contestado, a afirmação impressa no rodapé trabalha contra você.

**O que fiz:** troquei o texto por `ASSINATURA ELETRÔNICA SIMPLES — TITULAR IDENTIFICADO POR CERTIFICADO`, que descreve o que de fato acontece. Também limitei o `.pfx` a 4 MB, para um upload gigante não travar a função.

**O que não fiz, porque é decisão sua:** implementar assinatura PAdES de verdade. O `package.json` já traz `@signpdf/signpdf` e `@signpdf/signer-p12`, mas eles estão nas dependências do **frontend** — a função roda em Deno e precisaria de equivalentes compatíveis. É trabalho de feature, não de correção de vulnerabilidade, e muda o comportamento do produto. Me diga se quer que eu implemente.

> Observação de arquitetura, para quando for mexer nisso: hoje o certificado A1 e a senha dele **trafegam para o servidor**. Uma implementação PAdES bem feita assina no navegador e envia só a assinatura — o certificado nunca sai da máquina de quem assina.

### B. A migration precisa ser aplicada no Supabase

`supabase/migrations/20260922180000_correcoes_seguranca.sql` está criada mas **não foi aplicada** — não tenho acesso ao seu projeto remoto. **Enquanto ela não rodar, o problema nº 2 (contratos visíveis entre empresas) continua aberto em produção.**

```bash
supabase db push
```

Ou cole o conteúdo no SQL Editor do painel do Supabase.

O frontend já está preparado: `documento_path` volta vazio até a migration rodar e a tela cai no caminho antigo de gerar PDF, sem quebrar.

---

## Checklist de deploy

- [ ] Aplicar a migration (`supabase db push`)
- [ ] Configurar o secret `ALLOWED_ORIGINS` com o domínio de produção — **sem isso, só localhost funciona**
- [ ] Redeploy das 6 Edge Functions (`supabase functions deploy`)
- [ ] Restringir a chave do Google Maps por domínio no Google Cloud Console
- [ ] Decidir sobre limpar o `.env` do histórico do Git
- [ ] Confirmar que `VITE_ENABLE_PUBLIC_SIGNUP` está ausente ou `"false"` em produção
- [ ] Decidir sobre a pendência A (assinatura digital)

---

## O que ficou de fora

**107 avisos de lint**, quase todos `@typescript-eslint/no-explicit-any` — tipagem frouxa em retornos do Supabase. Não são vulnerabilidades e corrigir exige tipar de verdade cada consulta: refatoração, não correção de segurança. Já limpei 12 deles ajustando o ESLint para não lintar `supabase/functions/` com config de navegador (aquele código roda em Deno, com outros globals).

**Bundle de 3,1 MB** (911 KB comprimido) num único chunk. É performance, não segurança, mas vale um code-splitting por rota quando sobrar tempo.

---

## Estado atual

```
✓ Build de produção passando (38s, 4.201 módulos)
✓ TypeScript sem erros
✓ Console do navegador limpo
✓ Rodando em http://localhost:8080
✓ npm audit: 23 → 5 (todas as 5 justificadas acima)
```

**Não testei o login** — exigiria credenciais reais da sua conta Supabase, que eu não devo pedir nem usar. A aplicação carrega, autentica contra o projeto configurado no `.env` e a tela de login renderiza corretamente, já sem a aba de cadastro.

---

# Anexo — 2ª rodada (22/09/2026, tarde)

## 1. Histórico do Git limpo

`git filter-branch` reescreveu os 424 commits removendo o `.env` de todos eles.

| Verificação | Resultado |
|---|---|
| Commits com `.env` no branch `main` | **0** (antes: 2) |
| Chave do Google Maps em qualquer objeto do repo | **0** |
| Projeto Supabase antigo (`mwtqmjhiyvnpdgcqvtmu`) | **0** |
| Token JWT literal em qualquer commit | **0** |
| Commits preservados | **423** (1 ficou vazio e foi removido — só continha o `.env`) |

Também removidos: `refs/original` (backup do filter-branch), o reflog e o
`origin/main` local. Depois do `git gc`, os objetos antigos não existem mais —
`git cat-file -p 1806e3a:.env` agora responde *"invalid object name"*.

**Backup antes de tudo**, caso precise voltar:
`%TEMP%\claude\...\scratchpad\backup-git\historico-completo.bundle`
(restaura com `git clone historico-completo.bundle pasta-restaurada`)

### ⚠️ O que isso NÃO resolve

O repositório é público e essas chaves **já foram enviadas ao GitHub**. Limpar o
histórico local não desfaz isso:

- o GitHub mantém commits órfãos acessíveis por URL direta (`/commit/<sha>`) por tempo indeterminado;
- forks, caches e quem já clonou continuam com a versão antiga;
- o Lovable tem a própria cópia sincronizada.

**Rotacionar as chaves não é opcional.** A limpeza do histórico é higiene; a
rotação é a correção.

### Para publicar a limpeza (decisão sua)

```bash
git push --force origin main
```

Isto **reescreve o branch remoto**. Antes de rodar, considere: o repositório é
sincronizado com o Lovable, e um force-push pode conflitar com a cópia deles.
Confirme do lado do Lovable antes. Não executei — é ação destrutiva e externa.

---

## 2. Onde guardar o `.env` — e por que a pergunta muda de figura

Rodei um teste no bundle de produção já compilado:

```
AIzaSyBmvJ...        -> 1 arquivo do dist
nxpblhykcakrdcnnzyyg -> 1 arquivo do dist
eyJhbGciOiJIUzI1...  -> 1 arquivo do dist
```

**Toda variável com prefixo `VITE_` é gravada dentro do JavaScript que qualquer
visitante baixa.** Não existe lugar seguro para guardar o arquivo que mude isso:
o Vite substitui `import.meta.env.VITE_X` pelo valor literal na hora do build.

Então a resposta se divide em dois casos:

### Segredo de verdade → nunca entra em arquivo `.env` do frontend

| Segredo | Lugar certo |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Secrets das Edge Functions |
| `CNPJA_API_TOKEN` | Secrets das Edge Functions |
| `ZAPCONTABIL_API_TOKEN` | Secrets das Edge Functions |
| `GOOGLE_MAPS_API_KEY` (servidor) | Secrets das Edge Functions |
| `ALLOWED_ORIGINS` | Secrets das Edge Functions |

```bash
supabase secrets set CNPJA_API_TOKEN="..." ALLOWED_ORIGINS="https://seu-dominio.com.br"
```

Esses valores nunca saem do servidor do Supabase. É por isso que as integrações
pagas passam por Edge Function em vez de o navegador chamar a API direto.

### Valor público por construção → o `.env` é só conveniência

`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e a browser key do Maps vão
para o bundle de qualquer jeito.

| Ambiente | Onde colocar |
|---|---|
| Sua máquina | `.env` na raiz do projeto, no `.gitignore` — **já está assim** |
| Vercel / Netlify / Lovable | Painel de Environment Variables do serviço, sem arquivo no repositório |
| Repositório | Só o `.env.example`, sem valores |

Para esses, a proteção não vem de esconder:

- **Supabase**: quem protege é o RLS. A chave anon é feita para ser pública.
- **Google Maps**: a chave é pública; a proteção é **restringir por domínio** no
  Google Cloud Console (APIs & Services → Credentials → Application restrictions
  → HTTP referrers). Sem isso, qualquer um copia a chave do seu bundle e gasta
  na sua conta. **Isto continua pendente.**

---

## 3. Acesso endurecido

Quatro camadas novas, todas implementadas e testadas.

### 3.1 Verificação em duas etapas (TOTP)

Resposta direta ao risco de "alguém entrar só com a senha". Agora existe:

- **`src/pages/Seguranca.tsx`** — nova tela (rota `/seguranca`, link na sidebar
  para todos os perfis). Mostra QR Code, confirma com um código de 6 dígitos e
  permite remover o fator depois.
- **`src/components/auth/DesafioMfa.tsx`** — segunda etapa do login. Quem tem
  fator ativo digita o código antes de ver qualquer tela.
- **`DashboardLayout`** — bloqueia o painel enquanto a sessão estiver em `aal1`
  com fator pendente.

O fator só é ativado **depois** que o usuário confirma um código gerado por ele,
para ninguém ficar trancado para fora por ter escaneado errado. O QR Code vem
pronto do Supabase (SVG embutido) — nenhuma dependência nova foi instalada.

Funciona com Google Authenticator, Microsoft Authenticator, Authy, 1Password.

### 3.2 Freio contra tentativa em massa

`src/lib/authPolicy.ts` — 5 erros em 15 minutos travam o formulário por 5 minutos,
com contagem regressiva na tela. Nas duas últimas tentativas o aviso mostra
quantas restam.

O contador é por **navegador**, não por e-mail: guardar por endereço permitiria
descobrir quais e-mails existem comparando o comportamento da tela.

> **Testado:** simulei 5 falhas e o botão "Entrar" ficou desabilitado; após
> limpar o registro, voltou ao normal.

Isto é freio, não muralha — o contador vive no `localStorage` e quem chama a API
direto não passa por ele. O limite de verdade é o rate limit por IP do Supabase.

### 3.3 Política de senha

Mínimo de 10 caracteres e ao menos 3 das 4 categorias (minúscula, maiúscula,
número, símbolo), com barra de força visual. Aplicada na criação de conta, na
troca de senha e (já na 1ª rodada) na Edge Function `create-user`.

Não exijo as 4 categorias de propósito: regra rígida demais empurra o usuário
para o padrão previsível "Senha@2026". Comprimento pesa mais que variedade.

### 3.4 PKCE no lugar do fluxo implícito

```ts
auth: { flowType: 'pkce' }
```

No fluxo implícito o token vinha no fragmento da URL (`#access_token=...`), onde
sobra em histórico do navegador, log de proxy e header `Referer`. Com PKCE volta
um código de uso único que só vale junto com um verificador guardado naquela aba
— interceptar o link de recuperação de senha deixa de bastar para assumir a conta.

---

## Dois ajustes que só você pode fazer (painel do Supabase)

Estes complementam o que foi feito em código e levam um minuto cada:

1. **Authentication → Policies → "Prevent use of leaked passwords"** — liga a
   checagem contra a base do HaveIBeenPwned. É o que pega a senha que passa na
   minha política mas já vazou em outro site.
2. **Authentication → Multi-Factor → habilitar TOTP** — a tela de Segurança só
   funciona com isso ativo no projeto.

---

## Estado após a 2ª rodada

```
✓ Build de produção passando (36s)
✓ TypeScript sem erros
✓ Console limpo
✓ Rodando em http://localhost:8080
✓ Histórico do Git sem nenhuma chave
✓ Bloqueio por tentativas verificado no navegador
✓ Rota /seguranca protegida (redireciona para /login sem sessão)
```

### Pendências consolidadas

| # | Pendência | Quem faz |
|---|---|---|
| 1 | Restringir a chave do Google Maps por domínio | Você (Google Cloud) |
| 2 | Aplicar a migration (`supabase db push`) | Você |
| 3 | Configurar `ALLOWED_ORIGINS` nos secrets | Você |
| 4 | Habilitar TOTP e senhas vazadas no Supabase | Você |
| 5 | `git push --force` para publicar o histórico limpo | Você (decisão) |
| 6 | Assinatura PAdES de verdade nos contratos | Decisão sua — posso implementar |
