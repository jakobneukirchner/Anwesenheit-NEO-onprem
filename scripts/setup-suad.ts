/**
 * setup-suad.ts – SuAd-Konto anlegen
 *
 * Führe dieses Skript einmalig nach der Installation aus:
 *   npx ts-node scripts/setup-suad.ts
 *
 * Das Skript verweigert die Ausführung, wenn bereits ein SuAd-Account existiert.
 */

import readline from 'readline';
import bcrypt from 'bcrypt';
import { prisma } from '../src/db/client';

async function main() {
  const existing = await prisma.user.findFirst({ where: { role: 'suad' } });
  if (existing) {
    console.error('Es existiert bereits ein SuAd-Account. Abbruch.');
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  const name = await ask('SuAd-Name: ');
  const password = await ask('SuAd-Passwort (wird gehasht gespeichert): ');
  rl.close();

  const passwordHash = await bcrypt.hash(password, 12);

  const suad = await prisma.user.create({
    data: { name, passwordHash, role: 'suad', isActive: true },
  });

  console.log(`SuAd-Account "${suad.name}" (ID: ${suad.id}) wurde angelegt.`);
  console.log('Zugriff über: /internal/suad');
}

main().catch(console.error).finally(() => prisma.$disconnect());
