/**
 * crypto.ts – AES-256-GCM Verschlüsselungs-Utilities
 *
 * Enthält:
 *  - encryptField / decryptField  – Feldinhalte (HKDF-abgeleiteter Key)
 *  - encryptFile / decryptFile    – Backup-Dateien (ENCRYPTION_KEY direkt)
 *  - generateRecoveryKey / hashRecoveryKey / verifyRecoveryKey
 *  - generateSuAdKey / hashSuAdKey
 */

import crypto from 'crypto';
import { promisify } from 'util';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------

const CURRENT_KEY_VERSION = 1;
const GCM_IV_LENGTH       = 12; // Bytes
const GCM_TAG_LENGTH      = 16; // Bytes
const KEY_LENGTH          = 32; // Bytes (256 Bit)

// ---------------------------------------------------------------------------
// Master-Key aus ENV
// ---------------------------------------------------------------------------

function getMasterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? '';
  if (!raw || raw.length < 64) {
    throw new Error(
      '[crypto] ENCRYPTION_KEY fehlt oder ist zu kurz (mind. 64 Hex-Zeichen = 32 Byte).'
    );
  }
  return Buffer.from(raw.slice(0, 64), 'hex');
}

// ---------------------------------------------------------------------------
// HKDF-Ableitung für Feldinhalte
// ---------------------------------------------------------------------------

const hkdf = promisify(crypto.hkdf);

async function deriveFieldKey(keyVersion: number): Promise<Buffer> {
  const master = getMasterKey();
  const info   = Buffer.from(`anwesenheit-neo-field-v${keyVersion}`);
  const salt   = Buffer.alloc(32, 0); // deterministisch; Master liefert Entropie
  const derived = await hkdf('sha256', master, salt, info, KEY_LENGTH);
  return Buffer.from(derived);
}

// ---------------------------------------------------------------------------
// Feldinhalte verschlüsseln / entschlüsseln
// ---------------------------------------------------------------------------

export interface EncryptedField {
  ciphertext: string; // hex
  iv:         string; // hex
  tag:        string; // hex
  keyVersion: number;
}

/**
 * Verschlüsselt einen String-Wert mit AES-256-GCM.
 * Das Rückgabeobjekt wird als JSON in der DB-Spalte (*Enc) gespeichert.
 */
