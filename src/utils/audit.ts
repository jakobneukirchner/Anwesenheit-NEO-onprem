/**
 * audit – zentrales Audit-Logging
 *
 * Pflichtaufruf für:
 * - Jeden SuAd-Zugriff auf Kind-E-Mails
 * - Jede Änderung an Rechteprofilen und Zuweisungen
 * - Moderation von Chat-Nachrichten
 * - Branding-Änderungen, SuAd-Key-Ausstellung/-Einlösung, Badge-Vergabe
 *
 * meta wird AES-256-GCM-verschlüsselt in metaEnc gespeichert.
 */

import { prisma } from '../db/client';
import { packField, unpackField } from './crypto';

export type AuditAction =
  | 'VIEW_CHILD_EMAIL'
  | 'CREATE_USER'
  | 'UPDATE_USER'
  | 'DELETE_USER'
  | 'CREATE_PERMISSION_PROFILE'
  | 'UPDATE_PERMISSION_PROFILE'
  | 'DELETE_PERMISSION_PROFILE'
  | 'ASSIGN_PERMISSION_PROFILE'
  | 'UNASSIGN_PERMISSION_PROFILE'
  | 'REVOKE_PERMISSION_PROFILE'
  | 'UPDATE_GROUP_PERMISSIONS'
  | 'UPDATE_USER_PERMISSIONS'
  | 'DELETE_CHAT_MESSAGE'
  | 'CREATE_REGISTRATION_CODE'
  | 'USE_REGISTRATION_CODE'
  | 'UPDATE_BRANDING'
  | 'UPDATE_SETTINGS'
  | 'CREATE_SUAD'
  | 'ISSUE_SUAD_KEY'
  | 'ACTIVATE_SUAD'
  | 'ASSIGN_BADGE'
  | 'UPDATE_SELF_PROFILE';

export async function auditLog(
  action: AuditAction,
  actorId: string | null,
  targetId: string | null,
  targetType: string | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  const metaEnc = meta ? await packField(JSON.stringify(meta)) : null;
  await prisma.auditLog.create({
    data: {
      action,
      actorId: actorId ?? undefined,
      targetId: targetId ?? undefined,
      targetType,
      metaEnc,
    },
  });
}

/** Entschlüsselt das meta-Feld eines Audit-Log-Eintrags. */
export async function decryptAuditMeta(
  metaEnc: string | null,
): Promise<Record<string, unknown> | null> {
  const raw = await unpackField(metaEnc);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
