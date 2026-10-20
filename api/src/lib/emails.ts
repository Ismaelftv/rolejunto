// Modelos de e-mail do RolêJunto, nos 4 idiomas, com versão HTML (compatível com Gmail/Outlook) e texto puro.
import { config } from '../config.js';

export type Lang = 'pt' | 'es' | 'en' | 'zh';
export type EmailKind = 'verify_email' | 'password_reset' | 'support_received';
export interface Email { subject: string; text: string; html: string }

interface Copy {
  subject: string;
  preheader: string; // aparece na lista de e-mails, ao lado do assunto
  title: string;
  intro: string;
  codeLabel?: string;
  after: string;
  cta?: string;
  ignore: string;
}

const T: Record<EmailKind, Record<Lang, Copy>> = {
  verify_email: {
    pt: {
      subject: '{code} é o seu código do RolêJunto', preheader: 'Confirme seu e-mail para começar a reservar.',
      title: 'Confirme seu e-mail', intro: 'Olá, {name}! Falta pouco para você começar a usar o RolêJunto. Digite este código no app:',
      codeLabel: 'Código de confirmação', after: 'O código vale por 30 minutos.', cta: 'Abrir o RolêJunto',
      ignore: 'Se você não criou uma conta no RolêJunto, ignore este e-mail.',
    },
    es: {
      subject: '{code} es tu código de RolêJunto', preheader: 'Confirma tu correo para empezar a reservar.',
      title: 'Confirma tu correo', intro: '¡Hola, {name}! Falta poco para empezar a usar RolêJunto. Escribe este código en la app:',
      codeLabel: 'Código de confirmación', after: 'El código es válido por 30 minutos.', cta: 'Abrir RolêJunto',
      ignore: 'Si no creaste una cuenta en RolêJunto, ignora este correo.',
    },
    en: {
      subject: '{code} is your RolêJunto code', preheader: 'Confirm your email to start booking.',
      title: 'Confirm your email', intro: 'Hi {name}! You’re almost ready to use RolêJunto. Enter this code in the app:',
      codeLabel: 'Confirmation code', after: 'The code is valid for 30 minutes.', cta: 'Open RolêJunto',
      ignore: 'If you didn’t create a RolêJunto account, you can ignore this email.',
    },
    zh: {
      subject: '{code} 是你的 RolêJunto 验证码', preheader: '确认邮箱后即可开始预约。',
      title: '确认你的邮箱', intro: '{name}，你好！马上就能开始使用 RolêJunto 了。请在应用中输入以下验证码：',
      codeLabel: '验证码', after: '验证码 30 分钟内有效。', cta: '打开 RolêJunto',
      ignore: '如果你没有注册 RolêJunto，请忽略此邮件。',
    },
  },
  password_reset: {
    pt: {
      subject: 'Seu código para criar uma nova senha', preheader: 'Use o código para criar uma nova senha.',
      title: 'Criar nova senha', intro: 'Olá, {name}. Recebemos um pedido para criar uma nova senha na sua conta. Use este código:',
      codeLabel: 'Código', after: 'O código vale por 15 minutos. Depois da troca, todas as sessões abertas são encerradas.',
      ignore: 'Se não foi você, ignore este e-mail: sua senha continua a mesma.',
    },
    es: {
      subject: 'Tu código para crear una nueva contraseña', preheader: 'Usa el código para crear una nueva contraseña.',
      title: 'Crear nueva contraseña', intro: 'Hola, {name}. Recibimos una solicitud para crear una nueva contraseña en tu cuenta. Usa este código:',
      codeLabel: 'Código', after: 'El código es válido por 15 minutos. Después del cambio, se cierran todas las sesiones abiertas.',
      ignore: 'Si no fuiste tú, ignora este correo: tu contraseña sigue igual.',
    },
    en: {
      subject: 'Your code to create a new password', preheader: 'Use the code to create a new password.',
      title: 'Create a new password', intro: 'Hi {name}. We received a request to create a new password for your account. Use this code:',
      codeLabel: 'Code', after: 'The code is valid for 15 minutes. After the change, all open sessions are signed out.',
      ignore: 'If this wasn’t you, ignore this email: your password stays the same.',
    },
    zh: {
      subject: '设置新密码的验证码', preheader: '使用验证码设置新密码。',
      title: '设置新密码', intro: '{name}，你好。我们收到了为你的账户设置新密码的请求。请使用以下验证码：',
      codeLabel: '验证码', after: '验证码 15 分钟内有效。修改后，所有已登录的设备都会退出。',
      ignore: '如果不是你本人操作，请忽略此邮件，你的密码不会改变。',
    },
  },
  support_received: {
    pt: {
      subject: 'Recebemos sua mensagem (protocolo {protocol})', preheader: 'Respondemos em até 24 horas.',
      title: 'Recebemos sua mensagem', intro: 'Olá! Sua mensagem chegou à equipe RolêJunto com o protocolo {protocol}.',
      after: 'Respondemos em até 24 horas neste e-mail. Em perigo imediato, ligue 190.', ignore: 'Você recebeu este e-mail porque escreveu para o suporte do RolêJunto.',
    },
    es: {
      subject: 'Recibimos tu mensaje (protocolo {protocol})', preheader: 'Respondemos en hasta 24 horas.',
      title: 'Recibimos tu mensaje', intro: '¡Hola! Tu mensaje llegó al equipo de RolêJunto con el protocolo {protocol}.',
      after: 'Respondemos en hasta 24 horas a este correo. En peligro inmediato, llama al 190.', ignore: 'Recibiste este correo porque escribiste al soporte de RolêJunto.',
    },
    en: {
      subject: 'We got your message (ticket {protocol})', preheader: 'We reply within 24 hours.',
      title: 'We got your message', intro: 'Hi! Your message reached the RolêJunto team with ticket number {protocol}.',
      after: 'We’ll reply to this email within 24 hours. If you’re in immediate danger, call 190.', ignore: 'You received this email because you contacted RolêJunto support.',
    },
    zh: {
      subject: '我们已收到你的消息（编号 {protocol}）', preheader: '我们会在 24 小时内回复。',
      title: '我们已收到你的消息', intro: '你好！你的消息已送达 RolêJunto 团队，编号为 {protocol}。',
      after: '我们会在 24 小时内回复到此邮箱。如遇紧急危险，请拨打 190。', ignore: '你收到此邮件是因为你联系了 RolêJunto 客服。',
    },
  },
};

