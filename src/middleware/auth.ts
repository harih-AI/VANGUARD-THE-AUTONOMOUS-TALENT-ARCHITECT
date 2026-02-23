import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import logger from '../utils/logger.js';

export interface AuthRequest extends Request {
    user?: { id: string; username: string; role: string };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
    // Check for token in cookie or Authorization header
    const token = req.cookies?.['auth_token'] ||
        (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

    if (!token) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
    }

    try {
        const decoded = jwt.verify(token, config.jwtSecret) as { id: string; username: string; role: string };
        req.user = decoded;
        next();
    } catch (error: any) {
        logger.warn(`Auth failed: ${error.message}`);
        res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
}

export function generateToken(user: { id: string; username: string; role: string }): string {
    return jwt.sign(user, config.jwtSecret, { expiresIn: '24h' });
}
