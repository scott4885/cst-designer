-- Sprint 3: Per-practice procedure length overrides (PRD-V4 FR-6).
--
-- When a row exists for (officeId, blockTypeId), its x-segment values shadow
-- the base BlockType row at generation time. Nullable fields mean "no override
-- for this segment — fall through to the base BlockType value". The generator
-- merges overrides once per generation at the top of its main entry, so there
-- is no per-block DB read on the hot path.

CREATE TABLE "ProcedureOverride" (
    "id"          TEXT NOT NULL PRIMARY KEY,
    "officeId"    TEXT NOT NULL,
    "blockTypeId" TEXT NOT NULL,
    "asstPreMin"  INTEGER,
    "doctorMin"   INTEGER,
    "asstPostMin" INTEGER,
    "createdAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ProcedureOverride_officeId_blockTypeId_key"
    ON "ProcedureOverride"("officeId", "blockTypeId");
