-- CreateTable
CREATE TABLE "TreatmentSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "stepsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    "rotationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "rotationWeeks" INTEGER NOT NULL DEFAULT 2,
    "schedulingWindows" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Office" ("alternateWeekEnabled", "createdAt", "dpmsSystem", "feeModel", "id", "name", "operatories", "rotationEnabled", "rotationWeeks", "schedulingRules", "timeIncrement", "updatedAt", "workingDays") SELECT "alternateWeekEnabled", "createdAt", "dpmsSystem", "feeModel", "id", "name", "operatories", "rotationEnabled", "rotationWeeks", "schedulingRules", "timeIncrement", "updatedAt", "workingDays" FROM "Office";
DROP TABLE "Office";
ALTER TABLE "new_Office" RENAME TO "Office";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
