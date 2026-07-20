# BRANDING – Custom-Branding-Konzept

> Anwesenheit-NEO-onprem · White-Label-fähig

Das System ist vollständig white-label-fähig. Alle Branding-Werte liegen in der
Tabelle `global_settings` und werden zur Laufzeit ohne Neustart wirksam.

---

## 1  Konfigurierbare Werte

| Feld | Typ | Zweck |
|---|---|---|
| `appName` | String | Titel in Header, Browser-Tab und PWA-Name |
| `logoUrl` | String/Upload | Logo in App-Bar und Login-Screen |
| `faviconUrl` | String/Upload | Browser-Favicon und PWA-Icon |
| `primaryColor` | Hex | Material-3-Seed-Farbe für die Theme-Generierung |
| `themeMode` | Enum | `light` / `dark` / `system` (Standard) |
| `loginBackgroundUrl` | String/Upload | optionaler Hintergrund auf der Login-Seite |
| `supportContact` | String | Kontakt-Info im Footer/Hilfe-Bereich |
| `legalImprintText` | Text | Impressum-/Datenschutz-Hinweistext |

Die Standardwerte sind in `src/utils/settings.ts` (`DEFAULT_BRANDING`) definiert;
die Standard-Primärfarbe ist `#2f6b4f` (ruhiges Grün, kein Pink/Lila).

---

## 2  API

| Methode | Pfad | Recht |
|---|---|---|
| GET | `/api/branding` | – (public) |
| GET | `/api/branding/manifest.json` bzw. `/manifest.json` | – (public) |
| PUT | `/api/branding` | `canManageBranding` |
| POST | `/api/branding/logo` | `canManageBranding` |
| POST | `/api/branding/favicon` | `canManageBranding` |

Nur `admin` und `SuAd` besitzen `canManageBranding` standardmäßig. Jede Änderung
wird als `UPDATE_BRANDING` im Audit-Log protokolliert.

---

## 3  Upload-Validierung

- Erlaubte MIME-Typen: PNG, JPEG, WEBP, SVG, ICO.
- Maximale Größe: **2 MB** (`MAX_UPLOAD_BYTES`).
- Dateien werden mit zufälligem Namen unter `UPLOAD_DIR` (Standard `./uploads`)
  gespeichert und über `/uploads/<datei>` ausgeliefert.
- Validierung erfolgt serverseitig via `multer` `fileFilter` – kein Vertrauen auf
  die Client-Angaben.

---

## 4  Theme-Generierung im Frontend

- `primaryColor` wird als CSS-Variable `--md-primary` gesetzt; daraus leiten sich
  die weiteren Material-3-Farbrollen ab.
- `themeMode` steuert das `data-theme`-Attribut (`light`/`dark`); bei `system`
  entscheidet `prefers-color-scheme`.
- Änderungen greifen sofort nach dem Speichern (kein Neustart, keine Neuanmeldung).
- Favicon und Titel werden dynamisch aus `faviconUrl` bzw. `appName` gesetzt.

---

## 5  Dynamisches PWA-Manifest

Das `manifest.json` wird **nicht** statisch ausgeliefert, sondern zur Laufzeit aus
den Branding-Werten generiert (`name`, `short_name`, `theme_color`, `icons`).
So spiegelt eine installierte PWA automatisch das aktuelle Branding wider.
