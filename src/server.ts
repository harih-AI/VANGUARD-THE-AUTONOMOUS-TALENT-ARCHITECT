import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config/index.js';
import { initDatabase, getDatabase, closeDatabase } from './database/index.js';
import adminRoutes from './routes/admin.js';
import submissionRoutes from './routes/submission.js';
import logger from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
    // 1. Initialize database
    await initDatabase();

    // 2. Seed default admin user
    const db = getDatabase();
    const existingAdmin = db.prepare('SELECT id FROM admin_users WHERE username = ?').get(config.defaultAdmin.username);
    if (!existingAdmin) {
        const hash = bcrypt.hashSync(config.defaultAdmin.password, 10);
        db.prepare('INSERT INTO admin_users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
            uuidv4(), config.defaultAdmin.username, hash, 'hr_admin'
        );
        logger.info(`Default admin user created: ${config.defaultAdmin.username}`);
    }

    // 3. Create Express app
    const app = express();

    // Middleware
    app.use(cors({ origin: true, credentials: true }));
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    // Static files
    app.use(express.static(path.join(__dirname, 'public')));

    // Routes
    app.use('/api/admin', adminRoutes);
    app.use('/api/submission', submissionRoutes);

    // Page routes
    app.get('/', (_req, res) => {
        res.redirect('/admin');
    });

    app.get('/admin', (_req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    });

    app.get('/submit', (_req, res) => {
        res.sendFile(path.join(__dirname, 'public', 'submit.html'));
    });

    // Health check
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Global error handler
    app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        logger.error(`Unhandled error: ${err.message}`);
        res.status(500).json({ success: false, error: 'Internal server error' });
    });

    // Start server
    app.listen(config.port, () => {
        console.log('');
        console.log('  ╔══════════════════════════════════════════════╗');
        console.log('  ║                                              ║');
        console.log('  ║   🚀 HACKATHON HUB SERVER STARTED            ║');
        console.log('  ║                                              ║');
        console.log(`  ║   Admin Panel:  http://${config.host}:${config.port}/admin     ║`);
        console.log(`  ║   Submit Form:  http://${config.host}:${config.port}/submit    ║`);
        console.log(`  ║   Health Check: http://${config.host}:${config.port}/health    ║`);
        console.log('  ║                                              ║');
        console.log(`  ║   Default Login: ${config.defaultAdmin.username} / ${config.defaultAdmin.password}         ║`);
        console.log('  ║                                              ║');
        console.log('  ╚══════════════════════════════════════════════╝');
        console.log('');
        logger.info(`Server running on http://${config.host}:${config.port}`);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        logger.info('Shutting down gracefully...');
        closeDatabase();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        logger.info('Shutting down gracefully...');
        closeDatabase();
        process.exit(0);
    });
}

startServer().catch((error) => {
    logger.error(`Failed to start server: ${error.message}`);
    console.error('Failed to start server:', error);
    process.exit(1);
});
