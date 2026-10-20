# RolêJunto — site, app e API

Plataforma de **companhia social** para atividades (balada, bar, praia, shows, jantares, museus, turismo…). É exclusivamente social: proibida para menores de 18 anos e sem qualquer serviço de natureza sexual.

Este pacote junta tudo:

```
rolejunto/
  web/                 site + app (React). O mesmo código gera o app Android/iOS.
  api/                 back-end (Node.js + Fastify + PostgreSQL)
  docker-compose.yml   coloca tudo no ar numa VPS, com HTTPS automático
  .env.example         configurações de produção
```

O front-end e a API já estão ligados:
- login, cadastro e recuperação de senha;
- busca e perfis;
- reservas, pagamento, chat e notificações;
- verificação de identidade, denúncias e bloqueios;
- painel do parceiro e painel administrativo;
- mapa de verdade (OpenStreetMap), com a região aproximada de cada parceiro;
- chat instantâneo (mensagens, "digitando…" e notificações chegam na hora);
- agenda com horários exatos e bloqueio de datas (folgas e férias);
- login com Google e Apple;
- indique um amigo e cupons de desconto;
- aviso quando um favorito abre horários;
- foto real aprovada obrigatória para o parceiro aparecer na busca;
- telas de boas-vindas no primeiro uso, modo escuro e tela de abertura do app Android com a logo.

Todos os textos estão em 4 idiomas (🇧🇷 🇪🇸 🇺🇸 🇨🇳), inclusive as mensagens de erro da API.

---

## 1. Rodar no computador

Requer **Node.js 20+**. Não precisa instalar banco de dados: em desenvolvimento a API usa um PostgreSQL embutido.

```bash
npm run setup     # instala tudo e cria os dados de demonstração (só na primeira vez)
npm run dev       # sobe API + site juntos
```

Abra **http://localhost:5173**.

### Contas de demonstração

A senha de todas é `rolejunto123`.

| Conta | Para testar |
|---|---|
| `cliente@rolejunto.local` | Cliente verificada (Ana). Já teve um encontro com o Rafael, então **Casa e Sítio** estão liberados com ele. |
| `marina@rolejunto.local` | Parceira. Também valem `rafael@`, `bia@`, `leo@`, `clara@`, `helena@` e `julia@` (todos com `@rolejunto.local`). |
| `admin@rolejunto.local` | Painel administrativo |

**Dica para testar o fluxo completo:** use dois navegadores (ou uma janela anônima).
1. Como cliente, peça uma reserva com a Marina.
2. Como Marina, aceite em **Painel do parceiro**.
3. Como cliente, pague com Pix e toque em "Já fiz o pagamento". No modo de testes, o pagamento é confirmado sem cobrança real.
4. Converse pelo chat, faça check-in, finalize o encontro e avalie.

Em desenvolvimento:
- sem o Gmail configurado, os e-mails (código de confirmação e de recuperação de senha) aparecem no terminal da API;
- a verificação de identidade é aprovada na hora.

Para enviar de verdade também no computador, crie o arquivo `api/.env` com `GMAIL_USER` e `GMAIL_APP_PASSWORD` (veja a seção 3).

Testes automáticos da API: `npm test`.

---

## 2. Colocar no ar (recomendado: VPS + Docker)

Tudo fica num domínio só:
- o site em `https://seudominio.com.br`;
- a API em `https://seudominio.com.br/api`;
- as fotos em `https://seudominio.com.br/uploads`.

O certificado HTTPS é emitido sozinho.

> Hospedagem compartilhada (planos de site da Hostinger, cPanel) **não roda Node.js**. Para a API, use uma VPS: Hostinger VPS, DigitalOcean, Contabo, AWS Lightsail etc. Uma VPS de 2 GB de RAM é suficiente para começar.

1. No painel do seu domínio, aponte `seudominio.com.br` e `www` para o IP da VPS (registro **A**).
2. Na VPS, instale o Docker: `curl -fsSL https://get.docker.com | sh`.
3. Envie a pasta `rolejunto` para a VPS e entre nela.
4. Crie o arquivo de configuração:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Preencha `DOMAIN`, `COOKIE_SECRET` e `DB_PASSWORD`. Gere cada segredo com `openssl rand -base64 48`.
5. Suba tudo:
   ```bash
   docker compose up -d --build
   ```
