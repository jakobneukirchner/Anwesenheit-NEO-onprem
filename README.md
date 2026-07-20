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
# .env anpassen (JWT_SECRET, DB-Pfad, etc.)
npx prisma migrate deploy
npx ts-node scripts/setup-suad.ts   # SuAd-Account anlegen
npm run build
npm start
```

### Als Windows-Dienst (PM2)

```powershell
npm install -g pm2 pm2-windows-startup
pm2 start dist/server.js --name anwesenheit-neo
pm2 save
pm2-startup install
```

### Als Windows-Dienst (node-windows)

Siehe `scripts/install-service.ts`.

### Umgebungsvariablen (.env)

```env
# Server
PORT=3000
NODE_ENV=production

# Datenbank (SQLite Standard)
DATABASE_URL="file:./data/anwesenheit.db"
# PostgreSQL Alternative:
# DATABASE_URL="postgresql://user:password@localhost:5432/anwesenheit"

# JWT
JWT_SECRET=AENDERN_LANGER_GEHEIMER_SCHLUESSEL
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

# App
APP_TITLE="Anwesenheit NEO"
APP_URL=http://localhost:3000

# Backups
BACKUP_DIR=./backups
BACKUP_CRON="0 2 * * *"
```

## Update-Prozess

```powershell
git pull
npm install
npx prisma migrate deploy
npm run build
pm2 restart anwesenheit-neo
```

## Backup-Strategie

- Nachtbackup läuft automatisch via node-cron (konfigurierbar in `.env`).
- SQLite: Datei `data/anwesenheit.db` wird komprimiert nach `backups/` kopiert.
- PostgreSQL: `pg_dump` wird ausgeführt.
- Retention: 30 Tage (konfigurierbar).

## Reverse Proxy (optional)

Für IIS: ARR + URL-Rewrite auf `http://localhost:3000` konfigurieren.  
Für nginx: Standard `proxy_pass http://localhost:3000;` mit `proxy_http_version 1.1` und `Upgrade`/`Connection`-Headern für WebSockets.

## Weitere Dokumentation

- [Architektur & Datenmodell](docs/ARCHITECTURE.md)
- [Rechte-Matrix & Prioritätslogik](docs/PERMISSIONS.md)
- [REST-API-Dokumentation](docs/API.md)
- [Migrationsleitfaden von Firestore](docs/MIGRATION.md)
