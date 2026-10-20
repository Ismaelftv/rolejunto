-- Parceiros criados antes do padrão "visível" ficaram com visible=false e nunca apareciam na busca.
UPDATE "partner_profiles" SET "visible" = true WHERE "visible" = false;
