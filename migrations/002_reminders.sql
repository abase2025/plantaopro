-- PlantãoPro — migração 002: lembretes + push subscriptions
-- Idempotente (IF NOT EXISTS). Cria apenas o que falta. Seguro rodar várias vezes.

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            SERIAL PRIMARY KEY,
  usuario_id    INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL UNIQUE,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user  ON push_subscriptions(usuario_id);

CREATE TABLE IF NOT EXISTS reminders_log (
  id            SERIAL PRIMARY KEY,
  plantao_id    INT NOT NULL REFERENCES plantoes(id) ON DELETE CASCADE,
  medico_id     INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  offset_horas  INT NOT NULL,                 -- ex: -24, -3, -1, 0, +1, +24
  canal         TEXT NOT NULL CHECK (canal IN ('email','push','ambos')),
  status        TEXT NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado','falhou')),
  erro          TEXT,
  enviado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plantao_id, med_code, offset_horas) -- seguro, mesmo plantão não gera 2x
);
-- O índice composto acima rejeita duplicatas automaticamente. Se quiser separar por canal,
-- troque a constraint para (plantao_id, medico_id, offset_horas, canal). Para o app o envio é
-- consolidado: 1 row por plantão+offset_horas, status unificado.
ALTER TABLE reminders_log DROP CONSTRAINT IF EXISTS reminders_log_plantao_id_med_code_offset_horas_key;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='reminders_log_plantao_id_medico_id_offset_horas_key') THEN
    ALTER TABLE reminders_log ADD CONSTRAINT reminders_log_plantao_id_medico_id_offset_horas_key UNIQUE (plantao_id, medico_id, offset_horas);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_reminders_plantao ON reminders_log(plantao_id);
CREATE INDEX IF NOT EXISTS idx_reminders_enviado ON reminders_log(enviado_em DESC);
