# RolêJunto API (back-end)

API do RolêJunto em **Node.js + TypeScript + Fastify**, com banco **PostgreSQL** (Drizzle ORM).

- Em desenvolvimento roda **sem instalar banco**: usa um PostgreSQL embutido (PGlite) na pasta `data/`.
- Em produção usa PostgreSQL de verdade, via Docker.
- Os textos para o usuário ficam no app. A API devolve **códigos** (`underage`, `slot_taken`…), traduzidos nos 4 idiomas pelo front-end.

---

## 1. Rodar no computador

Requer Node.js 20+.
```bash
npm install
npm run db:seed     # cria contas e parceiros de demonstração (senha: rolejunto123)
npm run dev         # API em http://localhost:3333
npm test            # testes de ponta a ponta
```

Contas de demonstração: `cliente@rolejunto.local`, `marina@rolejunto.local` (e os demais parceiros) e `admin@rolejunto.local`. Senha de todas: `rolejunto123`.

---

## 2. Colocar no ar

A API sobe junto com o site e o banco pelo `docker-compose.yml` da pasta principal. Siga o passo a passo do `README.md` de lá.

Se quiser só a API, a imagem está no `Dockerfile` desta pasta. Ela precisa destas variáveis:
- `DATABASE_URL`
- `COOKIE_SECRET`
- `APP_URL` (endereço do site)
- `PUBLIC_URL`

Criar um administrador:
```bash
node dist/db/createAdmin.js voce@seudominio.com.br "Seu Nome" "senha-forte"
```

---

## 3. Regras de segurança que a API garante

- **Maiores de 18:** o cadastro exige data de nascimento, aceite dos termos e consentimento LGPD para biometria.
- **Verificação obrigatória:** só reserva quem passou pela verificação de identidade. Parceiro só aparece na busca depois de verificado.
- **Casa e Sítio:** só liberam depois de um encontro **concluído em local público** com a mesma pessoa. Além disso, exigem contato de confiança cadastrado e compartilhamento do endereço.
- **Localização aproximada:** a posição do parceiro é guardada já arredondada (~1 km), e a distância é exibida em km inteiros.
- **Chat moderado:**
  - telefone, e-mail, links e "me chama no zap" são bloqueados;
  - pedido ou oferta de serviço sexual não é entregue e vira denúncia de **prioridade máxima**.
- **Pagamento retido:** o cliente paga depois do aceite. O valor só é liberado ao parceiro quando o encontro é concluído.
  - Cancelamento com mais de 24 h de antecedência devolve tudo.
  - Com menos de 24 h, devolve 50% (configurável).
  - Se o parceiro cancela, o cliente sempre recebe tudo de volta.
- **Check-in e SOS:**
  - o check-in só libera com a reserva paga e avisa o contato de confiança;
  - o SOS alerta a equipe e o contato de confiança.
- **Denúncias e bloqueios:** denúncias de cunho sexual, envolvendo menores ou com ameaças entram como urgentes e notificam os admins. Bloquear esconde as duas pessoas uma da outra.
- **Contas:**
  - bloqueio após 5 senhas erradas;
  - limite de tentativas por IP;
  - senhas com scrypt;
  - sessões revogáveis em cookie httpOnly (no app nativo, via token).
- **LGPD:** baixar meus dados (`GET /api/me/export`) e excluir conta (`DELETE /api/me`). Os dados pessoais são apagados, e os registros financeiros ficam anonimizados.
- **Auditoria:** ações sensíveis (admin, cancelamentos, SOS, exclusões) ficam registradas em `audit_logs`.

---

## 4. Endpoints (todos começam com `/api`)

