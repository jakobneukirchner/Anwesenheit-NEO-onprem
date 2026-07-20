# Rechte-Matrix & Prioritätslogik – Anwesenheit-NEO-onprem

## Prioritätsreihenfolge (höchste zuerst)

```
Einzelperson-Override  >  Gruppen-Zuweisung  >  Rechteprofil-Zuweisung  >  Systemstandard
```

Die Auflösungsfunktion `resolvePermission(userId, permissionKey)` wird bei **jedem**
geschützten API-Endpoint serverseitig aufgerufen. Kein Recht wird ausschließlich
im Frontend geprüft.

## Auflösungslogik – Schritt für Schritt

```
resolvePermission(userId, key):
  1. Suche in user_permissions für userId + key
     → gefunden (direktes Recht): Wert zurückgeben ✓
  2. Suche in user_permissions für userId nach Profilzuweisung
     → gefunden: permission_profile_items[profileId][key] zurückgeben ✓
  3. Ermittle alle Gruppen des Nutzers
     Für jede Gruppe:
       3a. Suche in group_permissions für groupId + key (direktes Recht)
           → gefunden: Wert zurückgeben ✓
       3b. Suche in group_permissions für groupId nach Profilzuweisung
           → gefunden: permission_profile_items[profileId][key] zurückgeben ✓
  4. Systemstandard aus Rollendefinition (roleDefaults[role][key])
  5. false (verweigert)
```

*Bei mehreren Gruppen gilt: die restriktivste Gruppe gewinnt (konfigurierbar
auf "erste gefundene" oder "restriktivste"), Standard: erste gefundene.*

## Auflösungs-Beispiele

### Beispiel 1 – Direkter Einzelperson-Override schlägt Gruppenprofil

| Ebene | Quelle | canManageSchedule |
|---|---|---|
| Systemstandard (teacher) | roleDefaults | `false` |
| Gruppenzuweisung via Profil "Vertretungslehrer" | group_permissions | `true` |
| Direkter Einzelperson-Override | user_permissions | `false` |
| **Ergebnis** | Einzelperson gewinnt | **`false`** |

### Beispiel 2 – Profil auf Gruppe, kein Override

| Ebene | Quelle | canGenerateRegistrationCodes |
|---|---|---|
| Systemstandard (member) | roleDefaults | `false` |
| Gruppenebene via Profil "Elternvertreter" | group_permissions → profile | `true` |
| Einzelperson | user_permissions | *(kein Eintrag)* |
| **Ergebnis** | Gruppe/Profil greift | **`true`** |

### Beispiel 3 – Kein Eintrag auf keiner Ebene

| Ebene | Quelle | canViewStatistics |
|---|---|---|
| Systemstandard (parent) | roleDefaults | `false` |
| Gruppe | *(kein Eintrag)* | — |
| Einzelperson | *(kein Eintrag)* | — |
| **Ergebnis** | Systemstandard | **`false`** |

## Vollständiger Rechtekatalog

| Permission Key | Beschreibung | Admin | Coordinator | Teacher | Parent | Member | SuAd |
|---|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `canManageUsers` | Benutzer anlegen/bearbeiten/löschen | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `canManageGroups` | Gruppen anlegen/bearbeiten/löschen | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `canManageSchedule` | Termine anlegen/bearbeiten/löschen/absagen | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `canManageSettings` | Globale Systemeinstellungen ändern | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `canManageSystemMessages` | Systemnachrichten verwalten | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `canViewSystemTab` | Admin-System-Tab (Branding, Rate-Limit…) | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `canViewChildEmail` | E-Mail-Adressen von Kindern einsehen | ❌ | ❌ | ❌ | ❌ | ❌ | ✅¹ |
| `canGenerateRegistrationCodes` | Registrierungscodes erzeugen/verwalten | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `canActAsParentForChild` | Anwesenheit für verknüpftes Kind eintragen | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| `childCanSelfWithdraw` | Kind darf sich selbst abmelden | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| `canManagePermissionProfiles` | Rechteprofile erstellen/bearbeiten/zuweisen | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `canStartDirectChat` | Einzelchats starten | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `canStartGroupChat` | Gruppenchats starten | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `canUseChat` | Chat grundsätzlich nutzen | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `canManageSubstitutions` | Vertretungsanfragen stellen/bestätigen | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `canViewStatistics` | Statistik-Modul einsehen | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `canExportReports` | PDF/CSV-Reports exportieren | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |

¹ `canViewChildEmail` ist **technisch fest an SuAd gebunden** und kann über das
Rechtesystem keiner anderen Rolle zugewiesen werden, auch nicht als Einzelperson-Override.

## Rollendefinitionen

| Rolle | Wählbar in UI | Beschreibung |
|---|:---:|---|
| `suad` | ❌ | Super Admin, nur via Setup-Skript, sieht Kind-E-Mails |
| `admin` | ✅ | Volle Verwaltung außer Kind-E-Mails |
| `coordinator` | ✅ | Gruppen-/Terminverwaltung, Codes, Rechteprofile |
| `teacher` | ✅ | Termine verwalten, Vertretungen, Gruppen-Chat |
| `parent` | ✅¹ | Kinder ein-/austragen |
| `member` | ✅¹ | Teilnehmer/Kind |

¹ parent und member werden typischerweise über Registrierungscodes vergeben.

## Rechteprofile (Konzept)

Rechteprofile sind benannte Vorlagen, die eine feste Kombination aus Rechten
bündeln. Sie können:

- einer **ganzen Gruppe** zugewiesen werden → alle Mitglieder erben die Rechte
- einer **Einzelperson** zugewiesen werden → ergänzt oder überschreibt Gruppenregeln

### Beispielprofile

| Profilname | Enthaltene Rechte |
|---|---|
| Vertretungslehrer | `canManageSchedule`, `canManageSubstitutions`, `canStartGroupChat` |
| Praktikant | `canUseChat`, `canStartDirectChat` |
| Elternvertreter | `canGenerateRegistrationCodes`, `canManageSystemMessages` |
| Gruppenleiter | `canManageSchedule`, `canManageSubstitutions`, `canViewStatistics` |

## Datenschutz: Kind-E-Mails

- E-Mail-Adressen von Nutzern mit Rolle `member` (konfigurierbar, ob generell
  oder unter bestimmtem Alter) werden **serverseitig** aus API-Responses
  herausgefiltert.
- Filterung erfolgt in `utils/emailFilter.ts`, wird bei **jedem** Endpoint
  aufgerufen, der Nutzerdaten zurückgibt.
- Ausnahme: Request kommt von SuAd-Account → vollständige Daten.
- Jeder SuAd-Zugriff auf eine Kind-E-Mail wird in `audit_logs` protokolliert:
  `(wer, wann, welcher Nutzer, endpoint)`.