6. Crie o seu usuário administrador:
   ```bash
   docker compose exec api node dist/db/createAdmin.js voce@seudominio.com.br "Seu Nome" "uma-senha-bem-forte"
   ```
7. Acesse `https://seudominio.com.br`. Para conferir a API, abra `/api/health`.

Para colocar dados de demonstração no servidor (só para testes, nunca com usuários reais), rode `docker compose exec api node dist/db/seed.js`.

**Atualizar depois de mudanças:** `docker compose up -d --build`.

**Backup diário do banco** (agende no `crontab -e`):
```bash
0 3 * * * cd /caminho/rolejunto && docker compose exec -T db pg_dump -U rolejunto rolejunto | gzip > backup-$(date +\%F).sql.gz
```

### Alternativa: site na hospedagem atual + API na VPS

Para manter o site onde ele já está, use um subdomínio para a API, por exemplo `api.seudominio.com.br`:
1. Gere o site com o endereço da API:
   ```bash
   cd web && VITE_API_URL=https://api.seudominio.com.br npm run build
   ```
   Envie o conteúdo de `web/dist/`, incluindo o `.htaccess`.
2. Na VPS, suba só o banco e a API. No `.env`, defina:
   - `APP_URL=https://seudominio.com.br`
   - `PUBLIC_URL=https://api.seudominio.com.br`
   - `COOKIE_DOMAIN=.seudominio.com.br`

   Use um proxy com HTTPS na frente da API, como o próprio Caddy.

---

## 3. E-mails pelo Gmail

O RolêJunto envia e-mails com a marca e no idioma de cada pessoa.

**Códigos e suporte:**
- o **código de confirmação** no cadastro (sem confirmar o e-mail, não dá para reservar);
- o **código para criar uma nova senha**;
- o aviso de que o **suporte recebeu a mensagem**.

**Os mesmos avisos das notificações do app**, cada um com um botão que abre a tela certa:
- novo pedido;
- reserva aceita, recusada ou cancelada;
- pagamento confirmado;
- pedido de avaliação;
- nova mensagem no chat (no máximo 1 e-mail por conversa a cada 30 minutos);
- verificação aprovada ou recusada;
- foto recusada;
- repasse enviado;
- favorito com horários livres (no máximo 1 aviso por dia por parceiro);
- cupom ganho por indicação;
- para os admins: SOS e denúncias urgentes.

Cada pessoa pode desligar os avisos em **Perfil → Notificações → "E-mails sobre reservas, mensagens e pagamentos"**. Os avisos de segurança e de conta chegam sempre: verificação, advertência, repasse, SOS e denúncias urgentes.

### Criar a senha de app do Gmail

O Gmail não aceita a senha normal da conta em aplicativos. É preciso criar uma **senha de app** de 16 letras:

