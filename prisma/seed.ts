/**
 * Database Seed Script
 * Populates the database with all 5 mock offices
 */
import { PrismaClient } from '@prisma/client';
import { mockOffices } from '../src/lib/mock-data';

const prisma = new PrismaClient({
  log: ['error'],
});

async function main() {
  console.log('🌱 Seeding database...');

  // Clear existing data
  await prisma.timeSlot.deleteMany();
  await prisma.daySchedule.deleteMany();
  await prisma.scheduleTemplate.deleteMany();
  await prisma.scheduleRule.deleteMany();
  await prisma.rampUpGoal.deleteMany();
  await prisma.blockType.deleteMany();
  await prisma.procedure.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.office.deleteMany();

  console.log('🗑️  Cleared existing data');

  // Seed each office with its full data
  for (const officeData of mockOffices) {
    console.log(`📍 Seeding office: ${officeData.name}`);

    const office = await prisma.office.create({
      data: {
        id: officeData.id,
        name: officeData.name,
        dpmsSystem: officeData.dpmsSystem,
        workingDays: JSON.stringify(officeData.workingDays),
        timeIncrement: officeData.timeIncrement,
        feeModel: officeData.feeModel,
      },
    });

    // Create providers
    if (officeData.providers) {
      for (const provider of officeData.providers) {
        await prisma.provider.create({
          data: {
            id: provider.id,
            officeId: office.id,
            name: provider.name,
            providerId: provider.id,
            role: provider.role,
            operatories: JSON.stringify(provider.operatories),
            workingDays: JSON.stringify(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY']),
            workingStart: provider.workingStart,
            workingEnd: provider.workingEnd,
            lunchStart: provider.lunchStart,
            lunchEnd: provider.lunchEnd,
            dailyGoal: provider.dailyGoal,
            color: provider.color,
          },
        });
      }
      console.log(`  ✅ Created ${officeData.providers.length} providers`);
    }

    // Create block types
    if (officeData.blockTypes) {
      for (const blockType of officeData.blockTypes) {
        // Map 'BOTH' to 'DOCTOR' for simplicity in seed
        const role = blockType.appliesToRole === 'BOTH' ? 'DOCTOR' : blockType.appliesToRole;
        await prisma.blockType.create({
          data: {
            id: blockType.id,
            officeId: office.id,
            label: blockType.label,
            description: blockType.description,
            minimumAmount: blockType.minimumAmount,
            appliesToRole: role,
            durationMin: blockType.durationMin,
            durationMax: blockType.durationMax,
          },
        });
      }
      console.log(`  ✅ Created ${officeData.blockTypes.length} block types`);
    }

    // Create schedule rules
    if (officeData.rules) {
      const ruleTypes = [
        { type: 'NP_MODEL', value: { model: officeData.rules.npModel, blocksPerDay: officeData.rules.npBlocksPerDay } },
        { type: 'HP_PLACEMENT', value: { placement: officeData.rules.hpPlacement } },
        { type: 'DOUBLE_BOOKING', value: { enabled: officeData.rules.doubleBooking } },
        { type: 'MATRIXING', value: { enabled: officeData.rules.matrixing } },
        { type: 'EMERGENCY_HANDLING', value: { strategy: officeData.rules.emergencyHandling } },
        { type: 'SRP_PLACEMENT', value: { blocksPerDay: officeData.rules.srpBlocksPerDay } },
      ];

      for (const rule of ruleTypes) {
        await prisma.scheduleRule.create({
          data: {
            officeId: office.id,
            ruleType: rule.type,
            ruleValue: JSON.stringify(rule.value),
          },
        });
      }
      console.log(`  ✅ Created ${ruleTypes.length} schedule rules`);
    }

    console.log(`✨ Completed seeding: ${officeData.name}\n`);
  }

  console.log('🎉 Database seeded successfully!');
  console.log(`📊 Summary:`);
  console.log(`   - Offices: ${await prisma.office.count()}`);
  console.log(`   - Providers: ${await prisma.provider.count()}`);
  console.log(`   - Block Types: ${await prisma.blockType.count()}`);
  console.log(`   - Schedule Rules: ${await prisma.scheduleRule.count()}`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