const FOOTER: Record<Lang, string> = {
  pt: 'RolêJunto · Companhia verificada para cada programa. Plataforma exclusivamente social, proibida para menores de 18 anos. O RolêJunto nunca pede sua senha por e-mail.',
  es: 'RolêJunto · Compañía verificada para cada plan. Plataforma exclusivamente social, prohibida para menores de 18 años. RolêJunto nunca te pide la contraseña por correo.',
  en: 'RolêJunto · Verified company for every plan. A strictly social platform for adults 18+. RolêJunto will never ask for your password by email.',
  zh: 'RolêJunto · 每次活动都有经过验证的陪伴。仅限社交用途，禁止未满 18 岁者使用。RolêJunto 绝不会通过邮件索要你的密码。',
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

export function asLang(l?: string | null): Lang {
  return l === 'es' || l === 'en' || l === 'zh' ? l : 'pt';
}

/** Monta o e-mail (assunto, texto e HTML) no idioma da pessoa. */
export function renderEmail(kind: EmailKind, lang: string | null | undefined, vars: Record<string, string>): Email {
  const L = asLang(lang);
  return layout(L, T[kind][L], vars);
}

const siteUrl = () => config.APP_URL.split(',')[0].replace(/\/$/, '');

/** Monta o HTML e o texto de qualquer e-mail a partir dos textos (c) e das variáveis (v). */
function layout(L: Lang, c: Copy, vars: Record<string, string>, ctaPath = ''): Email {
  const v = Object.fromEntries(Object.entries(vars).map(([k, x]) => [k, x ?? '']));
  const site = `${siteUrl()}${ctaPath}`;
  const f = (s: string) => fill(s, v);
  const fe = (s: string) => esc(f(s));

  const text = [
    f(c.title), '', f(c.intro), '',
    v.code ? `${f(c.codeLabel ?? '')}: ${v.code}` : '',
    f(c.after), '',
    c.cta ? `${f(c.cta)}: ${site}` : '',
    f(c.ignore), '', '—', FOOTER[L],
  ].filter((line, i, a) => !(line === '' && a[i - 1] === '')).join('\n');

  const code = v.code ? `
          <tr><td style="padding:8px 32px 4px;font:600 13px/1.4 Arial,Helvetica,sans-serif;color:#5B6275;text-transform:uppercase;letter-spacing:.08em">${fe(c.codeLabel ?? '')}</td></tr>
          <tr><td style="padding:4px 32px 8px">
            <div style="display:inline-block;background:#F3F4F8;border:1px solid #E3E5EC;border-radius:16px;padding:14px 22px;font:700 34px/1 'Courier New',Courier,monospace;letter-spacing:10px;color:#121826">${esc(v.code)}</div>
          </td></tr>` : '';
  const cta = c.cta ? `
          <tr><td style="padding:8px 32px 8px">
            <a href="${esc(site)}" style="display:inline-block;background:#D9381E;color:#ffffff;text-decoration:none;font:700 16px/1 Arial,Helvetica,sans-serif;padding:15px 26px;border-radius:14px">${fe(c.cta)}</a>
          </td></tr>` : '';

  const html = `<!doctype html>
<html lang="${L === 'pt' ? 'pt-BR' : L}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${fe(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#F3F4F8">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all">${fe(c.preheader)}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F8">
    <tr><td align="center" style="padding:32px 12px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
        <tr><td style="padding:0 8px 18px">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="width:40px;height:40px;vertical-align:middle"><img src="${esc(siteUrl())}/icons/email-logo.png" width="40" height="40" alt="" style="display:block;border:0;border-radius:12px"></td>
            <td style="padding-left:10px;font:800 24px/1 Arial,Helvetica,sans-serif;color:#121826;letter-spacing:-.5px">rolê<span style="color:#D9381E">junto</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="background:#ffffff;border:1px solid #E3E5EC;border-radius:24px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:32px 32px 8px;font:800 26px/1.2 Arial,Helvetica,sans-serif;color:#121826">${fe(c.title)}</td></tr>
          <tr><td style="padding:8px 32px 12px;font:400 16px/1.6 Arial,Helvetica,sans-serif;color:#3A4152">${fe(c.intro)}</td></tr>${code}
${c.after ? `
          <tr><td style="padding:12px 32px 8px;font:400 15px/1.6 Arial,Helvetica,sans-serif;color:#3A4152">${fe(c.after)}</td></tr>` : ''}${cta}
          <tr><td style="padding:16px 32px 28px">
            <div style="border-top:1px solid #E3E5EC;padding-top:16px;font:400 13px/1.6 Arial,Helvetica,sans-serif;color:#5B6275">${fe(c.ignore)}</div>
          </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:18px 16px 0;font:400 12px/1.6 Arial,Helvetica,sans-serif;color:#7A8194;text-align:center">${esc(FOOTER[L])}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject: f(c.subject), text, html };
}

// ---------- Avisos (mesmas notificações do app, por e-mail) ----------
type Notice = [title: string, text: string];
const NOTICES: Record<Lang, Record<string, Notice>> = {
  pt: {
    booking_request: ['Novo pedido de {name}', '{name} quer sair com você ({when}). Responda rápido: pedidos aceitos cedo têm mais chance de pagamento.'],
    booking_accepted: ['{name} aceitou sua reserva', 'Pague para garantir o encontro ({when}). O valor fica retido até o fim do encontro.'],
    booking_declined: ['{name} não pode nesse horário', 'Escolha outro horário ou outra pessoa. Nada foi cobrado.'],
    booking_cancelled: ['Reserva cancelada', 'A reserva com {name} ({when}) foi cancelada. O reembolso, quando houver, é feito automaticamente.'],
    payment_confirmed: ['Pagamento confirmado', 'Seu encontro com {name} ({when}) está garantido. O valor fica retido até o fim do encontro.'],
    payment_confirmed_partner: ['Reserva paga', '{name} pagou o encontro ({when}). O valor é liberado a você depois do encontro.'],
    review_request: ['Como foi o encontro?', 'Avalie o encontro com {name} e ajude a comunidade.'],
    new_message: ['Nova mensagem de {name}', '{name} mandou uma mensagem para você no RolêJunto. Por segurança, responda sempre pelo app.'],
    verification_approved: ['Identidade verificada', 'Tudo certo! As reservas estão liberadas.'],
    verification_rejected: ['Verificação não aprovada', 'Não conseguimos confirmar seus dados. Envie os documentos novamente pelo app.'],
    account_warning: ['Aviso da equipe RolêJunto', 'Recebemos uma denúncia sobre sua conta. Reveja as diretrizes da comunidade.'],
    photo_rejected: ['Foto recusada', 'Uma das suas fotos não seguiu as diretrizes e foi removida.'],
    payout_sent: ['Repasse enviado', 'Enviamos {v} para a sua conta via Pix.'],
    favorite_available: ['{name} está com horários livres', 'Uma pessoa que você favoritou abriu novos horários. Reserve antes que acabem.'],
    referral_reward: ['Você ganhou {v} de desconto', 'Sua indicação deu certo! O cupom já está em Perfil → Meus cupons e vale por 90 dias.'],
    sos: ['SOS acionado por {name}', 'Um SOS foi acionado durante um encontro. Abra o painel agora.'],
    urgent_report: ['Denúncia urgente', 'Uma denúncia de prioridade máxima precisa de análise.'],
  },
  es: {
    booking_request: ['Nueva solicitud de {name}', '{name} quiere salir contigo ({when}). Responde rápido: las solicitudes aceptadas pronto tienen más chance de pago.'],
    booking_accepted: ['{name} aceptó tu reserva', 'Paga para asegurar el encuentro ({when}). El monto queda retenido hasta el final del encuentro.'],
    booking_declined: ['{name} no puede en ese horario', 'Elige otro horario u otra persona. No se cobró nada.'],
    booking_cancelled: ['Reserva cancelada', 'La reserva con {name} ({when}) fue cancelada. El reembolso, cuando corresponde, es automático.'],
    payment_confirmed: ['Pago confirmado', 'Tu encuentro con {name} ({when}) está asegurado. El monto queda retenido hasta el final.'],
    payment_confirmed_partner: ['Reserva pagada', '{name} pagó el encuentro ({when}). El monto se libera después del encuentro.'],
    review_request: ['¿Qué tal fue el encuentro?', 'Evalúa el encuentro con {name} y ayuda a la comunidad.'],
    new_message: ['Nuevo mensaje de {name}', '{name} te envió un mensaje en RolêJunto. Por seguridad, responde siempre por la app.'],
    verification_approved: ['Identidad verificada', '¡Todo listo! Las reservas están habilitadas.'],
    verification_rejected: ['Verificación no aprobada', 'No pudimos confirmar tus datos. Envía los documentos de nuevo por la app.'],
    account_warning: ['Aviso del equipo RolêJunto', 'Recibimos una denuncia sobre tu cuenta. Revisa las normas de la comunidad.'],
    photo_rejected: ['Foto rechazada', 'Una de tus fotos no cumplía las normas y fue eliminada.'],
    payout_sent: ['Pago enviado', 'Enviamos {v} a tu cuenta por Pix.'],
    favorite_available: ['{name} tiene horarios libres', 'Una persona que marcaste como favorita abrió nuevos horarios. Reserva antes de que se acaben.'],
    referral_reward: ['Ganaste {v} de descuento', '¡Tu invitación funcionó! El cupón ya está en Perfil → Mis cupones y vale 90 días.'],
    sos: ['SOS activado por {name}', 'Se activó un SOS durante un encuentro. Abre el panel ahora.'],
    urgent_report: ['Denuncia urgente', 'Una denuncia de máxima prioridad necesita revisión.'],
  },
  en: {
    booking_request: ['New request from {name}', '{name} wants to go out with you ({when}). Reply quickly: requests accepted early are more likely to be paid.'],
    booking_accepted: ['{name} accepted your booking', 'Pay to secure your meeting ({when}). The amount is held until the meeting ends.'],
    booking_declined: ['{name} can’t make that time', 'Pick another time or person. Nothing was charged.'],
    booking_cancelled: ['Booking cancelled', 'Your booking with {name} ({when}) was cancelled. Any refund is processed automatically.'],
    payment_confirmed: ['Payment confirmed', 'Your meeting with {name} ({when}) is secured. The amount is held until it ends.'],
    payment_confirmed_partner: ['Booking paid', '{name} paid for the meeting ({when}). The amount is released to you afterwards.'],
    review_request: ['How did it go?', 'Review your meeting with {name} and help the community.'],
    new_message: ['New message from {name}', '{name} sent you a message on RolêJunto. For your safety, always reply in the app.'],
    verification_approved: ['Identity verified', 'All set! Bookings are unlocked.'],
    verification_rejected: ['Verification not approved', 'We couldn’t confirm your details. Please send your documents again in the app.'],
    account_warning: ['Notice from the RolêJunto team', 'We received a report about your account. Please review the community guidelines.'],
    photo_rejected: ['Photo rejected', 'One of your photos didn’t follow the guidelines and was removed.'],
    payout_sent: ['Payout sent', 'We sent {v} to your account via Pix.'],
    favorite_available: ['{name} has open times', 'Someone you favorited just opened new times. Book before they’re gone.'],
    referral_reward: ['You earned {v} off', 'Your referral worked! The coupon is in Profile → My coupons and is valid for 90 days.'],
    sos: ['SOS triggered by {name}', 'An SOS was triggered during a meeting. Open the dashboard now.'],
    urgent_report: ['Urgent report', 'A top-priority report needs review.'],
  },
  zh: {
    booking_request: ['{name} 发来新请求', '{name} 想和你一起出去（{when}）。尽快回复：越早接受，付款的可能性越高。'],
    booking_accepted: ['{name} 接受了你的预约', '付款即可锁定这次见面（{when}）。款项将托管至见面结束。'],
    booking_declined: ['{name} 该时间不方便', '请选择其他时间或其他人，未产生任何费用。'],
    booking_cancelled: ['预约已取消', '你与 {name} 的预约（{when}）已取消。如有退款，将自动处理。'],
    payment_confirmed: ['付款成功', '你与 {name} 的见面（{when}）已确认。款项将托管至见面结束。'],
    payment_confirmed_partner: ['预约已付款', '{name} 已为这次见面（{when}）付款，见面结束后款项将发放给你。'],
    review_request: ['见面感觉如何？', '为与 {name} 的见面留下评价，帮助社区。'],
    new_message: ['{name} 发来新消息', '{name} 在 RolêJunto 上给你发了消息。为了安全，请始终在应用内回复。'],
    verification_approved: ['身份已验证', '一切就绪！现在可以预约了。'],
    verification_rejected: ['验证未通过', '我们无法确认你的信息，请在应用中重新提交证件。'],
    account_warning: ['RolêJunto 团队提醒', '我们收到了关于你账户的举报，请重温社区准则。'],
    photo_rejected: ['照片未通过', '你的一张照片不符合准则，已被删除。'],
    payout_sent: ['款项已发放', '我们已通过 Pix 向你的账户转入 {v}。'],
    favorite_available: ['{name} 有空闲时间了', '你收藏的人开放了新的时间，趁早预约。'],
    referral_reward: ['你获得了 {v} 优惠', '邀请成功！优惠券已放在 个人资料 → 我的优惠券，90 天内有效。'],
    sos: ['{name} 触发了 SOS', '见面中有人触发了 SOS，请立即打开管理后台。'],
    urgent_report: ['紧急举报', '有一条最高优先级的举报需要处理。'],
  },
};
const NOTICE_UI: Record<Lang, { cta: string; prefs: string }> = {
  pt: { cta: 'Abrir no RolêJunto', prefs: 'Você recebe estes avisos porque deixou ativado "E-mails sobre reservas, mensagens e pagamentos". Para desligar, vá em Perfil → Notificações.' },
  es: { cta: 'Abrir en RolêJunto', prefs: 'Recibes estos avisos porque tienes activado "Correos sobre reservas, mensajes y pagos". Para desactivarlos, ve a Perfil → Notificaciones.' },
  en: { cta: 'Open in RolêJunto', prefs: 'You get these notices because "Emails about bookings, messages and payments" is on. To turn them off, go to Profile → Notifications.' },
  zh: { cta: '在 RolêJunto 中打开', prefs: '你收到这些通知是因为开启了“有关预约、消息和付款的邮件”。如需关闭，请前往 个人资料 → 通知。' },
};

export const NOTICE_TYPES = new Set(Object.keys(NOTICES.pt));

/** E-mail de aviso (reserva, pagamento, mensagem...) no idioma da pessoa. */
export function renderNotice(type: string, lang: string | null | undefined, vars: { name?: string; when?: string; v?: string }, link?: string | null): Email | null {
  const L = asLang(lang);
  const n = NOTICES[L][type];
  if (!n) return null;
  const v = { name: vars.name || 'RolêJunto', when: vars.when ?? '', v: vars.v ?? '' };
  // remove trechos que ficariam vazios (ex.: "de ." quando não há data)
  const tidy = (s: string) => (v.when ? s : s.replace(/\s*[(（]\{when\}[)）]/g, ''));
  const title = tidy(n[0]);
  const text = tidy(n[1]);
  const c: Copy = { subject: title, preheader: text, title, intro: text, after: '', cta: NOTICE_UI[L].cta, ignore: NOTICE_UI[L].prefs };
  return layout(L, c, v, link ?? '');
}