export async function encryptField(plaintext: string): Promise<EncryptedField> {
  const key    = await deriveFieldKey(CURRENT_KEY_VERSION);
  const iv     = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('hex'),
    iv:         iv.toString('hex'),
    tag:        tag.toString('hex'),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

/**
 * Entschlüsselt ein zuvor mit encryptField() erzeugtes Objekt.
 */
export async function decryptField(field: EncryptedField): Promise<string> {
  const key     = await deriveFieldKey(field.keyVersion);
  const iv      = Buffer.from(field.iv,         'hex');
  const tag     = Buffer.from(field.tag,        'hex');
  const ct      = Buffer.from(field.ciphertext, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** null-sicher verschlüsseln */
export async function encryptFieldOrNull(
  value: string | null | undefined,
): Promise<EncryptedField | null> {
  if (value == null) return null;
  return encryptField(value);
}

/** null-sicher entschlüsseln */
export async function decryptFieldOrNull(
  field: EncryptedField | null | undefined,
): Promise<string | null> {
  if (field == null) return null;
  return decryptField(field);
}

// ---------------------------------------------------------------------------
// DB-Hilfsfunktionen: JSON-verpacktes EncryptedField ↔ Klartext
// Die *Enc-Spalten im Prisma-Schema speichern das JSON dieser Struktur.
// ---------------------------------------------------------------------------

/** Verschlüsselt einen (optionalen) Wert und liefert den JSON-String für die *Enc-Spalte. */
export async function packField(
  value: string | null | undefined,
): Promise<string | null> {
  if (value == null || value === '') return null;
  const field = await encryptField(value);
  return JSON.stringify(field);
}

/** Entschlüsselt den JSON-String einer *Enc-Spalte zurück in Klartext. */
export async function unpackField(
  packed: string | null | undefined,
): Promise<string | null> {
  if (packed == null || packed === '') return null;
  try {
    const field = JSON.parse(packed) as EncryptedField;
    return await decryptField(field);
  } catch {
    // Nicht entschlüsselbar (z.B. korrupter Datensatz) → null statt Absturz
    return null;
  }
}

// ---------------------------------------------------------------------------
// Backup-Verschlüsselung / -Entschlüsselung
// ---------------------------------------------------------------------------

/**
 * Binär-Format der verschlüsselten Backup-Datei:
 *  [ 4 Byte keyVersion (UInt32BE) ][ 12 Byte IV ][ 16 Byte Auth-Tag ][ Ciphertext ]
 */

function getBackupKey(recoveryKey?: string): Buffer {
  if (recoveryKey) {
    const buf = Buffer.from(recoveryKey, 'hex');
    if (buf.length !== KEY_LENGTH) {
      throw new Error('[crypto] Recovery-Key muss 64-stelliger Hex-String (32 Byte) sein.');
    }
    return buf;
  }
  return getMasterKey();
}

/**
 * Verschlüsselt inFile und schreibt das Ergebnis nach outFile.
 * Ohne recoveryKey wird ENCRYPTION_KEY aus der ENV verwendet.
 */
export function encryptFile(
  inFile:       string,
  outFile:      string,
  recoveryKey?: string,
): void {
  const key       = getBackupKey(recoveryKey);
  const iv        = crypto.randomBytes(GCM_IV_LENGTH);
  const plaintext = fs.readFileSync(inFile);

  const cipher  = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct1     = cipher.update(plaintext);
  const ct2     = cipher.final();
  const tag     = cipher.getAuthTag();

  const header = Buffer.alloc(4);
  header.writeUInt32BE(CURRENT_KEY_VERSION, 0);

  fs.writeFileSync(outFile, Buffer.concat([header, iv, tag, ct1, ct2]));
}

/**
 * Entschlüsselt eine mit encryptFile() erzeugte Datei.
 * recoveryKey muss als 64-stelliger Hex-String übergeben werden.
 */
export function decryptFile(
  inFile:      string,
  outFile:     string,
  recoveryKey: string,
): void {
  const data       = fs.readFileSync(inFile);
  const iv         = data.slice(4,  4  + GCM_IV_LENGTH);
  const tag        = data.slice(16, 16 + GCM_TAG_LENGTH);
  const ciphertext = data.slice(32);

  const key      = getBackupKey(recoveryKey);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  fs.writeFileSync(outFile, Buffer.concat([decipher.update(ciphertext), decipher.final()]));
}

// ---------------------------------------------------------------------------
// Recovery-Key
// ---------------------------------------------------------------------------

/** Generiert einen neuen 32-Byte Recovery-Key als 64-stelligen Hex-String. */
export function generateRecoveryKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/** SHA-256-Hash des Recovery-Keys zur Verifikation in der DB. */
export function hashRecoveryKey(recoveryKey: string): string {
  return crypto.createHash('sha256').update(recoveryKey, 'hex').digest('hex');
}

/** Prüft timing-sicher, ob recoveryKey mit dem gespeicherten Hash übereinstimmt. */
export function verifyRecoveryKey(recoveryKey: string, storedHash: string): boolean {
  const computed = hashRecoveryKey(recoveryKey);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed,   'hex'),
      Buffer.from(storedHash, 'hex'),
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// SuAd-Key
// ---------------------------------------------------------------------------

/**
 * Format: XXXX-XXXX-XXXX-XXXX  (je 4 Zeichen, kein O/I/0/1)
 * Gültigkeitsdauer: 12 Stunden (wird extern in DB gespeichert).
 */
export function generateSuAdKey(): string {
  const chars   = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segment = (): string =>
    Array.from({ length: 4 }, () => chars[crypto.randomInt(0, chars.length)]).join('');
  return `${segment()}-${segment()}-${segment()}-${segment()}`;
}

/** SHA-256-Hash eines SuAd-Keys zur sicheren Speicherung in der DB. */
export function hashSuAdKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}
