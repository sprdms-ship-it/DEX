const { Pool } = require('pg');

const pool = new Pool({
    host: process.env.PG_HOST || 'localhost',
    port: process.env.PG_PORT || 5432,
    database: process.env.PG_DATABASE || 'group_apps_spr',
    user: process.env.PG_USER || 'Aritra_user',
    password: process.env.PG_PASSWORD || '',
    options: `-c search_path=${process.env.PG_SCHEMA || 'ftp_app'},public`
});

pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err.message);
});

// ════════════════════════════════════
// SQLite → PostgreSQL COMPATIBILITY
// Converts ? placeholders to $1,$2
// Converts "IS ?" with null to "IS NULL"
// Same interface: getAsync, allAsync, runAsync
// ════════════════════════════════════

function prepareQuery(sql, params = []) {
    let newSql = sql;
    let newParams = [];
    let paramIndex = 0;
    let pgIndex = 0;

    // Split SQL by ? and rebuild with $1, $2 or IS NULL
    const parts = newSql.split('?');
    let result = '';

    for (let i = 0; i < parts.length; i++) {
        result += parts[i];

        if (i < parts.length - 1) {
            const before = parts[i].trimEnd().toUpperCase();
            const value = params[paramIndex];

            // Check if this ? is preceded by "IS" and value is null
            if (before.endsWith('IS') && (value === null || value === undefined)) {
                // Replace "IS ?" with "IS NULL" — don't add param
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

// ─── getAsync: returns single row or null ───
const db = {};

db.getAsync = async function (sql, params = []) {
    const q = prepareQuery(sql, params);
    const result = await pool.query(q.sql, q.params);
    return result.rows[0] || null;
};

// ─── allAsync: returns array of rows ───
db.allAsync = async function (sql, params = []) {
    const q = prepareQuery(sql, params);
    const result = await pool.query(q.sql, q.params);
    return result.rows;
};

// ─── runAsync: returns { lastID, changes } ───
db.runAsync = async function (sql, params = []) {
    const q = prepareQuery(sql, params);
    const result = await pool.query(q.sql, q.params);

    return {
        lastID: result.rows[0]?.id || null,
        changes: result.rowCount || 0
    };
};

// Export pool for direct queries if needed
db.pool = pool;

module.exports = db;
