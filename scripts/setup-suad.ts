/**
 * setup-suad.ts – Erstinstallation / SuAd-Bootstrap.
 *
 * Führt aus:
 *   1. Seeding des Rechtekatalogs und der Standardeinstellungen
 *   2. Anlegen des ersten SuAd-Accounts (falls noch keiner existiert)
 *   3. Setzen des unveränderlichen Sonderkennworts (für spätere SuAd-Keys)
 *   4. Einmalige Anzeige des Recovery-Keys (für Backup-Entschlüsselung)
 *
 * Aufruf (interaktiv):
 *   npm run setup
 *
 * Aufruf (nicht-interaktiv, z. B. CI / automatisiert) über Umgebungsvariablen:
 *   SETUP_SUAD_NAME=... SETUP_SUAD_PASSWORD=... SETUP_SUAD_SPECIAL_PASSWORD=... npm run setup
 *
 * Das Skript verweigert die SuAd-Erstellung, wenn bereits ein SuAd existiert,
 * seedet aber weiterhin Rechtekatalog/Einstellungen.
 */

import readline from 'readline';
import bcrypt from 'bcrypt';
import { prisma } from '../src/db/client';
import { seed } from './seed';
import { generateRecoveryKey, hashRecoveryKey } from '../src/utils/crypto';

function askInteractive(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<string>((resolve) => {
    if (hidden) {
      const stdout = process.stdout as NodeJS.WriteStream & { _writeToOutput?: (s: string) => void };
      const orig = stdout.write.bind(stdout);
      // Passworteingabe maskieren
      (stdout as unknown as { write: (s: string) => boolean }).write = (chunk: string) => {
        if (chunk.includes('\n')) return orig(chunk);
        return true;
      };
      rl.question(question, (answer) => {
        (stdout as unknown as { write: typeof orig }).write = orig;
        process.stdout.write('\n');
        rl.close();
        resolve(answer);
      });
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function getValue(envKey: string, prompt: string, hidden = false): Promise<string> {
  const fromEnv = process.env[envKey];
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  if (!process.stdin.isTTY) {
    throw new Error(`${envKey} muss in nicht-interaktiven Umgebungen gesetzt sein.`);
  }
  return (await askInteractive(prompt, hidden)).trim();
}

async function main(): Promise<void> {
  // 1) Stammdaten seeden (immer, idempotent)
  await seed();

  // 2) Prüfen, ob bereits ein SuAd existiert
  const existing = await prisma.user.findFirst({ where: { role: 'suad' } });
  if (existing) {
    console.log('Es existiert bereits ein SuAd-Account. Bootstrap wird übersprungen.');
    return;
  }

  console.log('\n=== SuAd-Erstinstallation ===');
  const name = await getValue('SETUP_SUAD_NAME', 'SuAd-Anzeigename: ');
  const password = await getValue('SETUP_SUAD_PASSWORD', 'SuAd-Passwort (min. 8 Zeichen): ', true);
  if (password.length < 8) throw new Error('Passwort zu kurz (min. 8 Zeichen).');
  const specialPassword = await getValue(
    'SETUP_SUAD_SPECIAL_PASSWORD',
    'Unveränderliches Sonderkennwort (für spätere SuAd-Keys, min. 8 Zeichen): ',
    true,
  );
  if (specialPassword.length < 8) throw new Error('Sonderkennwort zu kurz (min. 8 Zeichen).');

  const recoveryKey = generateRecoveryKey();
  const passwordHash = await bcrypt.hash(password, 12);
  const specialHash = await bcrypt.hash(specialPassword, 12);

  const suad = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: { name, passwordHash, role: 'suad', isActive: true },
    });
    await tx.systemSecret.upsert({
      where: { type: 'suad_special_hash' },
      update: { valueHash: specialHash },
      create: { type: 'suad_special_hash', valueHash: specialHash },
    });
    await tx.systemSecret.upsert({
      where: { type: 'recovery_hash' },
      update: { valueHash: hashRecoveryKey(recoveryKey) },
      create: { type: 'recovery_hash', valueHash: hashRecoveryKey(recoveryKey) },
    });
    return created;
  });

  console.log(`\nSuAd-Account "${suad.name}" (ID: ${suad.id}) wurde angelegt.`);
  console.log('Login über die normale Anmeldemaske. Der interne Bereich ist über die Navigation erreichbar.');
  console.log('\n================= RECOVERY-KEY (EINMALIG!) =================');
  console.log(recoveryKey);
  console.log('===========================================================');
  console.log('Bewahre diesen Recovery-Key sicher auf. Er wird zur Entschlüsselung');
  console.log('der nächtlichen Backups benötigt und NICHT erneut angezeigt.\n');
}

main()
  .catch((err) => {
    console.error('[setup] Fehler:', err.message ?? err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
