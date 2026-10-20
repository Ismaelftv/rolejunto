// Dados de demonstração (os mesmos parceiros do front-end). Rode com: npm run db:seed
// Não rode em produção com usuários reais.
import { eq, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { approx } from '../lib/geo.js';
import { hashPassword } from '../lib/security.js';
import { openDatabase, type DB } from './index.js';
import { availability, bookings, conversations, messages, partnerProfiles, payments, reviews, users } from './schema.js';
import { SEED_TRANSLATIONS } from './seedTranslations.js';

const PARTNERS = [
  { name: 'Marina', birth: '1997-03-14', bio: 'Produtora cultural, ama música ao vivo.', about: 'Produtora cultural, apaixonada por música ao vivo, baladas e exposições. Conheço os melhores cantinhos de Pinheiros e da Vila Madalena e adoro uma boa conversa.', acts: ['balada', 'bar', 'show', 'museu'], price: 9000, min: 2, langs: ['PT', 'EN'], hood: 'Pinheiros', lat: -23.5665, lng: -46.6930, slots: { 1: ['19:00', '22:00'], 3: ['18:00'], 4: ['12:00', '19:00'], 5: ['22:00'], 6: ['14:00', '17:00', '22:00'], 0: ['11:00', '15:00'] } },
  { name: 'Rafael', birth: '1992-05-02', bio: 'Chef amador e guia de botecos.', about: 'Cozinheiro de fim de semana e explorador de botecos. Organizo churrascos no sítio da família e adoro receber amigos em casa.', acts: ['bar', 'casa', 'sitio', 'jantar'], price: 8000, min: 2, langs: ['PT', 'ES'], hood: 'Vila Madalena', lat: -23.5530, lng: -46.6900, slots: { 2: ['19:00', '21:00'], 4: ['20:00'], 6: ['12:00', '19:00'], 0: ['11:00'] } },
  { name: 'Bia', birth: '2000-01-20', bio: 'Surfista e DJ nas horas vagas.', about: 'Surfista, DJ nas horas vagas e sempre por dentro das melhores baladas e praias do litoral norte.', acts: ['praia', 'balada', 'bar'], price: 8500, min: 3, langs: ['PT', 'EN', 'ES'], hood: 'Itaim Bibi', lat: -23.5840, lng: -46.6780, slots: { 1: ['22:00'], 2: ['10:00'], 5: ['22:00'], 6: ['09:00', '22:00'], 0: ['09:00'] } },
  { name: 'Léo', birth: '1998-07-11', bio: 'Animado, bom de papo e de pista.', about: 'Gosto de balada, de bar com música ao vivo e de levar quem chega na cidade aos melhores rolês.', acts: ['balada', 'bar', 'show', 'turismo'], price: 7000, min: 3, langs: ['PT', 'EN'], hood: 'Barra Funda', lat: -23.5260, lng: -46.6670, slots: { 1: ['22:00'], 2: ['21:00', '23:00'], 5: ['23:00'] } },
  { name: 'Clara', birth: '1985-09-30', bio: 'Historiadora da arte, fala 3 idiomas.', about: 'Historiadora da arte e professora. Faço visitas guiadas informais por museus e centros culturais.', acts: ['museu', 'turismo', 'jantar'], price: 10000, min: 2, langs: ['PT', 'EN', 'FR'], hood: 'Higienópolis', lat: -23.5450, lng: -46.6560, slots: { 6: ['10:00', '14:00'], 0: ['10:00', '15:00'] } },
  { name: 'Helena', birth: '1974-02-08', bio: 'Enfermeira aposentada, paciente e atenciosa.', about: 'Enfermeira aposentada. Acompanho pessoas idosas em passeios, consultas e compras, sempre em contato com a família.', acts: ['cuidado', 'turismo', 'praia'], price: 6000, min: 2, langs: ['PT'], hood: 'Perdizes', lat: -23.5380, lng: -46.6800, slots: { 1: ['09:00', '14:00'], 2: ['09:00', '14:00'], 3: ['09:00'], 4: ['14:00'], 6: ['09:00'] } },
  { name: 'Júlia', birth: '1996-11-19', bio: 'Relações públicas, ótima em eventos.', about: 'Trabalho com eventos e sei deixar qualquer pessoa à vontade em casamentos, festas em casa e jantares de negócios.', acts: ['evento', 'casa', 'jantar', 'show'], price: 11000, min: 3, langs: ['PT', 'EN'], hood: 'Moema', lat: -23.6010, lng: -46.6650, slots: { 5: ['19:00'], 6: ['18:00', '20:00'], 0: ['12:00'] } },
];

export async function seed(db: DB, opts: { quiet?: boolean } = {}) {
  const log = (...a: unknown[]) => { if (!opts.quiet) console.log(...a); };
  const pw = await hashPassword('rolejunto123');
  const now = new Date();
  const upsertUser = async (email: string, v: Partial<typeof users.$inferInsert> & { name: string; birthDate: string }) => {
    const [found] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`);
    if (found) return found;
    const [u] = await db.insert(users).values({ email, passwordHash: pw, termsAcceptedAt: now, privacyConsentAt: now, emailVerifiedAt: now, ...v }).returning();
    return u;
  };

  await upsertUser(config.ADMIN_EMAIL ?? 'admin@rolejunto.local', { name: 'Equipe RolêJunto', birthDate: '1990-01-01', role: 'admin', verification: 'verified' });
  const partnerIds: Record<string, string> = {};
  const ana = await upsertUser('cliente@rolejunto.local', { name: 'Ana', birthDate: '1995-06-15', role: 'client', verification: 'verified', trustedContactName: 'Maria', trustedContactPhone: '11999990000' });
  for (const p of PARTNERS) {
    const email = `${p.name.normalize('NFD').replace(/[^\w]/g, '').toLowerCase()}@rolejunto.local`;
    const u = await upsertUser(email, { name: p.name, birthDate: p.birth, role: 'partner', verification: 'verified' });
    await db.insert(partnerProfiles).values({
      userId: u.id, bio: p.bio, about: p.about, activities: p.acts, priceCents: p.price, minHours: p.min, languages: p.langs,
      neighborhood: p.hood, city: 'São Paulo', approxLat: approx(p.lat), approxLng: approx(p.lng), visible: true,
      translations: SEED_TRANSLATIONS[p.name] ?? {},
    }).onConflictDoNothing();
    partnerIds[p.name] = u.id;
    await db.delete(availability).where(eq(availability.partnerId, u.id));
    const slots = p.slots as unknown as Record<string, string[] | undefined>;
    const rows = Object.entries(slots).flatMap(([wd, starts]) => (starts ?? []).map((start: string) => ({ partnerId: u.id, weekday: Number(wd), start })));
    if (rows.length) await db.insert(availability).values(rows).onConflictDoNothing();
  }
  await seedHistory(db, partnerIds, ana.id, upsertUser);
  log('Seed concluído. Senha de todas as contas de demonstração: rolejunto123');
  log('  admin@rolejunto.local · cliente@rolejunto.local · marina@rolejunto.local (e os demais parceiros)');
}

// Encontros já concluídos com avaliações reais (alimentam notas e a aba "Avaliações").
const PAST = [
  { client: 'Ana', partner: 'Rafael', activity: 'jantar', daysAgo: 10, hours: 3, place: 'Largo da Batata', rating: 5, text: 'Escolheu um bar incrível. Ótima conversa.' },
  { client: 'Ana Paula', partner: 'Marina', activity: 'balada', daysAgo: 20, hours: 3, place: 'Vila Olímpia', rating: 5, text: 'Super pontual e animada. A balada foi muito mais divertida com companhia!' },
  { client: 'Lucas Martins', partner: 'Marina', activity: 'museu', daysAgo: 35, hours: 2, place: 'Pinacoteca', rating: 5, text: 'Sabe muito sobre arte e conversa sobre tudo. Recomendo.' },
  { client: 'Paulo Silva', partner: 'Bia', activity: 'praia', daysAgo: 60, hours: 4, place: 'Maresias', rating: 5, text: 'Conhece as melhores praias. Dia perfeito.' },
  { client: 'Rita Ferreira', partner: 'Clara', activity: 'museu', daysAgo: 70, hours: 2, place: 'Pinacoteca', rating: 5, text: 'A melhor visita à Pinacoteca que já fiz.' },
  { client: 'Sônia Souza', partner: 'Helena', activity: 'cuidado', daysAgo: 25, hours: 3, place: 'Hospital Sírio-Libanês', rating: 5, text: 'Cuidou da minha mãe com muito carinho na consulta e no passeio.' },
  { client: 'Renato Alves', partner: 'Júlia', activity: 'evento', daysAgo: 100, hours: 4, place: 'Centro de Convenções', rating: 4, text: 'Muito profissional no evento da empresa.' },
] as const;

async function seedHistory(
  db: DB, partnerIds: Record<string, string>, anaId: string,
  upsertUser: (email: string, v: Partial<typeof users.$inferInsert> & { name: string; birthDate: string }) => Promise<typeof users.$inferSelect>,
) {
  const already = await db.select({ id: reviews.id }).from(reviews).limit(1);
  if (already.length) return;
  for (const h of PAST) {
    const clientId = h.client === 'Ana' ? anaId : (await upsertUser(`${h.client.split(' ')[0].normalize('NFD').replace(/[^\w]/g, '').toLowerCase()}@rolejunto.local`, { name: h.client, birthDate: '1990-05-05', role: 'client', verification: 'verified' })).id;
    const partnerId = partnerIds[h.partner];
    const [p] = await db.select().from(partnerProfiles).where(eq(partnerProfiles.userId, partnerId));
    const startsAt = new Date(Date.now() - h.daysAgo * 86400_000);
    startsAt.setUTCHours(23, 0, 0, 0); // 20h em Brasília
    const subtotal = p.priceCents * h.hours;
    const fee = Math.round(subtotal * config.SERVICE_FEE_RATE);
    const [b] = await db.insert(bookings).values({
      clientId, partnerId, activity: h.activity, startsAt, hours: h.hours, place: h.place, priceCents: p.priceCents,
      subtotalCents: subtotal, feeCents: fee, totalCents: subtotal + fee, status: 'completed', paymentStatus: 'released',
      checkInAt: startsAt, completedAt: new Date(startsAt.getTime() + h.hours * 3600_000), createdAt: new Date(startsAt.getTime() - 3 * 86400_000),
    }).returning();
    const paidAt = new Date(startsAt.getTime() - 2 * 86400_000);
    await db.insert(payments).values({ bookingId: b.id, provider: 'mock', method: 'pix', amountCents: b.totalCents, status: 'paid', paidAt, createdAt: paidAt, expiresAt: paidAt, providerRef: `seed_${b.id.slice(0, 8)}` });
    await db.insert(reviews).values({ bookingId: b.id, authorId: clientId, targetId: partnerId, rating: h.rating, text: h.text, createdAt: b.completedAt! });
    const [c] = await db.insert(conversations).values({ clientId, partnerId, lastMessageAt: b.completedAt! }).onConflictDoNothing().returning();
    if (c) {
      await db.insert(messages).values([
        { conversationId: c.id, senderId: null, kind: 'system', body: 'booking_completed', data: { bookingId: b.id }, createdAt: b.completedAt! },
        { conversationId: c.id, senderId: partnerId, body: 'Obrigado pela companhia! Foi ótimo. 😊', createdAt: b.completedAt!, readAt: b.completedAt! },
      ]);
    }
  }
  // Nota média de cada parceiro a partir das avaliações
  for (const id of Object.values(partnerIds)) {
    const rs = await db.select({ rating: reviews.rating }).from(reviews).where(eq(reviews.targetId, id));
    if (rs.length) await db.update(partnerProfiles).set({ ratingAvg: Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 10) / 10, ratingCount: rs.length }).where(eq(partnerProfiles.userId, id));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const database = await openDatabase({ url: config.DATABASE_URL, pgliteDir: config.PGLITE_DIR });
  await seed(database.db);
  await database.close();
}
