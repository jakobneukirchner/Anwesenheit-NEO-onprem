/**
 * Cronjob: Nächtliches Datenbank-Backup.
 *
 * Ablauf:
 *   1. SQLite: DB-Datei kopieren · PostgreSQL: pg_dump
 *   2. gzip-Komprimierung (temporäre *.gz)
 *   3. AES-256-GCM-Verschlüsselung (ENCRYPTION_KEY) → *.enc
 *   4. temporäre *.gz löschen
 *
 * Nur mit dem Recovery-Key (bzw. ENCRYPTION_KEY) entschlüsselbar – siehe docs/SECURITY.md.
 */

import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createGzip } from 'zlib';
import { encryptFile } from '../utils/crypto';

function gzipFile(inFile: string, outFile: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const inp = fs.createReadStream(inFile);
    const out = fs.createWriteStream(outFile);
    const gz = createGzip();
    inp.on('error', reject);
    out.on('error', reject);
    out.on('finish', resolve);
    inp.pipe(gz).pipe(out);
  });
}

async function runBackup(backupDir: string, dbUrl: string): Promise<void> {
  const isPostgres = dbUrl.startsWith('postgresql');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  let gzFile: string;
  let encFile: string;

  if (isPostgres) {
    gzFile = path.join(backupDir, `backup-${timestamp}.sql.gz`);
    encFile = path.join(backupDir, `backup-${timestamp}.sql.enc`);
    execSync(`pg_dump "${dbUrl}" | gzip > "${gzFile}"`);
  } else {
    const dbPath = dbUrl.replace('file:', '');
    gzFile = path.join(backupDir, `backup-${timestamp}.db.gz`);
    encFile = path.join(backupDir, `backup-${timestamp}.db.enc`);
    await gzipFile(dbPath, gzFile);
  }

  // Verschlüsseln und temporäre Klartext-.gz entfernen
  encryptFile(gzFile, encFile);
  fs.unlinkSync(gzFile);
  console.log(`[backup] verschlüsseltes Backup erstellt: ${encFile}`);
}

function applyRetention(backupDir: string): void {
  const retentionDays = parseInt(process.env.BACKUP_RETENTION_DAYS ?? '30', 10);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  if (!fs.existsSync(backupDir)) return;
  for (const file of fs.readdirSync(backupDir)) {
    const filePath = path.join(backupDir, file);
    if (fs.statSync(filePath).mtimeMs < cutoff) fs.unlinkSync(filePath);
  }
}

export function startNightlyBackupJob(): void {
  const schedule = process.env.BACKUP_CRON ?? '0 2 * * *';
  const backupDir = process.env.BACKUP_DIR ?? './backups';
  const dbUrl = process.env.DATABASE_URL ?? '';

  cron.schedule(schedule, async () => {
    try {
      await runBackup(backupDir, dbUrl);
      applyRetention(backupDir);
    } catch (err) {
      console.error('[backup] Fehler:', err);
    }
  });

  console.log(`[cron] nightlyBackup gestartet (${schedule})`);
}
