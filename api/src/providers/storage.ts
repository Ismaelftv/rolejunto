// Armazenamento de fotos. Local por padrão; em produção, troque por S3/Cloudflare R2 mantendo a mesma interface.
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

export interface Storage { save(buf: Buffer, ext: string): Promise<string>; remove(url: string): Promise<void> }

export const localStorage: Storage = {
  async save(buf, ext) {
    await mkdir(config.UPLOAD_DIR, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    await writeFile(path.join(config.UPLOAD_DIR, name), buf);
    return `/uploads/${name}`; // caminho relativo: funciona no mesmo domínio do site e no app (o front completa com o endereço da API)
  },
  async remove(url) {
    const name = url.split('/uploads/')[1];
    if (name && /^[\w-]+\.\w+$/.test(name)) await unlink(path.join(config.UPLOAD_DIR, name)).catch(() => {});
  },
};

/** Confere a assinatura do arquivo (não confia na extensão enviada). */
export function imageExt(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}
