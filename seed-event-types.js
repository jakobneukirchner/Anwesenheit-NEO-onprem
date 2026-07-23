const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const defaults = [
    { name: 'training', icon: 'fitness_center', color: '#4caf50', sortOrder: 10 },
    { name: 'match', icon: 'sports_soccer', color: '#f44336', sortOrder: 20 },
    { name: 'event', icon: 'celebration', color: '#ff9800', sortOrder: 30 },
    { name: 'other', icon: 'event', color: '#9e9e9e', sortOrder: 40 },
  ];

  for (const t of defaults) {
    await prisma.eventType.upsert({
      where: { name: t.name },
      update: {},
      create: t,
    });
  }
  console.log('Event types seeded.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
