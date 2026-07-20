# Anwesenheit-NEO-onprem

Self-hostbares Anwesenheitssystem für Windows – ohne Firebase/Google Cloud.

## Stack

| Schicht | Technologie |
|---|---|
| Backend | Node.js + Express, TypeScript |
| Datenbank | SQLite (Standard) oder PostgreSQL |
| ORM | Prisma |
| Auth | JWT + bcrypt, httpOnly-Cookies, Refresh-Token-Rotation |
| Echtzeit | Socket.IO |
| Cronjobs | node-cron |
| Frontend | Bestehende Modulstruktur, REST + WebSocket-Client |

## Schnellstart (Windows)

### Voraussetzungen
- Node.js ≥ 20.x (https://nodejs.org)
- Git
- Optional: PM2 (`npm install -g pm2`) oder node-windows für Dienst-Betrieb

### Installation

```powershell
git clone https://github.com/jakobneukirchner/Anwesenheit-NEO-onprem.git
cd Anwesenheit-NEO-onprem
npm install
copy .env.example .env
# .env anpassen: JWT_SECRET und ENCRYPTION_KEY (64 Hex-Zeichen) unbedingt setzen
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY erzeugen
npx prisma generate
npm run setup               # Schema pushen + interaktiv ersten SuAd anlegen
npm run build
npm start
```

`npm run setup` kombiniert `prisma db push` mit dem SuAd-Setup. Für Test-/Demodaten
steht zusätzlich `npm run seed` bereit.

### Ersten SuAd anlegen (Bootstrap)

1. Ein beliebiges Konto per Registrierungscode anlegen und einloggen.
2. Unter **Mein Profil → Activate Special** den Bootstrap-Code `AB47-K2M8-R13Q-56TZ`
   und ein Sonderkennwort (min. 8 Zeichen) eingeben.
3. Der **Recovery-Key** wird **einmalig** angezeigt – sicher extern speichern.

Der Bootstrap greift nur, solange noch kein SuAd existiert. Alternativ steht das
interaktive Skript `npm run setup:suad` bereit.

### Als Windows-Dienst (PM2)

```powershell
npm install -g pm2 pm2-windows-startup
pm2 start dist/src/server.js --name anwesenheit-neo
pm2 save
pm2-startup install
```

### Als Windows-Dienst (node-windows)

```powershell
npm run service:install     # Dienst „Anwesenheit-NEO" registrieren und starten
npm run service:uninstall   # Dienst wieder entfernen
```

Das Skript `scripts/windows-service.js` nutzt `node-windows` und startet
`dist/src/server.js` automatisch beim Windows-Boot.

### Umgebungsvariablen (.env)

```env
# Server
PORT=3000
NODE_ENV=production

# Datenbank (SQLite Standard)
# Der Pfad wird von Prisma relativ zum prisma/-Ordner aufgelöst,
# die Datei liegt daher real unter prisma/data/anwesenheit.db.
DATABASE_URL="file:./data/anwesenheit.db"
# PostgreSQL Alternative:
# DATABASE_URL="postgresql://user:password@localhost:5432/anwesenheit"

# JWT
JWT_SECRET=AENDERN_LANGER_GEHEIMER_SCHLUESSEL
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# Feld-/Backup-Verschlüsselung (32 Byte = 64 Hex-Zeichen), UNBEDINGT ÄNDERN!
ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000

# App
APP_TITLE="Anwesenheit NEO"
APP_URL=http://localhost:3000
UPLOAD_DIR=./uploads

# Backups
BACKUP_DIR=./backups
BACKUP_CRON="0 2 * * *"
```

## Update-Prozess

```powershell
git pull
npm install
npx prisma db push
npm run build
pm2 restart anwesenheit-neo
```

## Backup-Strategie

- Nachtbackup läuft automatisch via node-cron (konfigurierbar in `.env`).
- SQLite: Datei `prisma/data/anwesenheit.db` (Prisma löst `DATABASE_URL` relativ zum
  `prisma/`-Ordner auf) wird komprimiert nach `backups/` kopiert.
- PostgreSQL: `pg_dump` wird ausgeführt.
- Retention: 30 Tage (konfigurierbar).

## Reverse Proxy (optional)

Für IIS: ARR + URL-Rewrite auf `http://localhost:3000` konfigurieren.  
Für nginx: Standard `proxy_pass http://localhost:3000;` mit `proxy_http_version 1.1` und `Upgrade`/`Connection`-Headern für WebSockets.

## Frontend & PWA

- Das Frontend (Material Design 3, deutsche UI) wird statisch aus `frontend/dist`
  ausgeliefert – kein separater Build-Schritt nötig.
- Rollenabhängige Dashboards, Admin-Navigation-Rail, code-basierte Anmeldung/Registrierung.
- Installierbar als PWA: dynamisches `manifest.json` und Service Worker (`sw.js`).
- Branding (Farben, Logo, Favicon, App-Name) ist zur Laufzeit über den Admin-Bereich
  konfigurierbar und greift ohne Neustart.

## Weitere Dokumentation

- [Architektur & Datenmodell](docs/ARCHITECTURE.md)
- [Rechte-Matrix & Prioritätslogik](docs/PERMISSIONS.md)
- [REST-API-Dokumentation](docs/API.md)
- [Sicherheits- & Verschlüsselungskonzept](docs/SECURITY.md)
- [Custom-Branding-Konzept](docs/BRANDING.md)
- [Migrationsleitfaden von Firestore](docs/MIGRATION.md)
