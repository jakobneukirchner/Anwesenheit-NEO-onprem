# Architektur & Datenmodell – Anwesenheit-NEO-onprem

## Verzeichnisstruktur

```
Anwesenheit-NEO-onprem/
├── src/
│   ├── server.ts              # Entry point, Express + Socket.IO setup
│   ├── config/
│   │   └── env.ts             # Validierte Umgebungsvariablen
│   ├── db/
│   │   └── client.ts          # Prisma Client Singleton
│   ├── middleware/
│   │   ├── auth.ts            # JWT-Validierung, Session-Guard
│   │   ├── permission.ts      # requirePermission(key) Middleware
│   │   └── rateLimiter.ts     # express-rate-limit, DB-konfigurierbar
│   ├── modules/
│   │   ├── auth/              # Login, Logout, Refresh, Register
│   │   ├── users/             # CRUD, Kind-E-Mail-Filterung
│   │   ├── groups/            # CRUD, Mitgliederverwaltung
│   │   ├── events/            # Termine, Wiederholungen, Ausfälle
│   │   ├── attendance/        # Anmeldungen, Abmeldungen, Bestätigungen
│   │   ├── substitutions/     # Vertretungsanfragen/-bestätigungen
│   │   ├── messages/          # Systemnachrichten
│   │   ├── chat/              # Einzel-/Gruppenchats, Socket-Handler
│   │   ├── permissions/       # Rechteprofile, Auflösungslogik
│   │   ├── registration/      # Registrierungscodes
│   │   ├── settings/          # Globale Einstellungen
│   │   ├── statistics/        # Auswertungen, Reports
│   │   └── backup/            # Manuelles/automatisches Backup
│   ├── jobs/
│   │   ├── autoCancelAttendance.ts
│   │   ├── reminderNotifications.ts
│   │   ├── cleanupExpiredCodes.ts
│   │   └── nightlyBackup.ts
│   ├── realtime/
│   │   └── socketServer.ts    # Socket.IO-Namespaces, Auth-Guard
│   └── utils/
│       ├── permissions.ts     # resolvePermission(userId, key)
│       ├── emailFilter.ts     # filterChildEmail(user, requestingUser)
│       └── audit.ts           # auditLog(action, actorId, targetId, meta)
├── prisma/
│   └── schema.prisma          # Vollständiges DB-Schema
├── frontend/                  # Bestehende Modulstruktur (kein Firebase-SDK)
├── scripts/
│   ├── setup-suad.ts          # SuAd-Initialisierung
│   └── install-service.ts     # node-windows Dienst-Installation
├── docs/
│   ├── ARCHITECTURE.md        # Diese Datei
│   ├── PERMISSIONS.md         # Rechte-Matrix
│   ├── API.md                 # REST-Dokumentation
│   └── MIGRATION.md           # Firestore-Migrationsleitfaden
├── .env.example
├── package.json
└── tsconfig.json
```

## Schichten-Übersicht

```
┌──────────────────────────────────────────────┐
│  Frontend (Browser / PWA)                    │
│  REST-Fetch + Socket.IO-Client               │
└──────────────┬───────────────────────────────┘
               │ HTTP / WebSocket
┌──────────────▼───────────────────────────────┐
│  Express + Socket.IO (Node.js)               │
│  ┌──────────┐ ┌───────────┐ ┌─────────────┐  │
│  │ JWT-Auth │ │ Permission│ │ Rate-Limit  │  │
│  │ Middleware│ │ Middleware│ │ Middleware  │  │
│  └──────────┘ └───────────┘ └─────────────┘  │
│  Module: auth | users | groups | events ...  │
│  Jobs: node-cron (Cronjobs)                  │
└──────────────┬───────────────────────────────┘
               │ Prisma ORM
┌──────────────▼───────────────────────────────┐
│  SQLite (Standard) | PostgreSQL (optional)   │
└──────────────────────────────────────────────┘
```

## Datenmodell (Prisma Schema – Überblick)

Das vollständige Schema liegt in `prisma/schema.prisma`.

