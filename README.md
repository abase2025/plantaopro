# 🏥 PlantãoPro — Sistema de Gestão de Escalas e Plantões Médicos (v1.3)

Inspirado no [GoMeds](https://gomeds.com.br) (escalas e plantões médicos).
**Novidade da v1.3**: lembretes automáticos por **e-mail** (SMTP/Resend) + **Web Push** (VAPID).

## ✨ Funcionalidades
- 👥 **Perfis**: Gestor, Médico-Gestor, Médico (autenticação JWT)
- 📋 **Escalas e plantões** com controle de conflitos e idempotência
- 💼 **Ofertas de plantão** (abertas → aceitar → confirmar)
- 📍 **Check-in/Check-out** com cálculo de horas por turno (noturno × 1,5)
- 💰 **Financeiro**: honorários por plantão, adicionais noturno/feriado, ISS/IR, PDF
- 📝 **Médico edita local/valor** do próprio plantão
- ✅ **Dar baixa** de pagamento
- 💬 **Chat por setor** (polling 3,5s)
- 🔔 **Lembretes automáticos** (v1.3):
  - E-mail (SMTP genérico / Resend)
  - Web Push (VAPID)
  - **6 offsets**: -24h, -3h, -1h, 0h, +1h, +24h
  - **Idempotente** (não duplica), **resiliente** (falha parcial não derruba o tick)
  - **Duas estratégias de execução**:
    - **Cron interno** via `node-cron` (a cada hora + diário 08:00) — ideal no Render Starter
    - **Endpoint externo** `POST /api/cron/reminders` (com `x-cron-secret`) — ideal no Render Free (Render Cron Job / UptimeRobot / GitHub Actions cron)
  - **Stub automático**: se email/push não estão configurados, grava em `data/outbox.log` para você testar sem precisar de provedor

## 🏗️ Arquitetura
```
plantaopro/
├── server.js             → Express + JWT + node-cron + endpoints REST
├── reminders.js          → Engine de lembretes (e-mail/smtp/resend + web-push)
├── db-pg.js              → Adaptador dual (Postgres | JSON local)
├── reminders.js          → 
├── migrations/
│   ├── 001_init.sql      → Schema base (idempotente)
│   └── 002_reminders.sql → push_subscriptions + reminders_log (idempotente)
├── render.yaml           → Blueprint Render (1-click deploy)
├── .env.example          → Variáveis comentadas
├── public/
│   ├── sw.js             → Service Worker (escuta push events)
│   ├── js/push.js        → Helper de subscribe/unsubscribe
│   └── ... (frontend)
```

## 🔐 Variáveis de ambiente (Render → Service → Environment)

| Chave | Tipo | Vazio = ? |
|---|---|---|
| `PORT` | int | 3000 |
| `NODE_ENV` | string | (qualquer) |
| `JWT_SECRET` | secure | Generate Value |
| `CRON_SECRET` | secure | Generate Value |
| `CORS_ORIGINS` | csv | liberado: abaase2025.github.io,localhost:3000 |
| `APP_BASE_URL` | url | link do frontend (chamadas no e-mail) |
| `DATABASE_URL` | url | fromDatabase → modo Postgres; vazio → JSON |
| `SMTP_HOST` | string | stub (grava em outbox.log) |
| `SMTP_PORT` | int=587 | — |
| `SMTP_USER` | string | — |
| `SMTP_PASS` | secure | — |
| `SMTP_FROM` | string | "PlantãoPro <alertas@..." |
| `RESEND_API_KEY` | secure | se setado, usa Resend HTTPS ao invés de SMTP |
| `VAPID_PUBLIC` | secure (base64) | stub push se vazio |
| `VAPID_PRIVATE` | secure (base64) | stub push se vazio |
| `VAPID_SUBJECT` | url/email | "mailto:admin@plantaopro.com" |
| `DISABLE_INTERNAL_CRON` | "1" | desativa cron interno — só endpoint externo |

> **VAPID — gere o seu**: Render Shell → `node -e "console.log(require('web-push').generateVAPIDKeys())"`
> As chaves no `.env.example` foram geradas pelo sandbox para este demo — você pode usar para teste Render mas **recomendo gerar o seu par** em produção.

## 🚀 Deploy no Render (atualizado)

1. Sobe o projeto num repo GitHub (`plantaopro-backend`).
2. Render → New → **Blueprint** → conecta o repo → lê `render.yaml` automaticamente.
   - Cria `plantaopro-db` (Postgres Free v16)
   - Cria `plantaopro-api` (Web Service Free)
3. Após o deploy provisionado, **gerar VAPID** no Shell do Web Service:
   ```
   node -e "console.log(require('web-push').generateVAPIDKeys())"
   ```
   Copie `publicKey` → `VAPID_PUBLIC`, `privateKey` → `VAPID_PRIVATE`.
4. (Opcional) Colar credenciais de e-mail ou `RESEND_API_KEY`.
5. Teste o lembrete:
   ```
   curl -X POST -H "x-cron-secret: $CRON_SECRET" \
     "https://plantaopro-api-xxxx.onrender.com/api/cron/reminders?force=1"
   ```
   Resposta JSON mostra `enviados`, `erros`, `detalhes`.
6. Frontend (no GitHub Pages): o botão "🔔 Ativar notificações" no Dashboard pega a `VAPID_PUBLIC` automaticamente da rota `/api/push/vapid-public`.

## 📬 Como o lembrete funciona

A cada hora (e 08:00 todo dia) o engine:
1. Pega plantões confirmados com médico alocado nos próximos 7 dias
2. Para cada plantão, gera 6 reminders (offsets -24h, -3h, -1h, 0h, +1h, +24h)
3. Verifica quais estão "vencidos" (início+offset < agora) e ainda não enviados
4. Para cada um:
   - Envia e-mail (template com data, turno, local, setor)
   - Se houver push subscription, envia Web Push
   - Marca `reminders_log` (UNIQUE plantão+offset → nunca duplica)

Deduplicação robusta via `UNIQUE (plantao_id, medico_id, offset_horas)` — mesmo se a função rodar duas vezes em sequência (deploy em meio ao tick), nada duplica.

## 🔧 Endpoints novos (v1.3)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | /api/push/vapid-public | público | Devolve chave pública para o browser |
| POST | /api/push/subscribe | médico | Salva Web Push subscription |
| DELETE | /api/push/unsubscribe | médico | Remove subscription |
| POST | /api/cron/reminders?force=1 | header `x-cron-secret` | Dispara tick (force=1 ignora janela de 24h) |
| GET | /api/cron/status | gestor | Status dos canais e offsets configurados |

## 🧪 Credenciais de demonstração (do seed)

| Perfil | E-mail | Senha |
|---|---|---|
| Gestor | gestor@plantaopro.com | demo123 |
| Médico-Gestor | medgestor@plantaopro.com | demo123 |
| Médico | medico@plantaopro.com | demo123 |
| Médico 2 | medico2@plantaopro.com | demo123 |
| Médico 3 | medico3@plantaopro.com | demo123 |
