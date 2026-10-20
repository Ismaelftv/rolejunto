# RolêJunto — Front-end (site + app)

Plataforma de companhia social para atividades. Feito com **React + Vite + TypeScript** e CSS próprio (sem bibliotecas de UI). O mesmo código gera:

- o **site** (arquivos estáticos para qualquer servidor);
- o **app instalável pelo navegador** (PWA, Android e iPhone);
- o **app nativo** Android/iOS (Capacitor), igual ao site.

> **Ligado à API:** todas as telas usam a API em `../api` (login, busca, reservas, pagamento, chat, notificações, painéis). Para rodar tudo junto, veja o `README.md` na pasta principal.

---

## Novidades desta versão

- **Categorias em destaque:** 🌃 Balada, 🍸 Bar, 🏖️ Praia, 🏠 Casa, 🌳 Sítio, antes das demais (Shows, Jantares, Museus, Turismo, Eventos, Cuidado).
- **Regra de segurança para Casa e Sítio:** só liberam depois de um primeiro encontro concluído em local público com a mesma pessoa, com endereço compartilhado com o contato de confiança e check-in obrigatório.
- **4 idiomas:** 🇧🇷 Português, 🇪🇸 Español, 🇺🇸 English, 🇨🇳 中文, com seletor no cabeçalho do site, do app e do login. A escolha fica salva.
- **Nova logo:** check em duas peças (o "par" que forma o "certo"), versões clara e escura, favicon e ícones de app. Veja em `/marca`.
- **App mobile:** PWA instalável + projeto Android pronto (`android/`).

---

## 1. Publicar o site

O jeito recomendado é o `docker compose` da pasta principal: ele publica o site e a API juntos no mesmo domínio.

Para publicar só o site em outro servidor, gere com o endereço da API (`VITE_API_URL=https://api.seudominio.com.br npm run build`). A pasta **`dist/`** é o site pronto.

**cPanel / Hostinger / Locaweb (Apache):** envie **todo o conteúdo** de `dist/` para `public_html`, incluindo o arquivo oculto **`.htaccess`**.

**VPS com Nginx**
```nginx
server {
  listen 80;
  server_name seudominio.com.br;
  root /var/www/rolejunto;          # conteúdo da pasta dist/
  index index.html;
  location / { try_files $uri /index.html; }
  location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
  location = /sw.js { add_header Cache-Control "no-cache"; }
}
```
Ative HTTPS (`sudo certbot --nginx`). **HTTPS é obrigatório para o app instalável funcionar.**

**Vercel / Netlify:** build `npm run build`, pasta `dist`.

---

## 2. App instalável pelo navegador (PWA)

Não precisa de loja. Com o site no ar em HTTPS:
- **Android (Chrome):** aparece "Instalar app" (ou use o botão "Instalar o app" na página inicial e em Conta).
- **iPhone (Safari):** Compartilhar → "Adicionar à Tela de Início".

O app abre em tela cheia, com ícone próprio e funciona com conexão instável.

---

## 3. App nativo Android e iOS (Capacitor)

O app nativo é o mesmo site empacotado. Toda mudança no código vale para os dois.

**Importante:** o app precisa saber o endereço da API. Gere sempre com `VITE_API_URL`, por exemplo `VITE_API_URL=https://seudominio.com.br npm run android`. No app, o login usa um token guardado no aparelho (header `Authorization`), não cookie.

**Android** (precisa do Android Studio instalado):
```bash
npm install
npm run android        # gera o build, sincroniza e abre o Android Studio
```
No Android Studio: **Build → Generate Signed App Bundle** para publicar na Play Store.

**iOS** (precisa de um Mac com Xcode e CocoaPods):
```bash
npm install
npx cap add ios        # só na primeira vez
npm run ios            # gera o build, sincroniza e abre o Xcode
```

Antes de publicar nas lojas, troque o `appId` em `capacitor.config.ts` (hoje `br.com.rolejunto.app`).

---

## 4. Rodar e editar no computador

Requer Node.js 20+. Deixe a API rodando (`npm run dev` na pasta `api`): o site encaminha `/api` e `/uploads` para `http://localhost:3333`.
```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # site → dist/
```

---

## 5. Idiomas

Os textos ficam em `src/i18n/`:
```
pt.ts   Português (base)
es.ts   Español
en.ts   English
zh.ts   中文
```
Todos seguem a mesma estrutura de `pt.ts`; o TypeScript avisa se faltar algum texto. Para adicionar um idioma: copie `en.ts`, traduza e registre em `src/i18n/index.tsx` (lista `LANGS`).

---

## 6. Onde mexer

```
src/
  data/activities.ts   categorias: ordem, cores, ícones, destaque, local privado
  i18n/                idiomas e seletor
  components/Brand.tsx logo, símbolo e variações
  lib/config.ts        taxa de serviço, idade mínima, e-mail de contato
  lib/api.ts           cliente HTTP da API (sessão por cookie no site, token no app)
  lib/store.tsx        estado do app: usuário, reservas, favoritos, notificações
  lib/partners.ts      busca e perfis de parceiros vindos da API
  i18n/live/           erros da API, notificações e mensagens do chat, nos 4 idiomas
  lib/pwa.ts           instalação do app
  pages/               uma tela por arquivo
  styles.css           cores, fontes e layout
public/
  manifest.webmanifest, sw.js, icons/   arquivos do app instalável
android/               projeto Android (Capacitor)
```

## 7. Telas

| Rota | Tela |
|---|---|
| `/` | Tela inicial (Explorar) |
| `/sobre` | Página de apresentação |
| `/explorar` | Busca com categorias, filtros, lista e mapa |
| `/parceiro/:id` | Perfil com agenda e reserva |
| `/reserva` | Confirmação e pagamento |
| `/reservas` | Reservas, check-in, SOS, avaliação |
| `/mensagens` | Chat com filtro de contatos |
| `/conta` | Conta, idioma, contato de confiança, instalar app, LGPD |
| `/cadastro`, `/entrar` | Cadastro (18+) e login |
| `/verificacao` | Documento + selfie |
| `/painel` | Painel do parceiro |
| `/admin` | Painel administrativo |
| `/marca` | Identidade visual |
| `/recuperar-senha` | Recuperar senha (código por e-mail) |
| `/notificacoes` | Notificações |
| `/reservas/:id` | Detalhe da reserva com linha do tempo |
| `/reservas/:id/pagar` | Pagamento (Pix ou cartão) e comprovante |
| `/conta/editar` | Editar perfil e alterar senha |
| `/conta/bloqueados` | Pessoas bloqueadas |
| `/ajuda` | Ajuda, perguntas frequentes e contato |
| `/seja-parceiro`, `/seguranca`, `/diretrizes`, `/termos`, `/privacidade` | Institucionais |

Contas de demonstração (senha `rolejunto123`): `cliente@rolejunto.local`, `marina@rolejunto.local` e `admin@rolejunto.local`. A cliente Ana já teve um encontro concluído com o **Rafael**, então dá para testar Casa e Sítio com ele.

---

## 8. Antes de receber usuários reais

Veja a lista no `README.md` da pasta principal: pagamentos reais, e-mail, verificação de identidade, SMS e revisão jurídica.
