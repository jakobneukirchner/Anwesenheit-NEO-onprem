import { prisma } from '../db/client';

/** Branding-Keys sind öffentlich lesbar (Login-Screen, Manifest). */
export const BRANDING_KEYS = [
  'appName',
  'logoUrl',
  'faviconUrl',
  'primaryColor',
  'themeMode',
  'loginBackgroundUrl',
  'supportContact',
  'legalImprintText',
];

export const DEFAULT_BRANDING: Record<string, string> = {
  appName: 'Anwesenheit NEO',
  logoUrl: '',
  faviconUrl: '',
  primaryColor: '#2f6b4f',
  themeMode: 'system',
  loginBackgroundUrl: '',
  supportContact: '',
  legalImprintText: '',
};

export async function getSetting(key: string): Promise<string | null> {
  const s = await prisma.globalSetting.findUnique({ where: { key } });
  return s?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.globalSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function getBranding(): Promise<Record<string, string>> {
  const rows = await prisma.globalSetting.findMany({ where: { key: { in: BRANDING_KEYS } } });
  const map: Record<string, string> = { ...DEFAULT_BRANDING };
  for (const r of rows) map[r.key] = r.value;
  return map;
}
