/**
 * Cronjob: Nächtliches Datenbank-Backup.
 * SQLite: Datei kopieren + gzip.
 * PostgreSQL: pg_dump.
 */

import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createGzip } from 'zlib';

export function startNightlyBackupJob(): void {
  const schedule = process.env.BACKUP_CRON ?? '0 2 * * *';
  const backupDir = process.env.BACKUP_DIR ?? './backups';
  const dbUrl = process.env.DATABASE_URL ?? '';
  const isPostgres = dbUrl.startsWith('postgresql');

  cron.schedule(schedule, async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    try {
      if (isPostgres) {
        const outFile = path.join(backupDir, `backup-${timestamp}.sql.gz`);
        execSync(`pg_dump "${dbUrl}" | gzip > "${outFile}"`);
        console.log(`[backup] PostgreSQL-Backup: ${outFile}`);
      } else {
        // SQLite – Dateiname aus URL extrahieren
        const dbPath = dbUrl.replace('file:', '');
        const outFile = path.join(backupDir, `backup-${timestamp}.db.gz`);
        await new Promise<void>((resolve, reject) => {
          const inp = fs.createReadStream(dbPath);
          const out = fs.createWriteStream(outFile);
          const gz  = createGzip();
          inp.pipe(gz).pipe(out);
          out.on('finish', resolve);
          out.on('error', reject);
        });
        console.log(`[backup] SQLite-Backup: ${outFile}`);
      }

      // Retention: Backups älter als 30 Tage löschen
      const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      for (const file of fs.readdirSync(backupDir)) {
        const filePath = path.join(backupDir, file);
        if (fs.statSync(filePath).mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (err) {
      console.error('[backup] Fehler:', err);
    }
  });

  console.log(`[cron] nightlyBackup gestartet (${schedule})`);
}
