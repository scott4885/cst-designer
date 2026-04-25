-- Sprint 8 perf-audit follow-up: add foreign-key indexes that SQLite
-- Prisma does NOT auto-generate. Every `where: { officeId }` query on
-- Provider, BlockType, ScheduleVersion, ProviderAbsence currently runs
-- a full table scan. With small datasets this is invisible; with 100s
-- of providers/blocks per office it matters.
--
-- Provider.officeId
CREATE INDEX "Provider_officeId_idx" ON "Provider"("officeId");

-- BlockType.officeId
CREATE INDEX "BlockType_officeId_idx" ON "BlockType"("officeId");

-- ScheduleVersion.officeId + composite (officeId, dayOfWeek, weekType)
CREATE INDEX "ScheduleVersion_officeId_idx" ON "ScheduleVersion"("officeId");
CREATE INDEX "ScheduleVersion_officeId_dayOfWeek_weekType_idx"
  ON "ScheduleVersion"("officeId", "dayOfWeek", "weekType");

-- ProviderAbsence.providerId + ProviderAbsence.officeId
CREATE INDEX "ProviderAbsence_providerId_idx" ON "ProviderAbsence"("providerId");
CREATE INDEX "ProviderAbsence_officeId_idx" ON "ProviderAbsence"("officeId");
