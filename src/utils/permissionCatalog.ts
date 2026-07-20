/**
 * Zentraler Rechtekatalog. Einzige Quelle der Wahrheit für alle Permission-Keys.
 * Wird zum Seeden der `permissions`-Tabelle und zur Validierung verwendet.
 */

export const PERMISSION_CATALOG: Record<string, string> = {
  canManageUsers: 'Nutzer anlegen, bearbeiten, sperren, löschen',
  canManageGroups: 'Gruppen anlegen, bearbeiten, Mitglieder zuordnen',
  canManageSchedule: 'Termine anlegen, bearbeiten, Serien verwalten',
  canManageSettings: 'Globale Einstellungen ändern',
  canManageBranding: 'Custom Branding (Logo, Farben, Name, Favicon) ändern',
  canManageSystemMessages: 'Systemnachrichten erstellen/bearbeiten/löschen',
  canViewSystemTab: 'Zugriff auf Systemstatus (Cronjobs, Backups, Rate-Limits)',
  canViewChildEmail: 'Kind-E-Mail einsehen (technisch exklusiv SuAd, NICHT vergebbar)',
  canGenerateRegistrationCodes: 'Registrierungscodes erzeugen',
  canManageRegistrationCodeLimits: 'Ablaufdatum/Nutzungsanzahl bei Codes ändern',
  canActAsParentForChild: 'Anwesenheit für verknüpfte Kinder setzen',
  childCanSelfWithdraw: 'Kind darf sich selbst abmelden',
  canManagePermissionProfiles: 'Rechteprofile anlegen/bearbeiten/löschen',
  canStartDirectChat: 'Einzelchat starten',
  canStartGroupChat: 'Gruppenchat starten',
  canUseChat: 'Chat grundsätzlich nutzen',
  canModerateChat: 'Chat-Nachrichten anderer löschen/moderieren',
  canManageSubstitutions: 'Vertretungen anfragen/bestätigen/verwalten',
  canViewStatistics: 'Statistik-Dashboard einsehen',
  canExportReports: 'Reports/Statistiken exportieren',
  canViewAuditLog: 'Audit-Log einsehen',
  canAssignBadges: 'Badges wie „Dev" an Nutzer vergeben',
};

export type PermissionKey = keyof typeof PERMISSION_CATALOG;

export const ALL_PERMISSION_KEYS = Object.keys(PERMISSION_CATALOG);

/** In der UI wählbare Rollen (suad ist versteckt). */
export const SELECTABLE_ROLES = ['admin', 'coordinator', 'teacher', 'parent', 'member'];
