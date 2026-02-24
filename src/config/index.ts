import dotenv from 'dotenv';
dotenv.config();

export const config = {
    port: parseInt(process.env['PORT'] || '3000', 10),
    host: process.env['HOST'] || 'localhost',

    // SMTP Configuration
    smtp: {
        host: process.env['SMTP_HOST'] || 'smtp.gmail.com',
        port: parseInt(process.env['SMTP_PORT'] || '465', 10),
        secure: process.env['SMTP_SECURE'] !== 'false',  // defaults to true (SSL)
        user: process.env['SMTP_USER'] || '',
        pass: process.env['SMTP_PASS'] || '',
        from: process.env['SMTP_FROM'] || 'hackathon@company.com',
    },

    // JWT / Auth
    jwtSecret: process.env['JWT_SECRET'] || 'hackathon-super-secret-key-change-in-production',
    sessionSecret: process.env['SESSION_SECRET'] || 'session-secret-change-in-production',

    // Database
    dbPath: process.env['DB_PATH'] || './data/hackathon.db',

    // Paths
    resumesDir: process.env['RESUMES_DIR'] || './resumes',
    reposDir: process.env['REPOS_DIR'] || './repos',
    csvOutput: process.env['CSV_OUTPUT'] || './extracted_candidates.csv',

    // GitHub
    githubToken: process.env['GITHUB_TOKEN'] || '',

    // Admin defaults
    defaultAdmin: {
        username: process.env['ADMIN_USERNAME'] || 'admin',
        password: process.env['ADMIN_PASSWORD'] || 'admin123',
    },

    // App URL
    appUrl: process.env['APP_URL'] || 'http://localhost:3000',

    // OpenRouter
    openrouterApiKey: process.env['OPENROUTER_API_KEY'] || '',
    aiModel: process.env['AI_MODEL'] || 'google/gemini-2.0-flash-001',
};
