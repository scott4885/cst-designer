-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    CONSTRAINT "Provider_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Provider" ("color", "columns", "dailyGoal", "id", "lunchEnabled", "lunchEnd", "lunchStart", "name", "officeId", "operatories", "role", "seesNewPatients", "staggerOffsetMin", "workingEnd", "workingStart") SELECT "color", "columns", "dailyGoal", "id", "lunchEnabled", "lunchEnd", "lunchStart", "name", "officeId", "operatories", "role", "seesNewPatients", "staggerOffsetMin", "workingEnd", "workingStart" FROM "Provider";
DROP TABLE "Provider";
ALTER TABLE "new_Provider" RENAME TO "Provider";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
