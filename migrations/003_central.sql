-- PlantãoPro — migração 003: esquema central com FKs em cascade
-- Tudo gira em torno de `plantoes`. Cada "lembrete / alerta / lançamento financeiro"
-- é um filho com FK ON DELETE CASCADE. Sem tabelas paralelas sem FK.
-- Idempotente: seguro rodar várias vezes.

-- 1) Estende a tabela existente com os campos novos do cadastro completo
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plantoes' AND column_name='instituicao') THEN
    ALTER TABLE plantoes ADD COLUMN instituicao TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plantoes' AND column_name='inicio') THEN
    ALTER TABLE plantoes ADD COLUMN inicio TIME DEFAULT '08:00';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plantoes' AND column_name='fim') THEN
    ALTER TABLE plantoes ADD COLUMN fim TIME DEFAULT '18:00';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plantoes' AND column_name='observacoes') THEN
    ALTER TABLE plantoes ADD COLUMN observacoes TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plantoes' AND column_name='minutos_estimados') THEN
    ALTER TABLE plantoes ADD COLUMN minutos_estimados INT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plantoes' AND column_name='status_lifecycle') THEN
    ALTER TABLE plantoes ADD COLUMN status_lifecycle TEXT NOT NULL DEFAULT 'agendado'
      CHECK (status_lifecycle IN ('agendado','concluido','cancelado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plantoes' AND column_name='pagamento_status') THEN
    ALTER TABLE plantoes ADD COLUMN pagamento_status TEXT NOT NULL DEFAULT 'pendente'
      CHECK (pagamento_status IN ('pendente','pago'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plantoes' AND column_name='atualizado_em') THEN
    ALTER TABLE plantoes ADD COLUMN atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
END $$;

-- 2) Lembretes individuais: UNIQUE por (plantao_id, tipo, offset_horas) garante idempotência
CREATE TABLE IF NOT EXISTS plantoes_lembretes (
  id            SERIAL PRIMARY KEY,
  plantao_id    INT NOT NULL REFERENCES plantoes(id) ON DELETE CASCADE,
  tipo          TEXT NOT NULL CHECK (tipo IN ('um_dia_antes','algumas_horas_antes','horario_personalizado','antes_inicio','em_andamento','concluido')),
  offset_horas  INT NOT NULL,
  mensagem      TEXT,
  executar_em   TIMESTAMPTZ NOT NULL,
  ativo         BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plantao_id, tipo, offset_horas)
);
CREATE INDEX IF NOT EXISTS idx_lembretes_plantao ON plantoes_lembretes(plantao_id);
CREATE INDEX IF NOT EXISTS idx_lembretes_vencer ON plantoes_lembretes(ativo, executar_em);

-- 3) Alertas/eventos de mudança de estado do plantão (auditoria + UI)
CREATE TABLE IF NOT EXISTS plantoes_alertas (
  id          SERIAL PRIMARY KEY,
  plantao_id  INT NOT NULL REFERENCES plantoes(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('criado','editado','concluido','cancelado','pagamento_pendente','pagamento_recebido','lembrete_enviado')),
  mensagem    TEXT NOT NULL,
  usuario_id  INT REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alertas_plantao ON plantoes_alertas(plantao_id, criado_em DESC);

-- 4) Lançamentos financeiros: 3 categorias, UNIQUE por categoria para evitar duplicação
CREATE TABLE IF NOT EXISTS plantoes_financeiro (
  id          SERIAL PRIMARY KEY,
  plantao_id  INT NOT NULL REFERENCES plantoes(id) ON DELETE CASCADE,
  categoria   TEXT NOT NULL CHECK (categoria IN ('receita_prevista','receita_recebida','receita_cancelada')),
  valor       NUMERIC(10,2) NOT NULL,
  descricao   TEXT,
  mes_ref     TEXT NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (plantao_id, categoria)
);
CREATE INDEX IF NOT EXISTS idx_financeiro_plantao ON plantoes_financeiro(plantao_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_mes    ON plantoes_financeiro(mes_ref);
