/**
 * emailFilter – serverseitige Filterung von Kind-E-Mails
 *
 * Jeder Endpoint, der Nutzerdaten zurückgibt, muss diese Funktion
 * aufrufen. Kein Vertrauen auf Frontend-Filterung.
 */

export type SafeUser = Record<string, unknown>;

/**
 * Filtert die E-Mail eines Nutzers aus der API-Response heraus,
 * sofern der anfragende Nutzer kein SuAd ist und der Zielnutzer
 * die Rolle "member" hat (Kind-Account).
 *
 * @param targetUser - Der Nutzer, dessen Daten zurückgegeben werden
 * @param requestingRole - Rolle des anfragenden Nutzers
 * @returns Nutzer-Objekt ohne E-Mail (falls gefiltert)
 */
export function filterChildEmail(
  targetUser: SafeUser,
  requestingRoles: string[]
): SafeUser {
  const isMember = targetUser.role === 'member';
  const isSuAd = requestingRoles.includes('suad');

  if (isMember && !isSuAd) {
    const { email, ...rest } = targetUser as any;
    void email; // explizit verworfen
    return rest;
  }

  return targetUser;
}

/**
 * Filtert E-Mails aus einer Liste von Nutzern.
 */
export function filterChildEmails(
  users: SafeUser[],
  requestingRoles: string[]
): SafeUser[] {
  return users.map((u) => filterChildEmail(u, requestingRoles));
}
