# REST-API-Dokumentation – Anwesenheit-NEO-onprem

Basispath: `/api`  
Alle Endpunkte (außer Auth/Register) erfordern ein gültiges JWT im httpOnly-Cookie.
Das benötigte Recht wird mit `[PERM: key]` angegeben. `[AUTH]` = nur Authentifizierung,
kein spezifisches Recht.

---

## Auth

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| POST | `/auth/login` | Login, setzt Cookies | – |
| POST | `/auth/logout` | Logout, löscht Cookies | [AUTH] |
| POST | `/auth/refresh` | Access-Token erneuern | – |
| POST | `/auth/register` | Registrierung mit Code | – |
| GET | `/auth/me` | Eigenes Profil | [AUTH] |

---

## Benutzer

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/users` | Alle Nutzer (Kind-E-Mails gefiltert) | `canManageUsers` |
| POST | `/users` | Nutzer anlegen | `canManageUsers` |
| GET | `/users/:id` | Einzelner Nutzer | `canManageUsers` |
| PATCH | `/users/:id` | Nutzer bearbeiten | `canManageUsers` |
| DELETE | `/users/:id` | Nutzer löschen | `canManageUsers` |
| GET | `/users/:id/permissions` | Aufgelöste Rechte des Nutzers | `canManageUsers` |
| POST | `/users/:id/parent-links` | Eltern-Kind-Verknüpfung anlegen | `canManageUsers` |
| DELETE | `/users/:id/parent-links/:parentId` | Verknüpfung entfernen | `canManageUsers` |

---

## Gruppen

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/groups` | Alle Gruppen | [AUTH] |
| POST | `/groups` | Gruppe anlegen | `canManageGroups` |
| GET | `/groups/:id` | Gruppe | [AUTH] |
| PATCH | `/groups/:id` | Gruppe bearbeiten | `canManageGroups` |
| DELETE | `/groups/:id` | Gruppe löschen | `canManageGroups` |
| POST | `/groups/:id/members` | Mitglied hinzufügen | `canManageGroups` |
| DELETE | `/groups/:id/members/:userId` | Mitglied entfernen | `canManageGroups` |
| GET | `/groups/:id/permissions` | Gruppenrechte/-profile | `canManagePermissionProfiles` |
| PUT | `/groups/:id/permissions` | Gruppenrechte/-profile setzen | `canManagePermissionProfiles` |

---

## Termine

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/events` | Termine (Filter: groupId, from, to, mode) | [AUTH] |
| POST | `/events` | Termin anlegen | `canManageSchedule` |
| GET | `/events/:id` | Einzelner Termin | [AUTH] |
| PATCH | `/events/:id` | Termin bearbeiten (single/following/all) | `canManageSchedule` |
| DELETE | `/events/:id` | Termin löschen (single/following/all) | `canManageSchedule` |
| POST | `/events/:id/cancel` | Ausfall markieren mit Begründung | `canManageSchedule` |
| DELETE | `/events/:id/cancel` | Ausfall aufheben | `canManageSchedule` |
| POST | `/events/bulk-action` | Massenaktionen | `canManageSchedule` |

---

## Anmeldungen

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/events/:id/attendance` | Anmeldungen für Termin | [AUTH] |
| POST | `/events/:id/attendance` | Anmelden (für sich oder Kind) | [AUTH] |
| DELETE | `/events/:id/attendance/:userId` | Abmelden | [AUTH] |
| POST | `/events/:id/attendance/:userId/confirm` | Anfrage bestätigen | `canManageSchedule` |

---

## Vertretungen

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/substitutions` | Alle Vertretungsanfragen | `canManageSubstitutions` |
| POST | `/substitutions` | Anfrage stellen | `canManageSubstitutions` |
| PATCH | `/substitutions/:id` | Anfrage bestätigen/ablehnen | `canManageSubstitutions` |

---

## Systemnachrichten

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/messages` | Nachrichten (gefiltert nach Zielgruppe) | [AUTH] |
| POST | `/messages` | Nachricht erstellen | `canManageSystemMessages` |
| PATCH | `/messages/:id` | Nachricht bearbeiten | `canManageSystemMessages` |
| DELETE | `/messages/:id` | Nachricht löschen | `canManageSystemMessages` |
| POST | `/messages/:id/dismiss` | Ausblenden für aktuellen Nutzer | [AUTH] |

---

## Chat

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/chat/rooms` | Eigene Räume | `canUseChat` |
| POST | `/chat/rooms` | Raum erstellen | `canStartDirectChat` oder `canStartGroupChat` |
| GET | `/chat/rooms/:id/messages` | Nachrichtenverlauf | `canUseChat` |
| DELETE | `/chat/messages/:id` | Nachricht löschen (Moderation) | `canManageUsers` (admin/SuAd) |

WebSocket-Events (Socket.IO):
- `chat:message` – neue Nachricht senden/empfangen
- `chat:typing` – Tipp-Indikator
- `chat:read` – Gelesen-Status
- `events:update` – Live-Update bei Terminänderungen
- `attendance:update` – Live-Update bei Anmeldungsänderungen

---

## Rechteprofile

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/permission-profiles` | Alle Profile | `canManagePermissionProfiles` |
| POST | `/permission-profiles` | Profil erstellen | `canManagePermissionProfiles` |
| GET | `/permission-profiles/:id` | Profil mit Zuweisungsübersicht | `canManagePermissionProfiles` |
| PATCH | `/permission-profiles/:id` | Profil bearbeiten | `canManagePermissionProfiles` |
| DELETE | `/permission-profiles/:id` | Profil löschen | `canManagePermissionProfiles` |

---

## Registrierungscodes

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/registration-codes` | Alle Codes (mit Nutzungsstatus) | `canGenerateRegistrationCodes` |
| POST | `/registration-codes` | Code erstellen | `canGenerateRegistrationCodes` |
| DELETE | `/registration-codes/:id` | Code deaktivieren | `canGenerateRegistrationCodes` |

---

## Einstellungen

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/settings` | Alle öffentlichen Einstellungen | [AUTH] |
| GET | `/settings/all` | Alle Einstellungen inkl. System | `canManageSettings` |
| PUT | `/settings` | Einstellungen speichern | `canManageSettings` |
| GET | `/settings/branding` | Branding-Infos (public) | – |

---

## Statistik & Reports

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/statistics/overview` | Kennzahlen | `canViewStatistics` |
| GET | `/statistics/attendance` | Anwesenheitsquoten | `canViewStatistics` |
| GET | `/reports/export` | PDF/CSV-Export | `canExportReports` |

---

## SuAd-Interna (Pfad: /internal)

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/internal/suad/users` | Alle Nutzer inkl. Kind-E-Mails | SuAd only |
| GET | `/internal/suad/audit-logs` | Vollständige Audit-Logs | SuAd only |
| GET | `/internal/suad/jobs` | Cronjob-Status | SuAd only |
