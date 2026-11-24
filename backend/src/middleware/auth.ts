import { Request, Response, NextFunction } from 'express';
export interface AuthedRequest extends Request { userId?: string }
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const user = req.session as typeof req.session & { userId?: string };
  if (!user.userId) return res.status(401).json({ error: 'Please sign in with Google.' });
  req.userId = user.userId; next();
}