### Kerntabellen

| Tabelle | Beschreibung |
|---|---|
| `users` | Alle Nutzer mit Rolle, Passwort-Hash, optionaler E-Mail |
| `groups` | Gruppen/Klassen |
| `group_memberships` | Many-to-Many User ↔ Group |
| `parent_child_links` | Many-to-Many Parent ↔ Child |
| `events` | Termine (inkl. Wiederholungsmetadaten) |
| `event_series` | Wiederholungsserien |
| `attendance_records` | Anmeldungen/Abmeldungen pro Termin+Nutzer |
| `substitutions` | Vertretungsanfragen |
| `system_messages` | Systemnachrichten |
| `user_message_dismissals` | Ausgeblendet pro Nutzer |
| `chat_rooms` | Einzel- und Gruppenräume |
| `chat_participants` | Teilnehmer pro Raum |
| `chat_messages` | Nachrichten mit Soft-Delete |
| `global_settings` | Key-Value-Einstellungen |
| `registration_codes` | Codes mit Gruppe, Rolle, Ablauf, Nutzungslimit |
| `registration_code_uses` | Audit-Log Nutzungen |
| `refresh_tokens` | Refresh-Token-Rotation |
| `audit_logs` | Allgemeines Audit-Log |

### Rechtesystem-Tabellen

| Tabelle | Beschreibung |
|---|---|
| `permissions` | Katalog aller Rechte-Keys mit Beschreibung |
| `permission_profiles` | Benannte Rechteprofile (Templates) |
| `permission_profile_items` | Einzelrechte in einem Profil |
| `group_permissions` | Rechte/Profile auf Gruppenebene |
| `user_permissions` | Rechte/Profile auf Einzelpersonenebene |

## Auth-Flow

```
POST /api/auth/login
  → bcrypt.compare(password, hash)
  → issue accessToken (JWT, 15min, httpOnly-Cookie)
  → issue refreshToken (opaque, 7d, httpOnly-Cookie, DB gespeichert)

POST /api/auth/refresh
  → refreshToken aus Cookie
  → Token-Rotation: altes Token invalidieren, neues ausstellen
  → neuer accessToken

POST /api/auth/logout
  → refreshToken aus DB löschen
  → Cookies löschen
```

## Registrierungscode-Flow

```
Coordinator erstellt Code:
  POST /api/registration-codes
  { groupId, roleId, expiresAt, maxUses, singleUse }
  → Code wird zufällig generiert, gehasht gespeichert
  → Audit-Log-Eintrag

Nutzer registriert sich:
  POST /api/auth/register
  { code, name, password, email? }
  → Code validieren (nicht abgelaufen, maxUses nicht erreicht)
  → User anlegen, Gruppe zuweisen
  → registration_code_uses Eintrag
  → accessToken + refreshToken
```

## SuAd-Einrichtung

SuAd ist **nicht über die UI wählbar**. Einrichtung ausschließlich über:

```powershell
npx ts-node scripts/setup-suad.ts
```

Das Skript fragt interaktiv nach Name und Passwort und setzt die Rolle direkt per
DB-Eintrag. Es kann nur ausgeführt werden, wenn noch kein SuAd-Account existiert
(Schutz gegen versehentliches doppeltes Anlegen).

SuAd-Accounts sind in normalen Nutzerlisten ausgeblendet (auch für admin).
Zugriff auf SuAd-Dashboard nur über internen Pfad `/internal/suad`.

## Cronjobs (node-cron)

| Job | Standard-Cron | Aufgabe |
|---|---|---|
| autoCancelAttendance | `*/5 * * * *` | Unbestätigte Anfragen nach Frist absagen |
| reminderNotifications | `0 * * * *` | Erinnerungen vor Terminen senden |
| cleanupExpiredCodes | `0 3 * * *` | Abgelaufene Registrierungscodes löschen |
| nightlyBackup | `0 2 * * *` | DB-Backup erstellen |

Alle Cron-Ausdrücke sind über `global_settings` überschreibbar.
