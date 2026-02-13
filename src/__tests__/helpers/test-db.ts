/**
 * Test Database Helpers
 * Sets up and tears down test database for integration tests
 */
import { PrismaClient } from '@prisma/client';

// Use a separate test database
const testDbUrl = 'file:./prisma/test.db';

export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: testDbUrl,
    },
  },
});

/**
 * Clear all data from test database
 */
export async function clearTestDatabase() {
  await testPrisma.timeSlot.deleteMany();
  await testPrisma.daySchedule.deleteMany();
  await testPrisma.scheduleTemplate.deleteMany();
  await testPrisma.scheduleRule.deleteMany();
  await testPrisma.rampUpGoal.deleteMany();
  await testPrisma.blockType.deleteMany();
  await testPrisma.procedure.deleteMany();
  await testPrisma.provider.deleteMany();
  await testPrisma.office.deleteMany();
}

/**
 * Close test database connection
 */
export async function closeTestDatabase() {
  await testPrisma.$disconnect();
}
