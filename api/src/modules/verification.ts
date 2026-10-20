// Verificação de identidade.
// Modo "mock": recebe as imagens só para validar o envio e as descarta — nenhum documento é guardado.
// Em produção, o app usa o SDK do provedor (Unico, idwall, CAF) e o resultado chega por webhook em /api/webhooks/verification.
import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { config, isProd } from '../config.js';
import { users, verifications } from '../db/schema.js';
import { audit, notify, requireUser, type Ctx } from '../lib/context.js';
import { E } from '../lib/errors.js';
import { ageFrom } from '../lib/security.js';
import { imageExt } from '../providers/storage.js';

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
    const got = new Set<string>();
    for await (const part of req.parts()) {
      if (part.type !== 'file') continue;
      const buf = await part.toBuffer();
      if (!imageExt(buf)) throw E.badRequest('invalid_image', 'Envie imagens JPG, PNG ou WEBP.');
      got.add(part.fieldname); // a imagem é descartada aqui (mock)
    }
    for (const f of ['front', 'back', 'selfie']) if (!got.has(f)) throw E.badRequest('missing_file', `Falta o arquivo: ${f}`);

    // Simulação do resultado do provedor
    const autoApprove = !isProd && config.VERIFICATION_PROVIDER === 'mock';
    const age = ageFrom(u.birthDate);
    const [v] = await ctx.db.insert(verifications).values({
      userId: u.id, provider: config.VERIFICATION_PROVIDER, status: autoApprove ? 'verified' : 'in_review', matchScore: 95, docAge: age,
      decidedAt: autoApprove ? new Date() : null,
    }).returning();
    await ctx.db.update(users).set({ verification: v.status }).where(eq(users.id, u.id));
    if (autoApprove) await notify(ctx.db, u.id, 'verification_approved', {}, '/conta');
    await audit(ctx.db, req, 'verification.submit', 'user', u.id);
    return { status: v.status };
  });

  // Ponto de integração com o provedor real (assinatura e formato dependem do provedor escolhido)
  app.post('/webhooks/verification', async (_req, reply) => reply.status(501).send({ error: { code: 'not_configured', message: 'Configure o provedor de verificação.' } }));
}