| Método | Rota | O que faz |
|---|---|---|
| POST | `/auth/signup` | Cadastro (18+, termos e consentimento) |
| POST | `/auth/login` · `/auth/logout` | Entrar · sair |
| GET | `/auth/me` | Usuário logado (ou `null`) |
| POST | `/auth/forgot` · `/auth/reset` | Código por e-mail · nova senha |
| POST | `/auth/verify-email` · `/auth/verify-email/resend` | Confirmar e-mail com o código · reenviar código |
| GET/PATCH | `/me` | Ver/editar perfil, idioma, interesses, notificações, contato de confiança |
| POST | `/me/password` | Trocar senha |
| POST/DELETE | `/me/avatar` | Foto de perfil |
| GET · PUT/DELETE | `/me/favorites` · `/me/favorites/:id` | Favoritos |
| GET · DELETE | `/me/export` · `/me` | LGPD: exportar · excluir conta |
| GET | `/partners` | Busca: `activity`, `when`, `lat`, `lng`, `radiusKm`, `maxPriceCents`, `online`, `q`, `sort` |
| GET | `/partners/:id` | Perfil, fotos, avaliações e agenda de 7 dias |
| GET/PUT | `/partner/profile` | Parceiro: editar perfil (com moderação) |
| PUT | `/partner/availability` | Parceiro: horários semanais |
| POST/DELETE | `/partner/photos` | Parceiro: fotos (entram em moderação) |
| GET | `/partner/earnings` | Parceiro: ganhos |
| POST | `/bookings` | Pedir reserva |
| GET | `/bookings` · `/bookings/:id` | Minhas reservas · detalhe |
| POST | `/bookings/:id/accept` · `decline` | Parceiro aceita · recusa |
| POST | `/bookings/:id/cancel` | Cancelar (com reembolso automático) |
| POST | `/bookings/:id/check-in` · `sos` · `complete` | Check-in · SOS · concluir |
| POST | `/bookings/:id/review` | Avaliar |
| POST | `/bookings/:id/payment` | Gerar Pix ou checkout de cartão |
| GET | `/payments/:id` | Situação do pagamento |
| POST | `/webhooks/payments` | Aviso do Mercado Pago |
| GET/POST | `/conversations` | Conversas · iniciar conversa |
| GET/POST | `/conversations/:id/messages` | Mensagens (com moderação) |
| POST | `/reports` | Denunciar (e bloquear) |
| GET/POST/DELETE | `/blocks` | Bloqueios |
| GET · POST | `/notifications` · `/notifications/seen` | Notificações |
| GET/POST | `/verification` | Status · enviar documento e selfie |
| POST | `/support` | Fale conosco (funciona sem login) |
| GET/POST | `/admin/...` | Métricas, verificações, denúncias, fotos, usuários, auditoria |

Erros sempre no formato `{ "error": { "code": "slot_taken", "message": "..." } }`.

---

## 5. O que ligar antes de abrir para o público

1. **Pagamentos.** Crie a conta no Mercado Pago, use primeiro as credenciais de teste e configure `PAYMENT_PROVIDER=mercadopago`, o token e o segredo do webhook. Cadastre o webhook apontando para `https://seudominio.com.br/api/webhooks/payments`. O repasse aos parceiros pode ser feito via Pix pelo financeiro, a partir de `/partner/earnings`. Para repasse automático, avalie o modelo marketplace do provedor.
2. **Verificação de identidade.** Hoje é simulada: em desenvolvimento aprova na hora; em produção fica "em análise" para aprovação manual no painel admin. Para automatizar, contrate Unico, idwall ou CAF e implemente `/webhooks/verification`. As imagens de documento não são guardadas pela API.
3. **E-mail.** Configure o Gmail com `GMAIL_USER` e `GMAIL_APP_PASSWORD`. O passo a passo está no README principal. Teste com `npm run email:test -- voce@exemplo.com`. Os modelos de e-mail, nos 4 idiomas, ficam em `src/lib/emails.ts`.
4. **SMS/WhatsApp** para o contato de confiança e o SOS: ligue um provedor em `src/providers/messaging.ts`.
5. **Fotos.** Hoje ficam no disco da VPS (volume `uploads`). Para escalar, troque por S3 ou Cloudflare R2 em `src/providers/storage.ts`.
6. **Revisão jurídica** dos termos e da política de privacidade. Defina também o encarregado de dados (DPO).

---

## 6. Estrutura

```
src/
  server.ts            inicia o servidor
  app.ts               plugins, sessão, erros, rotas
  config.ts            variáveis de ambiente
  db/                  schema, conexão, seed, createAdmin
  lib/                 segurança, moderação, localização, erros
  providers/           pagamentos, e-mail/SMS, armazenamento
  modules/             auth, me, partners, bookings, payments, chat, safety, notifications, verification, admin, support
drizzle/               migrações do banco (aplicadas automaticamente ao iniciar)
test/                  testes de ponta a ponta
```

Para mudar o banco: edite `src/db/schema.ts` e rode `npm run db:generate` para criar a migração.
