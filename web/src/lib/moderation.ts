// Moderação no cliente: só um primeiro filtro para orientar o usuário.
// A moderação de verdade precisa rodar no servidor (texto e imagens), com revisão humana.

const PHONE = /(\+?\d{2}\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s.]?\d{4}/;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const LINK = /(https?:\/\/|www\.|wa\.me|t\.me|instagram\.com|wechat|weixin)/i;

/** Retorna true quando a mensagem pode ser enviada. */
export function isMessageAllowed(text: string): boolean {
  return !(PHONE.test(text) || EMAIL.test(text) || LINK.test(text));
}
