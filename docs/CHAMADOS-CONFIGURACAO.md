# Chamados — configuração do Slack e do ZapContábil

A aba **Chamados** junta numa caixa de entrada só:

- **Slack, um por usuário:** cada pessoa da equipe clica em **Conectar meu Slack** e passa a receber, como chamados **dela**, as mensagens diretas para ela, as menções @ela em canais, todas as mensagens dos canais que ela escolher e as respostas nas threads que já viraram chamado dela.
- **ZapContábil (WhatsApp):** as mensagens de um canal (conexão ou fila), numa **fila comum** da empresa.

Quem vê o quê:

| Chamado | Quem vê |
|---|---|
| Slack (tem dono) | o dono, quem for colocado como responsável e os admins |
| WhatsApp (sem dono) | toda a empresa |

Pela aba dá para mudar o status, a prioridade e o responsável, vincular o chamado a um cliente e responder. A resposta volta para o Slack (com o nome de quem respondeu) ou para o WhatsApp. Mensagem direta do Slack só pode ser respondida pelo dono dela.

O botão **Relatório** mostra a quantidade de chamados por mês: abertos, resolvidos, pendentes no fim do mês, tempo de 1ª resposta e de resolução (mediana), e a divisão por atendente, cliente e origem, com exportação em CSV.

## 1. Banco de dados

No Supabase, abra **SQL Editor** e rode, nesta ordem (pule o que já rodou):

1. `supabase/migrations/20261005120000_chamados.sql`
2. `supabase/migrations/20261006120000_chamados_por_usuario.sql`

A segunda cria as conexões do Slack por usuário, o dono do chamado, as marcas de 1ª resposta e de resolução e a regra de contagem (veja o item 7).

## 2. Funções (Edge Functions)

As quatro funções ficam em `supabase/functions`:

| Função | Quem chama | Segurança |
|---|---|---|
| `slack-oauth` | o botão Conectar meu Slack e o retorno do Slack | usuário logado para iniciar; `state` de uso único no retorno |
| `slack-eventos` | Slack | assinatura do Slack (`SLACK_SIGNING_SECRET`) |
| `zapcontabil-webhook` | ZapContábil | token secreto na URL |
| `chamados-responder` | o sistema (botão Enviar) | usuário logado |

O `supabase/config.toml` já desliga a exigência de login (`verify_jwt`) em `slack-oauth`, `slack-eventos` e `zapcontabil-webhook`. As três verificam a segurança dentro do código.

Para publicar as funções:

```
supabase functions deploy slack-oauth slack-eventos zapcontabil-webhook chamados-responder
```

## 3. App do Slack (uma vez, pelo admin)

1. Acesse https://api.slack.com/apps → **Create New App** → **From a manifest** → escolha o workspace.
2. Cole o manifesto abaixo e confirme.
3. Em **Basic Information**, copie o **Client ID**, o **Client Secret** e o **Signing Secret**.
4. Ainda em **Basic Information → App-Level Tokens**, clique em **Generate Token and Scopes**, dê o nome `eventos`, adicione o escopo `authorizations:read` e copie o token (começa com `xapp-`).
5. **Não** precisa clicar em Install App: cada usuário instala para si pelo botão no sistema.

```yaml
display_information:
  name: ImperTech Chamados
  description: Leva DMs, menções e canais escolhidos de cada usuário para a aba Chamados do ImperTech CRM.
features:
  bot_user:
    display_name: ImperTech Chamados
    always_online: false
oauth_config:
  redirect_urls:
    - https://nxpblhykcakrdcnnzyyg.supabase.co/functions/v1/slack-oauth
  scopes:
    user:
      - im:history
      - mpim:history
      - channels:history
      - groups:history
      - im:read
      - mpim:read
      - channels:read
      - groups:read
      - users:read
      - chat:write
    bot:
      - users:read
settings:
  event_subscriptions:
    request_url: https://nxpblhykcakrdcnnzyyg.supabase.co/functions/v1/slack-eventos
    user_events:
      - message.im
      - message.mpim
      - message.channels
      - message.groups
    bot_events:
      - app_uninstalled
      - tokens_revoked
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

> Os eventos são **de usuário**: o Slack avisa as mensagens das conversas em que **cada usuário conectado** está. Para um canal virar chamado de alguém, essa pessoa precisa ser membro dele.
>
> O token `xapp-` (passo 4) serve para saber **todos** os usuários conectados que veem uma mensagem. Sem ele, quando duas pessoas conectadas estão no mesmo canal, o Slack avisa só uma delas.
>
> Usuários de **outro workspace** do Slack só conseguem conectar se o app estiver com **Manage Distribution → Activate Public Distribution** ligado.

## 4. Secrets no Supabase

Em **Project Settings → Edge Functions → Secrets**:

| Secret | Valor |
|---|---|
| `SLACK_CLIENT_ID` | Client ID do app |
| `SLACK_CLIENT_SECRET` | Client Secret do app |
| `SLACK_SIGNING_SECRET` | Signing Secret do app |
| `SLACK_APP_TOKEN` | App-Level Token (`xapp-…`) com `authorizations:read` |
| `ALLOWED_ORIGINS` | já existe; precisa ter o endereço do sistema (ex.: `https://license-scope-pro.lovable.app`), para onde o Slack volta depois de conectar |
| `ZAPCONTABIL_API_TOKEN` | já existe (usado pelo envio de WhatsApp) |
| `ZAPCONTABIL_BASE_URL` | opcional; padrão `https://api-imperial.zapcontabil.chat` |

O antigo `SLACK_USER_TOKEN` não é mais usado e pode ser apagado.

## 5. Cada usuário conecta o próprio Slack

Na aba **Chamados**, cada pessoa clica em **Conectar meu Slack**, autoriza no Slack e volta para o sistema. Depois, em **Meu Slack**, pode informar os **canais** cujas mensagens viram chamado para ela (IDs `C…`, separados por vírgula; o ID aparece no rodapé dos detalhes do canal). DMs e menções entram sempre, sem configurar nada.

Para parar de receber, **Meu Slack → Desconectar**. Os chamados antigos continuam no sistema.

## 6. Configuração no sistema (admin)

Em **Chamados → Integrações**:

- a lista de **quem já conectou o Slack** e quantos canais cada um escolheu;
- o **prazo de reabertura** (padrão 24 horas, veja o item 7);
- o **canal do ZapContábil**: o ID ou o nome da conexão ou fila. Deixe vazio para receber todas;
- a **URL do webhook do ZapContábil**, com o token. Cadastre essa URL no ZapContábil, na configuração de Webhook ou Integrações da conexão.

## 7. Como os chamados são contados

- Cada conversa tem no máximo **um chamado ativo** por dono.
- Ao marcar como **Resolvido**, o sistema grava a data. Se o contato voltar a falar **dentro do prazo de reabertura**, o mesmo chamado reabre (um "obrigado" não vira chamado novo). **Depois do prazo**, abre um **chamado novo**, que conta de novo no mês.
- A **1ª resposta** é gravada na primeira mensagem de saída, venha ela do sistema, do Slack ou do ZapContábil.

## 8. Formato do webhook do ZapContábil

A documentação pública do ZapContábil não descreve o webhook de mensagens recebidas. A função aceita os formatos comuns das plataformas tipo Whaticket (`{ msg, ticket }`, `{ data: { message, ticket } }` etc.) e guarda o payload original na coluna `chamado_mensagens.bruto`.

Se as mensagens chegarem sem nome ou sem texto, olhe o `bruto` de uma delas para ajustar a função `extrair` em `zapcontabil-webhook/index.ts`.
