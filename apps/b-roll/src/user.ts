import type { NextFunction, Request, Response } from 'express';

// The auth sidecar in front of this app sets an `x-user` header containing
// the authenticated user object as stringified JSON, e.g. {"uid":"ethan",...}.
// We only care about its `uid` field, carried through the request on
// `res.locals`.

function parseUid(header: string | undefined): string | undefined {
  if (!header) return undefined;
  try {
    const user = JSON.parse(header);
    if (user && typeof user.uid === 'string' && user.uid.length > 0) {
      return user.uid;
    }
  } catch {
    // Malformed header — treat as unauthenticated.
  }
  return undefined;
}

export function uidOf(res: Response): string {
  return res.locals.uid as string;
}

export function attachUser(req: Request, res: Response, next: NextFunction) {
  res.locals.uid = parseUid(req.header('x-user')) || process.env.DEV_UID;
  next();
}

export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!res.locals.uid) {
    if (req.path.startsWith('/api/')) {
      res.status(401).json({ error: 'No user identity' });
    } else {
      res.status(401).render('error', {
        title: 'Not signed in',
        status: 401,
        message: 'No user identity was provided by the auth proxy.',
      });
    }
    return;
  }
  next();
}
