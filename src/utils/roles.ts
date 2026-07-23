export function parseRoles(roleField: string): string[] {
  try {
    const parsed = JSON.parse(roleField);
    return Array.isArray(parsed) ? parsed : [roleField];
  } catch {
    return [roleField];
  }
}

export function hasAnyRole(roleField: string, ...check: string[]): boolean {
  return parseRoles(roleField).some((r) => check.includes(r));
}

export function primaryRole(roleField: string): string {
  const roles = parseRoles(roleField);
  const order = ['suad', 'admin', 'coordinator', 'teacher', 'parent', 'member'];
  return order.find((r) => roles.includes(r)) || roles[0] || 'member';
}
