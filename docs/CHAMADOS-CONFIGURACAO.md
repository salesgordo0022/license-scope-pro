# Chamados — configuração do Slack e do ZapContábil

A aba **Chamados** junta numa caixa de entrada só:

- **Slack:** mensagens diretas para você, menções @você em canais, todas as mensagens dos canais escolhidos e as respostas nas threads que já viraram chamado.
- **ZapContábil (WhatsApp):** as mensagens de um canal (conexão ou fila).

Pela aba dá para mudar o status, a prioridade e o responsável, vincular o chamado a um cliente e responder. A resposta volta para o Slack ou para o WhatsApp.

## 1. Banco de dados

No Supabase, abra **SQL Editor** e rode o arquivo `supabase/migrations/20261005120000_chamados.sql`.

## 2. Funções (Edge Functions)

As três funções ficam em `supabase/functions`:

| Função | Quem chama | Segurança |
|---|---|---|
| `slack-eventos` | Slack | assinatura do Slack (`SLACK_SIGNING_SECRET`) |
| `zapcontabil-webhook` | ZapContábil | token secreto na URL |
| `chamados-responder` | o sistema (botão Enviar) | usuário logado |

O `supabase/config.toml` já desliga a exigência de login (`verify_jwt`) nas duas primeiras.

Para publicar as funções:

```
supabase functions deploy slack-eventos zapcontabil-webhook chamados-responder
```

## 3. App do Slack

1. Acesse https://api.slack.com/apps → **Create New App** → **From a manifest** → escolha o workspace.
2. Cole o manifesto abaixo e confirme.
3. Em **Install App**, clique em **Install to Workspace** e autorize.
4. Copie o **User OAuth Token** (começa com `xoxp-`).
5. Em **Basic Information**, copie o **Signing Secret**.

```yaml
display_information:
  name: ImperTech Chamados
  description: Leva DMs, menções e canais escolhidos para a aba Chamados do ImperTech CRM.
features:
  bot_user:
    display_name: ImperTech Chamados
    always_online: false
oauth_config:
  scopes:
    user:
      - im:history
      - mpim:history
      - channels:history
      - groups:history
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
  org_deploy_enabled: false
  socket_mode_enabled: false
  token_rotation_enabled: false
```

> Os eventos são **de usuário**: o Slack avisa as mensagens das conversas em que **você** está (suas DMs e os canais dos quais você participa). Para um canal virar chamado, você precisa ser membro dele.

## 4. Secrets no Supabase

Em **Project Settings → Edge Functions → Secrets**:

| Secret | Valor |
|---|---|
| `SLACK_SIGNING_SECRET` | Signing Secret do app |
| `SLACK_USER_TOKEN` | User OAuth Token (`xoxp-…`) |
| `ZAPCONTABIL_API_TOKEN` | já existe (usado pelo envio de WhatsApp) |
| `ZAPCONTABIL_BASE_URL` | opcional; padrão `https://api-imperial.zapcontabil.chat` |

## 5. Configuração no sistema

No sistema, abra **Chamados → Integrações** (só para admin) e preencha:

- **Seu ID no Slack.** No Slack, clique na sua foto → Perfil → ⋮ → **Copiar ID do membro**.
- **Canais escolhidos.** São os IDs dos canais (C…), separados por vírgula. O ID aparece no rodapé dos detalhes de cada canal.
- **Canal do ZapContábil.** Informe o ID ou o nome da conexão ou fila. Deixe vazio para receber todas.

Depois de salvar, a tela mostra:

- a **Request URL do Slack**, que já está no manifesto;
- a **URL do webhook do ZapContábil**, com o token. Cadastre essa URL no ZapContábil, na configuração de Webhook ou Integrações da conexão.

## 6. Formato do webhook do ZapContábil

A documentação pública do ZapContábil não descreve o webhook de mensagens recebidas. A função aceita os formatos comuns das plataformas tipo Whaticket (`{ msg, ticket }`, `{ data: { message, ticket } }` etc.) e guarda o payload original na coluna `chamado_mensagens.bruto`.

Se as mensagens chegarem sem nome ou sem texto, olhe o `bruto` de uma delas para ajustar a função `extrair` em `zapcontabil-webhook/index.ts`.
