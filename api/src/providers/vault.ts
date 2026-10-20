// Cofre das imagens de verificação: criptografia AES-256-GCM em disco, pasta privada (fora do /uploads público).
// As imagens só existem enquanto a análise está aberta; ao aprovar/recusar elas são apagadas (política de privacidade).
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

const key = () => createHash('sha256').update(`vault:${config.VAULT_KEY ?? config.COOKIE_SECRET}`).digest();

export interface VaultFile { id: string; mime: string }

export async function vaultSave(buf: Buffer, mime: string): Promise<string> {
  await mkdir(config.VAULT_DIR, { recursive: true, mode: 0o700 });
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  const id = `${randomUUID()}.${mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'}.enc`;
  await writeFile(path.join(config.VAULT_DIR, id), Buffer.concat([iv, c.getAuthTag(), enc]), { mode: 0o600 });
  return id;
}

const safe = (id: string) => /^[\w-]+\.(jpg|png|webp)\.enc$/.test(id);

export async function vaultRead(id: string): Promise<{ buf: Buffer; mime: string } | null> {
  if (!safe(id)) return null;
  try {
    const raw = await readFile(path.join(config.VAULT_DIR, id));
    const d = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const ext = id.split('.')[1];
    return { buf: Buffer.concat([d.update(raw.subarray(28)), d.final()]), mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' };
  } catch { return null; }
}

export async function vaultRemove(...ids: (string | null | undefined)[]) {
  for (const id of ids) if (id && safe(id)) await unlink(path.join(config.VAULT_DIR, id)).catch(() => {});
}
