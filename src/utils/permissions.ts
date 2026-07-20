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

// Systemstandards je Rolle
const roleDefaults: Record<string, Record<string, boolean>> = {
  suad: {
    canManageUsers: true,
    canManageGroups: true,
    canManageSchedule: true,
    canManageSettings: true,
    canManageSystemMessages: true,
    canViewSystemTab: true,
    canViewChildEmail: true,
    canGenerateRegistrationCodes: true,
    canActAsParentForChild: true,
    childCanSelfWithdraw: true,
    canManagePermissionProfiles: true,
    canStartDirectChat: true,
    canStartGroupChat: true,
    canUseChat: true,
    canManageSubstitutions: true,
    canViewStatistics: true,
    canExportReports: true,
  },
  admin: {
    canManageUsers: true,
    canManageGroups: true,
    canManageSchedule: true,
    canManageSettings: true,
    canManageSystemMessages: true,
    canViewSystemTab: true,
    canViewChildEmail: false, // Bewusst false, nur SuAd
    canGenerateRegistrationCodes: true,
    canActAsParentForChild: false,
    childCanSelfWithdraw: false,
    canManagePermissionProfiles: true,
    canStartDirectChat: true,
    canStartGroupChat: true,
    canUseChat: true,
    canManageSubstitutions: true,
    canViewStatistics: true,
    canExportReports: true,
  },
  coordinator: {
    canManageUsers: true,
    canManageGroups: true,
    canManageSchedule: true,
    canManageSettings: false,
    canManageSystemMessages: true,
    canViewSystemTab: false,
    canViewChildEmail: false,
    canGenerateRegistrationCodes: true,
    canActAsParentForChild: false,
    childCanSelfWithdraw: false,
    canManagePermissionProfiles: true,
    canStartDirectChat: true,
    canStartGroupChat: true,
    canUseChat: true,
    canManageSubstitutions: true,
    canViewStatistics: true,
    canExportReports: true,
  },
  teacher: {
    canManageUsers: false,
    canManageGroups: false,
    canManageSchedule: true,
    canManageSettings: false,
    canManageSystemMessages: false,
    canViewSystemTab: false,
    canViewChildEmail: false,
    canGenerateRegistrationCodes: false,
    canActAsParentForChild: false,
    childCanSelfWithdraw: false,
    canManagePermissionProfiles: false,
    canStartDirectChat: true,
    canStartGroupChat: true,
    canUseChat: true,
    canManageSubstitutions: true,
    canViewStatistics: false,
    canExportReports: false,
  },
  parent: {
    canManageUsers: false,
    canManageGroups: false,
    canManageSchedule: false,
    canManageSettings: false,
    canManageSystemMessages: false,
    canViewSystemTab: false,
    canViewChildEmail: false,
    canGenerateRegistrationCodes: false,
    canActAsParentForChild: true,
    childCanSelfWithdraw: false,
    canManagePermissionProfiles: false,
    canStartDirectChat: true,
    canStartGroupChat: false,
    canUseChat: true,
    canManageSubstitutions: false,
    canViewStatistics: false,
    canExportReports: false,
  },
  member: {
    canManageUsers: false,
    canManageGroups: false,
    canManageSchedule: false,
    canManageSettings: false,
    canManageSystemMessages: false,
    canViewSystemTab: false,
    canViewChildEmail: false,
    canGenerateRegistrationCodes: false,
    canActAsParentForChild: false,
    childCanSelfWithdraw: true,
    canManagePermissionProfiles: false,
    canStartDirectChat: true,
    canStartGroupChat: false,
    canUseChat: true,
    canManageSubstitutions: false,
    canViewStatistics: false,
    canExportReports: false,
  },
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
