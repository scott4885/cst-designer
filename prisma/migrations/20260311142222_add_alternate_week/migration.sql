-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Office" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "dpmsSystem" TEXT NOT NULL DEFAULT 'OPEN_DENTAL',
    "workingDays" TEXT NOT NULL DEFAULT '[]',
    "timeIncrement" INTEGER NOT NULL DEFAULT 10,
    "feeModel" TEXT NOT NULL DEFAULT 'UCR',
    "operatories" TEXT NOT NULL DEFAULT '[]',
    "schedulingRules" TEXT NOT NULL DEFAULT '',
    "alternateWeekEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Office" ("createdAt", "dpmsSystem", "feeModel", "id", "name", "operatories", "schedulingRules", "timeIncrement", "updatedAt", "workingDays") SELECT "createdAt", "dpmsSystem", "feeModel", "id", "name", "operatories", "schedulingRules", "timeIncrement", "updatedAt", "workingDays" FROM "Office";
DROP TABLE "Office";
ALTER TABLE "new_Office" RENAME TO "Office";
CREATE TABLE "new_ScheduleTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "weekType" TEXT NOT NULL DEFAULT 'A',
    "slotsJson" TEXT NOT NULL DEFAULT '[]',
    "summaryJson" TEXT NOT NULL DEFAULT '[]',
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleTemplate_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ScheduleTemplate" ("createdAt", "dayOfWeek", "id", "isActive", "name", "officeId", "slotsJson", "summaryJson", "updatedAt", "warningsJson") SELECT "createdAt", "dayOfWeek", "id", "isActive", "name", "officeId", "slotsJson", "summaryJson", "updatedAt", "warningsJson" FROM "ScheduleTemplate";
DROP TABLE "ScheduleTemplate";
ALTER TABLE "new_ScheduleTemplate" RENAME TO "ScheduleTemplate";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
