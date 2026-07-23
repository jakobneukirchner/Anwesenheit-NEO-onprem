import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AccessTokenPayload {
  id: string;
  roles: string[];
}

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        roles: string[];
      };
      hasRole?: (role: string) => boolean;
    }
  }
}

/** Liest den Access-Token aus httpOnly-Cookie oder Authorization-Header. */
function extractToken(req: Request): string | undefined {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.accessToken;
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

/** Erzwingt eine gültige Authentifizierung und setzt req.user. */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Nicht authentifiziert' });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as AccessTokenPayload;
    req.user = { id: payload.id, roles: payload.roles };
    req.hasRole = (role: string) => payload.roles.includes(role);
    next();
  } catch {
    res.status(401).json({ error: 'Token ungültig oder abgelaufen' });
  }
}

/** Beschränkt Zugriff auf SuAd-Accounts. */
export function requireSuAd(req: Request, res: Response, next: NextFunction): void {
  if (!req.hasRole?.('suad')) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
