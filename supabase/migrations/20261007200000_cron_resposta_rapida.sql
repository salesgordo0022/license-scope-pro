-- As functions chamadas pelo pg_cron passaram a responder na hora e trabalhar
-- em segundo plano. O tempo de espera das chamadas cai para 10 s: com 150 s as
-- conexões ficavam presas e as chamadas seguintes estouravam o tempo.
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('envios-agendados', 'chamados-zap-sincronizar');

  PERFORM cron.schedule(
    'envios-agendados',
    '*/2 * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://nxpblhykcakrdcnnzyyg.supabase.co/functions/v1/envios-agendados?token=' || valor,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{"acao": "executar"}'::jsonb,
        timeout_milliseconds := 10000
      )
      FROM public.integracao_segredos
      WHERE chave = 'ENVIOS_CRON_TOKEN'
    $job$
  );

  PERFORM cron.schedule(
    'chamados-zap-sincronizar',
    '* * * * *',
    $job$
      SELECT net.http_post(
        url := 'https://nxpblhykcakrdcnnzyyg.supabase.co/functions/v1/zapcontabil-sincronizar?empresa=' || empresa_id || '&token=' || zap_webhook_token,
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      )
      FROM public.chamados_config
      WHERE coalesce(btrim(zap_filtro), '') <> ''
    $job$
  );
END $$;
