# SECURITY – Sicherheits- und Datenschutzkonzept

> Anwesenheit-NEO-onprem · Stand: 2026

---

## 1  Grundsätze

- Alle personenbezogenen Inhalte werden verschlüsselt gespeichert (DSGVO Art. 25, 32).
- Technische Join-Felder (IDs, Rollen, Status, Timestamps) bleiben im Klartext, damit das System funktionsfähig ist.
- Kryptografisch: **AES-256-GCM** mit pro-Datensatz-IV.
- Ein **Recovery-Key** (256 Bit, hex) wird einmalig beim Setup generiert und nur einmal angezeigt.
- Ein separater **SuAd-Sonderkennwort-Hash** (argon2id) wird beim ersten SuAd-Setup gesetzt und kann nie verändert werden.

---

## 2  Datenklassen

| Klasse | Beispiele | Behandlung |
|--------|-----------|------------|
| **Personenbezogen-sensitiv** | Name, E-Mail, interne Hinweise, Kontaktmetadaten | AES-256-GCM verschlüsselt |
| **Chat / Nachrichten** | ChatMessage.bodyEnc, SystemMessage.bodyEnc/titleEnc | AES-256-GCM verschlüsselt |
| **Termindetails** | Beschreibung, Ort, Absagegrund, Teilnahme-Notizen | AES-256-GCM verschlüsselt |
| **Technische Relationsfelder** | id, userId, groupId, role, status, timestamps | Klartext (notwendig) |
| **Passwörter** | passwordHash | argon2id, kein Klartext |
| **Backup-Dateien** | *.db.enc, *.sql.enc | gzip + AES-256-GCM (ENCRYPTION_KEY) |

---

## 3  Verschlüsselungsmodell

```
┌─────────────────────────────────────────────────────────────┐
│  MASTER_KEY  (32 Byte, aus ENV – ENCRYPTION_KEY)            │
│      ├─ abgeleitet per HKDF-SHA256 für Feldinhalte          │
│      └─ direkt für Backup-Verschlüsselung (GCM, eig. IV)   │
│                                                             │
│  RECOVERY_KEY  (32 Byte hex, einmalig beim Setup)           │
│      └─ Backup-Entschlüsselung bei Datenverlust             │
│                                                             │
│  SUAD_SECRET  (argon2id-Hash, nie änderbar)                 │
│      └─ Voraussetzung zum Ausstellen neuer SuAd-Keys        │
└─────────────────────────────────────────────────────────────┘
```

### 3.1  Feldinhalte (encrypt / decrypt)

1. `crypto.randomBytes(12)` → **12-Byte IV** (GCM-Standard)
2. `createCipheriv('aes-256-gcm', key, iv)`
3. Ausgabe: `{ ciphertext: hex, iv: hex, tag: hex, keyVersion: number }`
4. Das JSON-Objekt wird als String in der DB-Spalte `*Enc` gespeichert.

### 3.2  Backup-Verschlüsselung

1. Backup-Datei wird zuerst gzip-komprimiert (temporär, `.gz`).
2. Anschließend mit `ENCRYPTION_KEY` AES-256-GCM verschlüsselt.
3. Binär-Format: `[ 4 Byte keyVersion ][ 12 Byte IV ][ 16 Byte Auth-Tag ][ Ciphertext ]`
4. Dateiendung: `.db.enc` bzw. `.sql.enc`
5. Die temporäre `.gz`-Datei wird sofort nach der Verschlüsselung gelöscht.

### 3.3  Key-Versionen

- `keyVersion` ermöglicht spätere Key-Rotation ohne Verlust alter Daten.
- Aktuell unterstützte Version: **1**

---

## 4  Recovery-Key-Flow

