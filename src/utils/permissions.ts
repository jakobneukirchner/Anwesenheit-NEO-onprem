/**
 * resolvePermission – zentrale Rechte-Auflösungsfunktion
 *
 * Priorität (höchste zuerst):
 *   1. Direktes Einzelperson-Recht (user_permissions, permissionKey gesetzt)
 *   2. Rechteprofil auf Einzelperson (user_permissions, profileId gesetzt)
 *   3. Direktes Gruppenrecht (group_permissions, permissionKey gesetzt)
 *   4. Rechteprofil auf Gruppe (group_permissions, profileId gesetzt)
 *   5. Systemstandard aus Rollendefinition
 *   6. false
 */

import { prisma } from '../db/client';
import { ALL_PERMISSION_KEYS } from './permissionCatalog';

/** Baut ein vollständiges Default-Objekt: alle Keys false, gelistete true. */
function defaults(granted: string[]): Record<string, boolean> {
  const base: Record<string, boolean> = {};
  for (const key of ALL_PERMISSION_KEYS) base[key] = false;
  for (const key of granted) base[key] = true;
  return base;
}

// canViewChildEmail wird NIE hier gesetzt – es ist fest an die Rolle suad
// gebunden und wird in resolvePermission gesondert behandelt.

const memberGrants = ['canUseChat', 'childCanSelfWithdraw'];
const parentGrants = ['canUseChat', 'canStartDirectChat', 'canActAsParentForChild'];
const teacherGrants = [
  'canUseChat', 'canStartDirectChat', 'canStartGroupChat',
  'canManageSchedule', 'canManageSubstitutions',
];
const coordinatorGrants = [
  ...teacherGrants, 'canManageUsers', 'canManageGroups',
  'canGenerateRegistrationCodes', 'canManageRegistrationCodeLimits',
  'canManagePermissionProfiles', 'canManageSystemMessages',
  'canViewStatistics', 'canExportReports',
];
// admin: fast alle Rechte außer canViewChildEmail
const adminGrants = ALL_PERMISSION_KEYS.filter((k) => k !== 'canViewChildEmail');
// suad: alle Rechte (canViewChildEmail via Rolle in resolvePermission)
const suadGrants = ALL_PERMISSION_KEYS.filter((k) => k !== 'canViewChildEmail');

// Systemstandards je Rolle
const roleDefaults: Record<string, Record<string, boolean>> = {
  suad: defaults(suadGrants),
  admin: defaults(adminGrants),
  coordinator: defaults(coordinatorGrants),
  teacher: defaults(teacherGrants),
  parent: defaults(parentGrants),
  member: defaults(memberGrants),
};

export async function resolvePermission(
  userId: string,
  permissionKey: string
): Promise<boolean> {
  // canViewChildEmail ist ausschließlich SuAd – kein Override möglich
  if (permissionKey === 'canViewChildEmail') {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    return user?.role === 'suad';
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userPermissions: { include: { profile: { include: { items: true } } } },
      groupMemberships: {
        include: {
          group: {
            include: {
              groupPermissions: { include: { profile: { include: { items: true } } } },
            },
          },
        },
      },
    },
  });

  if (!user) return false;

  // 1. Direktes Einzelperson-Recht
  const directUserPerm = user.userPermissions.find(
    (up) => up.permissionKey === permissionKey
  );
  if (directUserPerm) return directUserPerm.value;

  // 2. Rechteprofil auf Einzelperson
  const userProfilePerm = user.userPermissions
    .filter((up) => up.profileId && up.profile)
    .flatMap((up) => up.profile!.items)
    .find((item) => item.permissionKey === permissionKey);
  if (userProfilePerm) return userProfilePerm.value;

  // 3 & 4. Gruppenebene
  for (const membership of user.groupMemberships) {
    const gPerms = membership.group.groupPermissions;

    // 3. Direktes Gruppenrecht
    const directGroupPerm = gPerms.find(
      (gp) => gp.permissionKey === permissionKey
    );
    if (directGroupPerm) return directGroupPerm.value;

    // 4. Rechteprofil auf Gruppe
    const groupProfilePerm = gPerms
      .filter((gp) => gp.profileId && gp.profile)
      .flatMap((gp) => gp.profile!.items)
      .find((item) => item.permissionKey === permissionKey);
    if (groupProfilePerm) return groupProfilePerm.value;
  }

  // 5. Systemstandard (Rolle)
  return roleDefaults[user.role]?.[permissionKey] ?? false;
}

/** Middleware-Helper: wirft 403 wenn Recht fehlt */
export function requirePermission(permissionKey: string) {
  return async (req: any, res: any, next: any) => {
    const userId: string | undefined = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const allowed = await resolvePermission(userId, permissionKey);
    if (!allowed) return res.status(403).json({ error: 'Forbidden', required: permissionKey });

    next();
  };
}
