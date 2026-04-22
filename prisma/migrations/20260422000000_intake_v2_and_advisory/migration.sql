-- Sprint 5: Intake V2 + Advisory
--
-- Adds the 19 MISSING + 9 PARTIAL intake fields from SPRINT-5-PLAN §2.1 as
-- two JSON blobs on Office (structure lives in src/lib/engine/types.ts
-- IntakeGoals + IntakeConstraints). Defaults to "{}" so existing rows stay
-- valid; the UI surfaces an "intake incomplete" banner and gates Generate
-- at < 80% completeness.
--
-- TemplateAdvisory is the persisted advisory artifact — one row per
-- generate, stores the six-section document, six-axis score, three
-- variants, and 30/60/90 review plan (all JSON; shape lives in
-- src/lib/engine/advisory/types.ts). Keyed by templateId so the UI can
-- look up the current advisory for any schedule.

ALTER TABLE "Office" ADD COLUMN "intakeGoals" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Office" ADD COLUMN "intakeConstraints" TEXT NOT NULL DEFAULT '{}';

CREATE TABLE "TemplateAdvisory" (
    "id"              TEXT NOT NULL PRIMARY KEY,
    "templateId"      TEXT NOT NULL,
    "officeId"        TEXT NOT NULL,
    "generatedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "documentJson"    TEXT NOT NULL DEFAULT '{}',
    "scoreJson"       TEXT NOT NULL DEFAULT '{}',
    "variantsJson"    TEXT NOT NULL DEFAULT '{}',
    "reviewPlanJson"  TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX "TemplateAdvisory_templateId_idx" ON "TemplateAdvisory"("templateId");
CREATE INDEX "TemplateAdvisory_officeId_idx" ON "TemplateAdvisory"("officeId");
