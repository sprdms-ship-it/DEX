const db = require('../config/db');

const initDB = async () => {
    try {
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT,
                email TEXT UNIQUE,
                password TEXT,
                company TEXT,
                mobile TEXT,
                is_verified INTEGER DEFAULT 0,
                role TEXT DEFAULT 'user',
                domain TEXT,
                storage_limit BIGINT DEFAULT 524288000,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Add avatar column if it doesn't exist (safe migration)
        await db.pool.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT
        `);

        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS allowed_users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS domains (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE,
                is_approved INTEGER DEFAULT 1,
                created_by TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS otps (
                id TEXT PRIMARY KEY,
                email TEXT,
                otp TEXT,
                expires_at TIMESTAMPTZ
            )
        `);

        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS files (
                id TEXT PRIMARY KEY,
                name TEXT,
                path TEXT,
                type TEXT,
                size BIGINT DEFAULT 0,
                parent_id TEXT,
                owner_id TEXT,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS permissions (
                id TEXT PRIMARY KEY,
                file_id TEXT,
                user_id TEXT,
                domain TEXT,
                role TEXT DEFAULT 'viewer',
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS share_links (
                id TEXT PRIMARY KEY,
                file_id TEXT,
                token TEXT UNIQUE,
                access_type TEXT DEFAULT 'view',
                expires_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // ─── DOWNLOAD LOGS ───
        await db.pool.query(`
            CREATE TABLE IF NOT EXISTS download_logs (
                id TEXT PRIMARY KEY,
                file_id TEXT,
                file_name TEXT,
                file_size BIGINT DEFAULT 0,
                downloaded_by TEXT NOT NULL,
                downloaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await db.pool.query(`
            INSERT INTO domains (id, name, is_approved, created_by)
            VALUES ('sso-domain-1', 'shrirampistons.com', 1, 'system')
            ON CONFLICT (id) DO NOTHING
        `);
        await db.pool.query(`
            INSERT INTO domains (id, name, is_approved, created_by)
            VALUES ('sso-domain-2', 'sprautotech.com', 1, 'system')
            ON CONFLICT (id) DO NOTHING
        `);
        await db.pool.query(`
            INSERT INTO domains (id, name, is_approved, created_by)
            VALUES ('sso-domain-3', 'sprautotech.in', 1, 'system')
            ON CONFLICT (id) DO NOTHING
        `);

        await db.pool.query(`
            INSERT INTO users (id, name, email, password, is_verified, role, domain)
            VALUES ('admin-001', 'Admin', 'admin@sprautotech.com', '$2b$10$WDnGW/AnZJ8ZY5rRaWa1auzWTV76AiuRTQuYIi/kPjxXojwl5MVY.', 1, 'admin', 'sprautotech.com')
            ON CONFLICT (id) DO NOTHING
        `);

        console.log('All tables initialized (PostgreSQL)');

    } catch (err) {
        console.error('initDB error:', err);
        throw err;
    }
};

module.exports = initDB;