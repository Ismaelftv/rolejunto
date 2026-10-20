-- Fotos de verificação (cofre criptografado), resposta a chamados e conferência de reembolsos manuais
ALTER TABLE "verifications" ADD COLUMN "front_file" text;--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN "back_file" text;--> statement-breakpoint
ALTER TABLE "verifications" ADD COLUMN "selfie_file" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "refund_done_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "booking_id" uuid;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "reply" text;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "replied_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD COLUMN "replied_by" uuid;
