-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScheduleTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "weekType" TEXT NOT NULL DEFAULT 'A',
    "type" TEXT NOT NULL DEFAULT 'WORKING',
    "slotsJson" TEXT NOT NULL DEFAULT '[]',
    "summaryJson" TEXT NOT NULL DEFAULT '[]',
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleTemplate_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScheduleTemplate" ("createdAt", "dayOfWeek", "id", "isActive", "name", "officeId", "slotsJson", "summaryJson", "updatedAt", "warningsJson", "weekType") SELECT "createdAt", "dayOfWeek", "id", "isActive", "name", "officeId", "slotsJson", "summaryJson", "updatedAt", "warningsJson", "weekType" FROM "ScheduleTemplate";
DROP TABLE "ScheduleTemplate";
ALTER TABLE "new_ScheduleTemplate" RENAME TO "ScheduleTemplate";
CREATE UNIQUE INDEX "ScheduleTemplate_officeId_dayOfWeek_weekType_type_key" ON "ScheduleTemplate"("officeId", "dayOfWeek", "weekType", "type");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
