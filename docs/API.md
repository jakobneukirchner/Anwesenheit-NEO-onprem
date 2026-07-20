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
| POST | `/events/:id/attendance` | Status setzen (für sich, verknüpftes Kind oder als Manager) | [AUTH]¹ |
| POST | `/events/:id/attendance/:userId/confirm` | Anfrage bestätigen (→ confirmed) | [AUTH]¹ |
| POST | `/events/:id/attendance/:userId/decline` | Anfrage ablehnen (→ cancelled) | [AUTH]¹ |
| DELETE | `/events/:id/attendance/:userId` | Zurückziehen (→ withdrawn) | [AUTH]¹ |

¹ Zugriff wird über `assertCanActFor` geprüft: entweder eigener Datensatz,
`canActAsParentForChild` bei verknüpftem Kind, oder `canManageSchedule` (Manager).
Der Modus des Termins (`open`/`request`/`closed`) sowie An-/Abmeldefristen werden zusätzlich erzwungen.

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
| GET | `/chat/rooms/:id/messages` | Nachrichtenverlauf (entschlüsselt) | `canUseChat` |
| DELETE | `/chat/messages/:id` | Nachricht löschen (Moderation, auditiert) | `canModerateChat` |

WebSocket-Events (Socket.IO, JWT-Cookie-Auth beim Handshake):
- `chat:join` – Raum beitreten (Teilnahme wird serverseitig geprüft)
- `chat:message` – Nachricht senden/empfangen (persistiert verschlüsselt, prüft `canUseChat` + Teilnahme)
- `chat:typing` – Tipp-Indikator (nur an Raumteilnehmer)

---

## Rechteprofile

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/permission-profiles` | Alle Profile | `canManagePermissionProfiles` |
| GET | `/permission-profiles/catalog` | Vollständiger Rechtekatalog | `canManagePermissionProfiles` |
| POST | `/permission-profiles` | Profil erstellen | `canManagePermissionProfiles` |
| GET | `/permission-profiles/:id` | Profil mit Zuweisungsübersicht | `canManagePermissionProfiles` |
| PATCH | `/permission-profiles/:id` | Profil bearbeiten | `canManagePermissionProfiles` |
| DELETE | `/permission-profiles/:id` | Profil löschen | `canManagePermissionProfiles` |
| POST | `/permission-profiles/:id/assign` | Profil an Gruppe/Person zuweisen | `canManagePermissionProfiles` |

`canViewChildEmail` wird bei Profil-Erstellung/-Bearbeitung serverseitig abgelehnt.

---

## Registrierungscodes

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/registration-codes` | Alle Codes (mit Nutzungsstatus) | `canGenerateRegistrationCodes` |
| POST | `/registration-codes` | Code erstellen (Format `AA11-B2B2-C33C-44DD`) | `canGenerateRegistrationCodes` |
| PATCH | `/registration-codes/:id` | Ablaufdatum/Nutzungslimit ändern | `canManageRegistrationCodeLimits` |
| DELETE | `/registration-codes/:id` | Code deaktivieren | `canGenerateRegistrationCodes` |

---

## Einstellungen

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/settings/branding` | Branding-Infos (public, vor Auth) | – |
| GET | `/settings` | Öffentliche Einstellungen | [AUTH] |
| GET | `/settings/all` | Alle Einstellungen inkl. System | `canManageSettings` |
| PUT | `/settings` | Einstellungen speichern (Branding-Keys ausgenommen) | `canManageSettings` |

---

## Branding

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/branding` | Aktuelle Branding-Werte | – (public) |
| GET | `/branding/manifest.json` | Dynamisches PWA-Manifest | – (public) |
| PUT | `/branding` | Branding-Werte setzen (auditiert) | `canManageBranding` |
| POST | `/branding/logo` | Logo-Upload (PNG/JPEG/WEBP/SVG/ICO, ≤2 MB) | `canManageBranding` |
| POST | `/branding/favicon` | Favicon-Upload | `canManageBranding` |

Das dynamische Manifest ist zusätzlich unter dem Root-Pfad `GET /manifest.json` erreichbar.

---

## Statistik & Reports

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/statistics/overview` | Kennzahlen | `canViewStatistics` |
| GET | `/statistics/attendance` | Anwesenheitsquoten je Status | `canViewStatistics` |
| GET | `/reports/export` | CSV-Export der Anwesenheiten (`?groupId=`) | `canExportReports` |

---

## System

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/system/status` | Uptime, Cronjobs, letzte Backups, Kennzahlen | `canViewSystemTab` |

---

## Eltern-Kind-Verknüpfungen

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/parent-child-links` | Verknüpfungen (`?parentId=`/`?childId=`) | `canManageUsers` |
| POST | `/parent-child-links` | Verknüpfung anlegen (prüft Max-Limits) | `canManageUsers` |
| DELETE | `/parent-child-links/:id` | Verknüpfung entfernen | `canManageUsers` |

---

## Badges

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| GET | `/badges` | Badges eines Nutzers (`?userId=`, sonst eigene) | [AUTH] |
| POST | `/badges` | Badge zuweisen (auditiert) | `canAssignBadges` |
| DELETE | `/badges/:id` | Badge entfernen | `canAssignBadges` |

---

## SuAd-Interna (Pfad: /internal, ohne /api-Präfix)

| Methode | Pfad | Beschreibung | Recht |
|---|---|---|---|
| POST | `/internal/suad/activate-special` | Getarnte Badge-/SuAd-Aktivierung (SuAd-Key oder Bootstrap) | [AUTH] |
| POST | `/internal/suad/keys` | 12-h-SuAd-Key ausstellen (Sonderkennwort nötig) | SuAd only |
| GET | `/internal/suad/keys` | Ausgestellte Keys (ohne Klartext) | SuAd only |
| GET | `/internal/suad/users` | Alle Nutzer inkl. Kind-E-Mails (auditiert) | SuAd only |
| GET | `/internal/suad/audit-logs` | Vollständige, entschlüsselte Audit-Logs | SuAd only |
| GET | `/internal/suad/jobs` | Cronjob-Zeitpläne | SuAd only |

`activate-special` erfordert nur Authentifizierung (getarnt als Badge-Freischaltung unter
„Mein Profil"). Ein gültiger SuAd-Key stuft den Account zu `suad` hoch; existiert noch kein
SuAd, aktiviert der Bootstrap-Code den ersten SuAd und gibt einmalig den Recovery-Key zurück.
