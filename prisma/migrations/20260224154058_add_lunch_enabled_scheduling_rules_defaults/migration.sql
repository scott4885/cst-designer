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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Office" ("createdAt", "dpmsSystem", "feeModel", "id", "name", "operatories", "timeIncrement", "updatedAt", "workingDays") SELECT "createdAt", "dpmsSystem", "feeModel", "id", "name", "operatories", "timeIncrement", "updatedAt", "workingDays" FROM "Office";
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
    CONSTRAINT "Provider_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Provider" ("color", "columns", "dailyGoal", "id", "lunchEnd", "lunchStart", "name", "officeId", "operatories", "role", "seesNewPatients", "workingEnd", "workingStart") SELECT "color", "columns", "dailyGoal", "id", "lunchEnd", "lunchStart", "name", "officeId", "operatories", "role", "seesNewPatients", "workingEnd", "workingStart" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
