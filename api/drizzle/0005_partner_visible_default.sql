-- Parceiros novos já nascem "visíveis": a busca continua exigindo e-mail, identidade, foto aprovada, região e agenda.
ALTER TABLE "partner_profiles" ALTER COLUMN "visible" SET DEFAULT true;
