-- Sprint 6 — Prior template upload + advisory LLM rewrite + chosen variant
--
-- Adds:
--   • PriorTemplate table (Epic P) — read-only reference, never feeds generator.
--   • AdvisoryRewriteCache table (Epic Q) — hash-keyed rewrite cache (30d TTL).
--   • TemplateAdvisory columns (Epic Q + R):
--       documentRewriteJson, rewriteState, rewriteGeneratedAt
--       chosenVariant, chosenVariantAt, chosenVariantHistoryJson
--
-- No data is lost, no breaking changes. All new columns are nullable or
-- have defaults. See SPRINT-6-PLAN §4.2 + §6.1.

-- --- Epic P: PriorTemplate --------------------------------------------------
CREATE TABLE "PriorTemplate" (
    "id"           TEXT NOT NULL PRIMARY KEY,
    "officeId"     TEXT NOT NULL,
    "uploadedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "filename"     TEXT NOT NULL,
    "fileHash"     TEXT NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "parseStatus"  TEXT NOT NULL DEFAULT 'OK',
    "blockCount"   INTEGER NOT NULL DEFAULT 0,
    "matchedCount" INTEGER NOT NULL DEFAULT 0,
    "blocksJson"   TEXT NOT NULL DEFAULT '[]',
    "rawText"      TEXT,
    "supersededBy" TEXT,
    CONSTRAINT "PriorTemplate_officeId_fkey"
      FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PriorTemplate_officeId_idx" ON "PriorTemplate"("officeId");
CREATE INDEX "PriorTemplate_officeId_uploadedAt_idx" ON "PriorTemplate"("officeId", "uploadedAt");

-- --- Epic Q: AdvisoryRewriteCache -------------------------------------------
CREATE TABLE "AdvisoryRewriteCache" (
    "id"                  TEXT NOT NULL PRIMARY KEY,
    "hash"                TEXT NOT NULL UNIQUE,
    "rewrite"             TEXT NOT NULL,
    "createdAt"           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "systemPromptVersion" TEXT NOT NULL DEFAULT '1'
);

CREATE UNIQUE INDEX "AdvisoryRewriteCache_hash_key" ON "AdvisoryRewriteCache"("hash");
CREATE INDEX "AdvisoryRewriteCache_createdAt_idx" ON "AdvisoryRewriteCache"("createdAt");

-- --- Epic Q + R: TemplateAdvisory extension ---------------------------------
ALTER TABLE "TemplateAdvisory" ADD COLUMN "documentRewriteJson" TEXT;
ALTER TABLE "TemplateAdvisory" ADD COLUMN "rewriteState" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "TemplateAdvisory" ADD COLUMN "rewriteGeneratedAt" DATETIME;
ALTER TABLE "TemplateAdvisory" ADD COLUMN "chosenVariant" TEXT;
ALTER TABLE "TemplateAdvisory" ADD COLUMN "chosenVariantAt" DATETIME;
ALTER TABLE "TemplateAdvisory" ADD COLUMN "chosenVariantHistoryJson" TEXT NOT NULL DEFAULT '[]';

CREATE INDEX "TemplateAdvisory_chosenVariant_idx" ON "TemplateAdvisory"("chosenVariant");
