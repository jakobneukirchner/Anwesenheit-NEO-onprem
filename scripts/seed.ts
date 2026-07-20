/**
 * seed.ts – Idempotentes Seeding von Stammdaten.
 *
 * Seedet:
 *   - Rechtekatalog (permissions-Tabelle) aus PERMISSION_CATALOG
 *   - Globale Standardeinstellungen (global_settings)
 *
 * Aufruf:  npm run seed
 * Wird außerdem automatisch von scripts/setup-suad.ts ausgeführt.
 */

import { prisma } from '../src/db/client';
import { PERMISSION_CATALOG } from '../src/utils/permissionCatalog';

const DEFAULT_SETTINGS: Record<string, string> = {
  appName: 'Anwesenheit NEO',
  primaryColor: '#2f6b4f',
  themeMode: 'system',
  maxParentAccountsPerChild: '2',
  maxChildrenPerParent: '10',
};

export async function seed(): Promise<void> {
  // 1) Rechtekatalog
  for (const [key, description] of Object.entries(PERMISSION_CATALOG)) {
    await prisma.permission.upsert({
      where: { key },
      update: { description },
      create: { key, description },
    });
  }

  // 2) Standard-Einstellungen (nur anlegen, vorhandene Werte nicht überschreiben)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.globalSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }

  console.log(
    `[seed] ${Object.keys(PERMISSION_CATALOG).length} Rechte und ` +
      `${Object.keys(DEFAULT_SETTINGS).length} Standardeinstellungen gesetzt.`,
  );
}

// Direktaufruf (npm run seed)
if (require.main === module) {
  seed()
    .catch((err) => {
      console.error('[seed] Fehler:', err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