1. Entre na conta Google que vai enviar os e-mails. O ideal é uma conta só do RolêJunto, como `contatorolejunto@gmail.com`.
2. Ative a **verificação em duas etapas**: [myaccount.google.com/security](https://myaccount.google.com/security) → "Verificação em duas etapas". É obrigatória para a senha de app.
3. Abra [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords), dê um nome (por exemplo "RolêJunto") e toque em **Criar**.
4. Copie as 16 letras que aparecem. Os espaços não importam.
5. No `.env` do servidor, preencha:
   ```
   GMAIL_USER=contatorolejunto@gmail.com
   GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
   EMAIL_FROM=RolêJunto <contatorolejunto@gmail.com>
   ```
6. Reinicie a API com `docker compose up -d` e envie um e-mail de teste:
   ```bash
   docker compose exec api node dist/testEmail.js seuemail@exemplo.com
   ```
   No computador, use `cd api && npm run email:test -- seuemail@exemplo.com`.

**Conferir se está tudo certo:** há duas formas.
- No site, entre como admin e abra **Painel admin → Sistema**. A tela mostra se o e-mail está funcionando, explica o erro em português e tem o botão "Enviar teste".
- No servidor, rode o diagnóstico completo. Ele confere o banco, o e-mail (inclusive se a VPS bloqueia o Gmail), os pagamentos e as configurações, e diz como corrigir cada problema:
  ```bash
  docker compose exec api node dist/doctor.js contatorolejunto@gmail.com
  ```
  No computador, use `npm run doctor -- contatorolejunto@gmail.com`.

**Mudou o `.env`?** Aplique com `docker compose up -d`. Só `docker compose restart` **não** lê o `.env` de novo.

**Se der erro:**
- `535` (usuário ou senha não aceitos): a senha de app está errada ou foi apagada. Crie outra.
- `534`: a verificação em duas etapas não está ativa.
- **A VPS bloqueia o Gmail** (o diagnóstico mostra "Sem conexão com smtp.gmail.com"). Muitas VPS bloqueiam as portas de e-mail (465/587) em contas novas. Há duas saídas:
  - peça a liberação ao suporte da VPS;
  - ou use o **Brevo**, que é grátis e envia por HTTPS: crie a conta em brevo.com, valide o seu e-mail como remetente, gere uma chave de API e coloque no `.env`:
    ```
    BREVO_API_KEY=xkeysib-...
    EMAIL_FROM=RolêJunto <contatorolejunto@gmail.com>
    ```
- O e-mail caiu no spam: peça para as primeiras pessoas marcarem como "Não é spam".

**Limite do Gmail:**
- **conta gratuita:** cerca de **500 e-mails por dia**. Isso dá para o lançamento. Conte 1 e-mail por cadastro e uns 5 a 8 por reserva completa, somando os avisos.
- **Google Workspace** (e-mail com seu domínio, como `contato@rolejunto.com.br`): até **2.000 por dia**, e o remetente fica mais profissional.

Quando o volume crescer (algumas dezenas de reservas por dia), troque o Gmail pelo Brevo (`BREVO_API_KEY`) ou outro serviço de envio (`SMTP_URL`), sem mudar código.

---

## 4. Login com Google e Apple

Os botões só aparecem depois de configurados. Na primeira vez, a pessoa completa nome, data de nascimento (18+) e aceita os termos; o e-mail já vem confirmado. Se o e-mail já tiver conta, o login é ligado a ela.

**Google**
1. Abra [console.cloud.google.com](https://console.cloud.google.com) → APIs e serviços → **Tela de permissão OAuth**: preencha nome (RolêJunto), e-mail de suporte, links da Privacidade e dos Termos.
2. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**.
3. Em "Origens JavaScript autorizadas", coloque `https://seudominio.com.br` (e `http://localhost:5173` para testar no computador).
4. Copie o ID (termina em `.apps.googleusercontent.com`) para `GOOGLE_CLIENT_ID` no `.env`.

**Apple** (precisa da conta Apple Developer, US$ 99/ano)
1. Em [developer.apple.com](https://developer.apple.com/account/resources/identifiers) crie um **App ID** com "Sign in with Apple" e depois um **Services ID** (ex.: `br.com.rolejunto.web`).
2. No Services ID, ative "Sign in with Apple" e cadastre o domínio `seudominio.com.br` e o Return URL `https://seudominio.com.br/entrar`.
3. Coloque o Services ID em `APPLE_CLIENT_ID` no `.env`.

Aplique com `docker compose up -d`. Para aceitar logins vindos de mais de um app (ex.: site e Android), separe os IDs por vírgula.

> No app Android/iOS empacotado, o login social pelo navegador não funciona dentro do app (regra do Google). O app mostra e-mail e senha; para ter Google/Apple nativos, adicione um plugin como `@capacitor-firebase/authentication` e envie o ID token para `POST /api/auth/oauth`.

**Indique um amigo e cupons.** Cada cliente tem um link em **Perfil → Indique e ganhe**. Quando o amigo se cadastra por ele e conclui o primeiro encontro, os dois ganham um cupom de `REFERRAL_REWARD_CENTS` (padrão R$ 20, válido por 90 dias). Campanhas (ex.: `BEMVINDO10`, 10% até R$ 20) são criadas em **Painel admin → Cupons**. O desconto sai da taxa da plataforma: o parceiro sempre recebe o valor cheio, e o Financeiro mostra o total em descontos.

**Mapa.** Usa o OpenStreetMap por padrão. Com muito acesso, configure um provedor de mapas (`MAP_TILES_URL` e `MAP_ATTRIBUTION` no `.env`; exemplo no `.env.example`) e rode `docker compose up -d --build`.

---

## 5. App Android e iOS

O app é o mesmo site empacotado com Capacitor. Gere-o apontando para o endereço da API:

```bash
cd web
VITE_API_URL=https://seudominio.com.br npm run android   # abre o Android Studio
VITE_API_URL=https://seudominio.com.br npm run ios       # abre o Xcode (precisa de Mac)
```

No app, o login usa um token guardado no aparelho em vez do cookie do site. Detalhes em `web/README.md`.

A tela de abertura do Android já vem com a logo, em fundo escuro (`android/app/src/main/res/drawable*/splash.png` e, no Android 12+, `drawable/splash_icon.xml`).

---

## 6. Antes de abrir para o público

1. **Pagamentos (SharkPay, só Pix).**
   - No painel da SharkPay, gere as chaves da API e coloque no `.env`: `PAYMENT_PROVIDER=sharkpay`, `SHARKPAY_PUBLIC_KEY`, `SHARKPAY_SECRET_KEY` e `SHARKPAY_PAYER_DOCUMENT` (CPF ou CNPJ usado nas cobranças).
   - Cadastre o webhook em Painel > API > Webhook com a URL `https://seudominio.com.br/api/webhooks/payments`. O segredo aparece **uma vez**: copie para `SHARKPAY_WEBHOOK_SECRET`. Use "Enviar teste" para conferir.
   - A SharkPay não tem API de estorno: quando uma reserva paga é cancelada, o pedido de reembolso fica no histórico de ações do painel admin (`payment.refund_manual_required`) e você devolve o valor no painel da SharkPay.
   - Cartão fica desligado com a SharkPay (a opção some do checkout). O Mercado Pago continua disponível com `PAYMENT_PROVIDER=mercadopago`.
   - Rode `docker compose exec api node dist/doctor.js` para conferir a configuração.
2. **E-mail.** Configure o Gmail (seção 3) e rode o e-mail de teste. Sem isso, ninguém consegue confirmar o cadastro.
3. **Verificação de identidade.** Em produção, os documentos ficam "em análise" e são aprovados à mão no painel admin. Para automatizar, contrate Unico, idwall ou CAF (veja `api/README.md`).
4. **SMS/WhatsApp** para avisar o contato de confiança no check-in e no SOS: `api/src/providers/messaging.ts`.
5. **Revisão jurídica** dos Termos, da Privacidade e das Diretrizes, nos 4 idiomas, e definição do encarregado de dados (DPO), exigido pela LGPD.

---

## 7. Regras de segurança garantidas pela API

- Só maiores de 18 anos. E-mail confirmado e verificação de identidade obrigatórios para reservar. Parceiros só aparecem na busca depois de verificados e com uma foto real aprovada pela equipe.
- **Casa e Sítio** só liberam depois de um encontro **concluído em local público** com a mesma pessoa, com contato de confiança cadastrado e endereço compartilhado.
- O chat bloqueia telefone, e-mail e links antes do encontro. Pedido ou oferta de serviço sexual não é entregue e vira denúncia urgente.
- O pagamento fica retido e só é liberado ao parceiro depois do encontro. As regras de cancelamento são:
  - com mais de 24 h de antecedência, o cliente recebe tudo de volta;
  - com menos de 24 h, recebe 50%;
  - se o parceiro cancela, o cliente sempre recebe tudo.
- Check-in e SOS avisam o contato de confiança. O SOS também alerta a equipe.
- A localização do parceiro é sempre aproximada (~1 km).
- LGPD: baixar meus dados e excluir conta, na tela Perfil.
