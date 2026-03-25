const { Pool } = require('pg');

// ✅ Use DATABASE_URL if available (Render / Production)
// ✅ Otherwise fallback to local config (Development)

const pool = new Pool(
    process.env.DATABASE_URL
        ? {
              connectionString: process.env.DATABASE_URL,
              ssl: {
                  rejectUnauthorized: false
              }
          }
        : {
              host: process.env.PG_HOST || 'localhost',
              port: process.env.PG_PORT || 5432,
              database: process.env.PG_DATABASE || 'group_apps_spr',
              user: process.env.PG_USER || 'Aritra_user',
              password: process.env.PG_PASSWORD || '',
              options: `-c search_path=${process.env.SCHEMA || 'ftp_app'},public`
          }
);

pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ PostgreSQL pool error:', err.message);
});

// ════════════════════════════════════
// SQLite → PostgreSQL COMPATIBILITY
// ════════════════════════════════════

function prepareQuery(sql, params = []) {
    let newParams = [];
    let paramIndex = 0;
    let pgIndex = 0;

    const parts = sql.split('?');
    let result = '';

    for (let i = 0; i < parts.length; i++) {
        result += parts[i];

        if (i < parts.length - 1) {
            const before = parts[i].trimEnd().toUpperCase();
            const value = params[paramIndex];

            if (before.endsWith('IS') && (value === null || value === undefined)) {
                result += 'NULL';
            } else {
                pgIndex++;
                result += `$${pgIndex}`;
                newParams.push(value);
            }
            paramIndex++;
        }
    }

    return { sql: result, params: newParams };
}

// ─── getAsync ───
const db = {};

db.getAsync = async function (sql, params = []) {
    const q = prepareQuery(sql, params);
    const result = await pool.query(q.sql, q.params);
    return result.rows[0] || null;
};

// ─── allAsync ───
db.allAsync = async function (sql, params = []) {
    const q = prepareQuery(sql, params);
    const result = await pool.query(q.sql, q.params);
    return result.rows;
};

// ─── runAsync ───
db.runAsync = async function (sql, params = []) {
    const q = prepareQuery(sql, params);
    const result = await pool.query(q.sql, q.params);

    return {
        lastID: result.rows[0]?.id || null,
        changes: result.rowCount || 0
    };
};

db.pool = pool;

module.exports = db;