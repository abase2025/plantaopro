-- PlantãoPro — schema inicial
-- Idempotente (CREATE IF NOT EXISTS) — seguro rodar múltiplas vezes

CREATE TABLE IF NOT EXISTS setores (
  id   SERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS usuarios (
  id        SERIAL PRIMARY KEY,
  nome      TEXT NOT NULL,
  email     TEXT NOT NULL UNIQUE,
  senha     TEXT NOT NULL,
  perfil    TEXT NOT NULL CHECK (perfil IN ('gestor','medico_gestor','medico')),
  setor_id  INT REFERENCES setores(id) ON DELETE SET NULL,
  ativo     BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS escalas (
  id         SERIAL PRIMARY KEY,
  titulo     TEXT NOT NULL,
  setor_id   INT NOT NULL REFERENCES setores(id) ON DELETE RESTRICT,
  mes_ref    TEXT NOT NULL,                       -- YYYY-MM
  criado_por INT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS plantoes (
  id         SERIAL PRIMARY KEY,
  escala_id  INT NOT NULL REFERENCES escalas(id) ON DELETE CASCADE,
  setor_id   INT NOT NULL REFERENCES setores(id) ON DELETE RESTRICT,
  medico_id  INT REFERENCES usuarios(id) ON DELETE SET NULL,
  data       DATE NOT NULL,
  turno      TEXT NOT NULL CHECK (turno IN ('manha','tarde','noite','madrugada')),
  status     TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','confirmado','cancelado')),
  local      TEXT,
  valor      NUMERIC(10,2),
  pago       BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (medico_id, data, turno)                 -- evita conflito
);

CREATE TABLE IF NOT EXISTS ofertas (
  id          SERIAL PRIMARY KEY,
  plantao_id  INT NOT NULL REFERENCES plantoes(id) ON DELETE CASCADE,
  criado_por  INT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  status      TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','aceita','cancelada')),
  aceito_por  INT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS checkins (
  id         SERIAL PRIMARY KEY,
  plantao_id INT NOT NULL REFERENCES plantoes(id) ON DELETE CASCADE,
  medico_id  INT NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  data_hora  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plantao_id, medico_id)
);

CREATE TABLE IF NOT EXISTS mensagens (
  id           SERIAL PRIMARY KEY,
  setor_id     INT NOT NULL REFERENCES setores(id) ON DELETE CASCADE,
  remetente_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  texto        TEXT NOT NULL,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS financeiro_config (
  id                    SERIAL PRIMARY KEY,
  valor_tipo            TEXT NOT NULL DEFAULT 'valor_plantao' CHECK (valor_tipo IN ('valor_plantao','valor_hora')),
  valor_plantao         NUMERIC(10,2) NOT NULL DEFAULT 500,
  valor_hora            NUMERIC(10,2) NOT NULL DEFAULT 120,
  adicional_noturno_pct NUMERIC(5,2)  NOT NULL DEFAULT 30,
  adicional_feriado_pct NUMERIC(5,2)  NOT NULL DEFAULT 100,
  iss_pct               NUMERIC(5,2)  NOT NULL DEFAULT 5,
  ir_pct                NUMERIC(5,2)  NOT NULL DEFAULT 10,
  usar_adicional_noturno BOOLEAN NOT NULL DEFAULT TRUE,
  usar_adicional_feriado BOOLEAN NOT NULL DEFAULT TRUE,
  usar_iss               BOOLEAN NOT NULL DEFAULT FALSE,
  usar_ir                BOOLEAN NOT NULL DEFAULT FALSE,
  singleton BOOLEAN NOT NULL DEFAULT TRUE UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_plantoes_data    ON plantoes(data);
CREATE INDEX IF NOT EXISTS idx_plantoes_medico  ON plantoes(medico_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_setor  ON mensagens(setor_id, criado_em DESC);
