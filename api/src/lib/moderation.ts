// Moderação automática de textos (chat, bio, avaliações).
// É um primeiro filtro: tudo que é sinalizado vai para revisão humana no painel admin.

const PHONE = /(\+?\d{2}\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s.]?\d{4}/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LINK = /(https?:\/\/|www\.|wa\.me|t\.me|instagram\.com|wechat|weixin|telegram)/i;
const CONTACT_WORDS = /\b(whats|zap|zapzap|watsap|telegram|insta|pix por fora|paga por fora|fora do app)\b/i;

// Termos que indicam pedido/oferta de serviço sexual (PT/ES/EN). Lista curta e ampliável pela equipe.
const SEXUAL = [
  /\bprograma completo\b/i, /\bfazer programa\b/i, /\bsexo\b/i, /\btransar\b/i, /\bmotel\b/i, /\bnudes?\b/i,
  /\bacompanhante de luxo\b/i, /\bservi[cç]o sexual\b/i, /\bfinal feliz\b/i, /\bsexual services?\b/i, /\bhook ?up\b/i,
  /\bservicio sexual\b/i, /\bfull service\b/i, /\bescort\b/i,
];

export type ModerationResult =
  | { ok: true }
  | { ok: false; code: 'contact_info' | 'policy_violation'; severity: 'block' | 'report' };

export function moderateText(text: string): ModerationResult {
  if (SEXUAL.some((r) => r.test(text))) return { ok: false, code: 'policy_violation', severity: 'report' };
  if (PHONE.test(text) || EMAIL.test(text) || LINK.test(text) || CONTACT_WORDS.test(text)) return { ok: false, code: 'contact_info', severity: 'block' };
  return { ok: true };
}

/** Motivos de denúncia que entram com prioridade máxima. */
export const HIGH_PRIORITY_REASONS = new Set(['sexual', 'minor', 'threat', 'abuse']);
export const REPORT_REASONS = ['sexual', 'abuse', 'fake', 'minor', 'off_platform_payment', 'threat', 'other'] as const;
