/**
 * audit – zentrales Audit-Logging
 *
 * Pflichtaufruf für:
 * - Jeden SuAd-Zugriff auf Kind-E-Mails
 * - Jede Änderung an Rechteprofilen und Zuweisungen
 * - Moderation von Chat-Nachrichten
 */

import { prisma } from '../db/client';

export type AuditAction =
  | 'VIEW_CHILD_EMAIL'
  | 'CREATE_PERMISSION_PROFILE'
  | 'UPDATE_PERMISSION_PROFILE'
  | 'DELETE_PERMISSION_PROFILE'
  | 'ASSIGN_PERMISSION_PROFILE'
  | 'REVOKE_PERMISSION_PROFILE'
  | 'DELETE_CHAT_MESSAGE'
  | 'USE_REGISTRATION_CODE'
  | 'CREATE_SUAD';

export async function auditLog(
  action: AuditAction,
  actorId: string | null,
  targetId: string | null,
  targetType: string | null,
  meta?: Record<string, unknown>
): Promise<void> {
  await prisma.auditLog.create({
    data: {
      action,
      actorId: actorId ?? undefined,
      targetId: targetId ?? undefined,
      targetType,
      meta: meta ? JSON.stringify(meta) : undefined,
    },
  });
}
