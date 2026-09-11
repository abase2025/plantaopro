-- PlantãoPro — migração 005: WhatsApp opt-in + log idempotente multi-canal
-- Tudo gira em torno de plantoes_lembretes (FK ON DELETE CASCADE já existente).
-- Idempotente. Seguro rodar múltiplas vezes.

-- 1) Opt-in por usuário (1 linha por usuário, troca = UPDATE)
CREATE TABLE IF NOT EXISTS whatsapp_optin (
  id                  SERIAL PRIMARY KEY,
  usuario_id          INT NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  telefone_e164       TEXT NOT NULL,
  aceitar_lembretes   BOOLEAN NOT NULL DEFAULT TRUE,
  aceitar_alertas     BOOLEAN NOT NULL DEFAULT TRUE,
  template_lang       TEXT NOT NULL DEFAULT 'pt_BR',
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_e164_ok CHECK (telefone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_optin_user ON whatsapp_optin(usuario_id);

-- 2) Log idempotente (UNIQUE lembrete_id+canal). Reenvio = skip silencioso.
CREATE TABLE IF NOT EXISTS notifications_log (
  id            SERIAL PRIMARY KEY,
  lembrete_id   INT NOT NULL REFERENCES plantoes_lembretes(id) ON DELETE CASCADE,
  canal         TEXT NOT NULL CHECK (canal IN ('email','push','whatsapp')),
  destinatario  TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'enviado' CHECK (status IN ('enviado','falhou','optout')),
  erro          TEXT,
  provider_id   TEXT,
  enviado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lembrete_id, canal)
);
CREATE INDEX IF NOT EXISTS idx_notif_log_canal   ON notifications_log(canal, enviado_em DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_destino ON notifications_log(destinatario);