```
Setup-Schritt 1: bootstrap (scripts/bootstrap.ts)
  └─ generiere 32 zufällige Bytes → RECOVERY_KEY (hex, 64 Zeichen)
  └─ zeige RECOVERY_KEY einmalig in der Konsole
  └─ speichere SHA-256(RECOVERY_KEY) in system_secrets (type='recovery_hash')
  └─ RECOVERY_KEY selbst wird NICHT in der DB gespeichert

Wiederherstellung:
  └─ Admin gibt RECOVERY_KEY ein
  └─ SHA-256(input) wird verglichen mit stored hash (timing-safe)
  └─ bei Übereinstimmung: Backup-Entschlüsselung möglich (decryptFile)
```

> **Hinweis:** Ohne Recovery-Key sind verschlüsselte Backups nicht entschlüsselbar.
> Der Key muss sicher extern gespeichert werden (z. B. Passwort-Manager, ausgedruckt in Safe).

---

## 5  SuAd-Konzept & Abgrenzung

### 5.1  Erster SuAd (Bootstrap)

- Kein normaler User-Account für den ersten SuAd beim initialen Setup.
- Stattdessen: **geheimer Bootstrap-Code** (im Code als SHA-256-Hash hinterlegt, anpassbar).
- Beispielhash (SHA-256 von `AB47-K2M8-R13Q-56TZ`):
  ```
  804d28f7c6ec846085ffe11a55c25fa67634b1bcaea9786428eac5a71011a661
  ```
  *Dieser Hash ist im Code sichtbar – er hat keinen Wert ohne das Original-Passwort.
  Der Betreiber ersetzt ihn nach dem ersten Setup durch einen eigenen Hash
  (z. B. via `SUAD_BOOTSTRAP_HASH` in `.env`).*
- Beim ersten Einlösen dieses Codes:
  1. Account wird mit Rolle `suad` angelegt (Name/E-Mail AES-verschlüsselt)
  2. **Recovery-Key** wird generiert und einmalig in der Konsole ausgegeben
  3. **SuAd-Sonderkennwort** wird gesetzt (argon2id-Hash, unveränderlich)

### 5.2  Weitere SuAds

- Nur ein bestehender SuAd kann neue **SuAd-Keys** ausstellen (12 Stunden gültig, Format: `XXXX-XXXX-XXXX-XXXX`).
- Voraussetzung: SuAd gibt sein **unveränderliches Sonderkennwort** ein (argon2id-Verifikation).
- Mit einem gültigen SuAd-Key kann:
  - ein neuer Account mit Rolle `suad` erstellt werden
  - ein bestehender Account zu `suad` hochgestuft werden

### 5.3  Tarnung im UI ("Activate Special")

- Unter „Mein Profil" gibt es das Feld **Activate Special**.
- Öffentlich deklariert als Badge-Aktivierung (z. B. Dev-Badge).
- Intern: Wenn ein gültiger SuAd-Key eingegeben wird, läuft darüber die SuAd-Aktivierung.
- Normale Admins sehen nur die Badge-Funktion; SuAd-Semantik ist intern verborgen.

### 5.4  SuAd-Sichtbarkeitsregeln

| Wer | Kann SuAds sehen? |
|-----|-------------------|
| SuAd | Ja, alle SuAds |
| Admin | Nein |
| Alle anderen | Nein |

---

## 6  DSGVO-Maßnahmen (Überblick)

| Maßnahme | Umsetzung |
|----------|-----------|
| Verschlüsselung ruhender Daten | AES-256-GCM für sensitive Felder (`*Enc`) |
| Verschlüsselung Backups | AES-256-GCM + ENCRYPTION_KEY, Recovery möglich |
| Passwort-Sicherheit | argon2id |
| Zugriffskontrolle | resolvePermission() + JWT + httpOnly-Cookies |
| Audit-Trail | AuditLog für alle sensitiven Aktionen (metaEnc verschlüsselt) |
| Recht auf Löschung | Cascade-Delete + Audit-Eintrag bei Löschung |
| Kind-E-Mail-Schutz | canViewChildEmail ausschließlich SuAd |
| Rate-Limiting | express-rate-limit auf Auth-Endpunkten |
| Datensparsamkeit | Nur notwendige Felder im Klartext |
