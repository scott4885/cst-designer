-- CreateTable
CREATE TABLE "Office" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "dpmsSystem" TEXT NOT NULL DEFAULT 'OPEN_DENTAL',
    "workingDays" TEXT NOT NULL DEFAULT '[]',
    "timeIncrement" INTEGER NOT NULL DEFAULT 10,
    "feeModel" TEXT NOT NULL DEFAULT 'UCR',
    "operatories" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Provider" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "operatories" TEXT NOT NULL DEFAULT '[]',
    "columns" INTEGER NOT NULL DEFAULT 1,
    "workingStart" TEXT NOT NULL DEFAULT '07:00',
    "workingEnd" TEXT NOT NULL DEFAULT '18:00',
    "lunchStart" TEXT NOT NULL DEFAULT '13:00',
    "lunchEnd" TEXT NOT NULL DEFAULT '14:00',
    "dailyGoal" REAL NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#666',
    "seesNewPatients" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "Provider_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BlockType" (
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
    CONSTRAINT "BlockType_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "npModel" TEXT NOT NULL DEFAULT 'DOCTOR_ONLY',
    "npBlocksPerDay" INTEGER NOT NULL DEFAULT 2,
    "srpBlocksPerDay" INTEGER NOT NULL DEFAULT 2,
    "hpPlacement" TEXT NOT NULL DEFAULT 'MORNING',
    "doubleBooking" BOOLEAN NOT NULL DEFAULT false,
    "matrixing" BOOLEAN NOT NULL DEFAULT true,
    "emergencyHandling" TEXT NOT NULL DEFAULT 'ACCESS_BLOCKS',
    CONSTRAINT "ScheduleRule_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduleTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "officeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "slotsJson" TEXT NOT NULL DEFAULT '[]',
    "summaryJson" TEXT NOT NULL DEFAULT '[]',
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduleTemplate_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ScheduleRule_officeId_key" ON "ScheduleRule"("officeId");
