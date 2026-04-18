import { PrismaClient } from "@/generated/prisma";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createLocalPrismaClient() {
  const url = process.env.DATABASE_URL || "file:./data/schedules.db";
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

// Local development: singleton Prisma client with better-sqlite3
export const prisma: PrismaClient = globalForPrisma.prisma || createLocalPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
