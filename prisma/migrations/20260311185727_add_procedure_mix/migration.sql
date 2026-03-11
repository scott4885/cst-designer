-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BlockType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "minimumAmount" REAL NOT NULL DEFAULT 0,
    "appliesToRole" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 30,
    "durationMax" INTEGER NOT NULL DEFAULT 30,
    "color" TEXT NOT NULL DEFAULT '#666',
    "isHygieneType" BOOLEAN NOT NULL DEFAULT false,
    "dTimeMin" INTEGER NOT NULL DEFAULT 0,
    "aTimeMin" INTEGER NOT NULL DEFAULT 0,
    "procedureCategory" TEXT NOT NULL DEFAULT 'BASIC_RESTORATIVE',
    CONSTRAINT "BlockType_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BlockType" ("aTimeMin", "appliesToRole", "color", "dTimeMin", "description", "durationMax", "durationMin", "id", "isHygieneType", "label", "minimumAmount", "officeId") SELECT "aTimeMin", "appliesToRole", "color", "dTimeMin", "description", "durationMax", "durationMin", "id", "isHygieneType", "label", "minimumAmount", "officeId" FROM "BlockType";
DROP TABLE "BlockType";
ALTER TABLE "new_BlockType" RENAME TO "BlockType";
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
    "rotationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rotationWeeks" INTEGER NOT NULL DEFAULT 2,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Office" ("alternateWeekEnabled", "createdAt", "dpmsSystem", "feeModel", "id", "name", "operatories", "schedulingRules", "timeIncrement", "updatedAt", "workingDays") SELECT "alternateWeekEnabled", "createdAt", "dpmsSystem", "feeModel", "id", "name", "operatories", "schedulingRules", "timeIncrement", "updatedAt", "workingDays" FROM "Office";
DROP TABLE "Office";
ALTER TABLE "new_Office" RENAME TO "Office";
CREATE TABLE "new_Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "operatories" TEXT NOT NULL DEFAULT '[]',
    "columns" INTEGER NOT NULL DEFAULT 1,
    "workingStart" TEXT NOT NULL DEFAULT '07:00',
    "workingEnd" TEXT NOT NULL DEFAULT '16:00',
    "lunchStart" TEXT NOT NULL DEFAULT '12:00',
    "lunchEnd" TEXT NOT NULL DEFAULT '13:00',
    "lunchEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyGoal" REAL NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#666',
    "seesNewPatients" BOOLEAN NOT NULL DEFAULT true,
    "staggerOffsetMin" INTEGER NOT NULL DEFAULT 0,
    "providerSchedule" TEXT NOT NULL DEFAULT '{}',
    "currentProcedureMix" TEXT NOT NULL DEFAULT '{}',
    "futureProcedureMix" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "Provider_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Provider" ("color", "columns", "dailyGoal", "id", "lunchEnabled", "lunchEnd", "lunchStart", "name", "officeId", "operatories", "providerSchedule", "role", "seesNewPatients", "staggerOffsetMin", "workingEnd", "workingStart") SELECT "color", "columns", "dailyGoal", "id", "lunchEnabled", "lunchEnd", "lunchStart", "name", "officeId", "operatories", "providerSchedule", "role", "seesNewPatients", "staggerOffsetMin", "workingEnd", "workingStart" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
