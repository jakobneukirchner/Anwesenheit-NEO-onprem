# Migrationsleitfaden: Firestore → SQLite/PostgreSQL

## Überblick

Dieses Dokument beschreibt das Konzept und die Schritte zur Migration
von bestehenden Anwesenheit-NEO-Daten aus Firebase/Firestore in die
neu Anwesenheit-NEO-onprem-Datenbank.

## Voraussetzungen

- Firebase Admin SDK (für den Export)
- Node.js ≥ 20.x
- Anwesenheit-NEO-onprem installiert und DB-Schema migriert

## Schritt 1: Firestore-Export

```bash
# Firebase Admin SDK verwenden
npx ts-node scripts/migrate/export-firestore.ts
# Erzeugt: migration-export/
#   users.json
#   groups.json
#   events.json
#   attendance.json
#   messages.json
#   settings.json
```

Das Export-Skript liest alle relevanten Collections aus Firestore und
normalisiert die Dokumente in ein einheitliches JSON-Format.

## Schritt 2: Transformation

```bash
npx ts-node scripts/migrate/transform.ts
# Liest migration-export/*.json
# Erzeugt migration-transformed/*.json
# Mapping:
#   Firebase UID → neue UUID
#   Firestore Timestamps → ISO-8601
#   Fehlende Felder → Defaults
#   Rollen-Strings normalisieren (admin/coordinator/teacher/member)
```

## Schritt 3: Import

```bash
npx ts-node scripts/migrate/import.ts
# Importiert in der Reihenfolge:
#   1. settings
#   2. users (ohne E-Mails für Kinder-Accounts, wenn konfiguriert)
#   3. groups + group_memberships
#   4. events + event_series
#   5. attendance_records
#   6. system_messages
```

**Achtung:** Passwörter können nicht aus Firebase exportiert werden.
Nach dem Import erhalten alle Nutzer einen temporären, zufälligen
Passwort-Reset-Link (oder ein einheitliches Initialpasswort, das beim
ersten Login geändert werden muss).

## Bekannte Mapping-Probleme

| Altes Feld (Firestore) | Neues Feld (SQL) | Hinweis |
|---|---|---|
| Firebase UID (string) | `id` (UUID) | Neue UUID wird generiert |
| `role: "admin"` | `role: "admin"` | Direkt übertragbar |
| `createdAt` (Timestamp) | `createdAt` (DateTime) | ISO-8601-Konvertierung |
| Firestore Sub-Collections | Eigene Tabellen | Normalisierung nötig |
| Fehlende `email` bei members | `email: null` | Optional im neuen System |

## Rollback-Plan

1. Firebase/Firestore bleibt bis zur vollständigen Verifikation aktiv.
2. Nach erfolgreicher Migration: Lesezeiger auf neues System setzen.
3. Erst nach 2-4 Wochen Produktionsbetrieb Firebase deaktivieren.
