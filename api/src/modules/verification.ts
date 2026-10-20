// Verificação de identidade.
// As imagens (frente, verso, selfie) vão para um cofre privado e criptografado só para a equipe conferir no painel,
// e são apagadas assim que a análise é decidida. Com um provedor automático (Unico, idwall, CAF), o resultado chega por webhook.
// Em produção, o app usa o SDK do provedor (Unico, idwall, CAF) e o resultado chega por webhook em /api/webhooks/verification.
import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { config, isProd } from '../config.js';
import { users, verifications } from '../db/schema.js';
import { audit, notify, requireUser, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { ageFrom } from '../lib/security.js';
import { imageExt } from '../providers/storage.js';
import { vaultRemove, vaultSave } from '../providers/vault.js';

export default function verificationRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/verification', async (req) => {
    const u = requireUser(req);
    const [v] = await ctx.db.select().from(verifications).where(eq(verifications.userId, u.id)).orderBy(desc(verifications.createdAt)).limit(1);
    return { status: u.verification, lastAttempt: v ? { status: v.status, createdAt: v.createdAt, decidedAt: v.decidedAt } : null };
  });

  app.post('/verification', { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } }, async (req) => {
    const u = requireUser(req);
    if (u.verification === 'verified') return { status: 'verified' };
    if (u.verification === 'in_review') throw E.conflict('already_in_review', 'Sua verificação já está em análise.');
    const files = new Map<string, { buf: Buffer; mime: string }>();
    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      const buf = await part.toBuffer();
      const ext = imageExt(buf);
      if (!ext) throw E.badRequest('invalid_image', 'Envie imagens JPG, PNG ou WEBP.');
      if (['front', 'back', 'selfie'].includes(part.fieldname)) files.set(part.fieldname, { buf, mime: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' });
    }
    for (const f of ['front', 'back', 'selfie']) if (!files.has(f)) throw E.badRequest('missing_file', `Falta o arquivo: ${f}`);
    const saved: Record<string, string> = {};
    for (const [k, v] of files) saved[k] = await vaultSave(v.buf, v.mime);

    // Simulação do resultado do provedor
    const autoApprove = !isProd && !config.VERIFICATION_MANUAL && config.VERIFICATION_PROVIDER === 'mock';
    const age = ageFrom(u.birthDate);
    const [v] = await ctx.db.insert(verifications).values({
      userId: u.id, provider: config.VERIFICATION_PROVIDER, status: autoApprove ? 'verified' : 'in_review', matchScore: 95, docAge: age,
      decidedAt: autoApprove ? new Date() : null,
      // Aprovação automática de teste: nada para conferir, então as imagens não ficam guardadas
      ...(autoApprove ? {} : { frontFile: saved.front, backFile: saved.back, selfieFile: saved.selfie }),
    }).returning();
    if (autoApprove) await vaultRemove(saved.front, saved.back, saved.selfie);
    await ctx.db.update(users).set({ verification: v.status }).where(eq(users.id, u.id));
    if (autoApprove) await notify(ctx.db, u.id, 'verification_approved', {}, '/conta');
    await audit(ctx.db, req, 'verification.submit', 'user', u.id);
    return { status: v.status };
  });

  // Ponto de integração com o provedor real (assinatura e formato dependem do provedor escolhido)
  app.post('/webhooks/verification', async (_req, reply) => reply.status(501).send({ error: { code: 'not_configured', message: 'Configure o provedor de verificação.' } }));
}
