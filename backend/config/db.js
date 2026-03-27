const { Pool } = require('pg');
const { Connector, IpAddressTypes } = require('@google-cloud/cloud-sql-connector');
const { GoogleAuth } = require('google-auth-library');

// ════════════════════════════════════
// CLOUD SQL CONNECTOR SETUP
// ════════════════════════════════════

let pool;

async function createPool() {
    // ─── Load service account credentials from Base64 env var ───
    const credentialsJSON = JSON.parse(
        Buffer.from(process.env.GCS_CREDENTIALS_BASE64, 'base64').toString('utf-8')
    );

    const auth = new GoogleAuth({
        credentials: credentialsJSON,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const connector = new Connector({ auth });

    const clientOpts = await connector.getOptions({
        instanceConnectionName: process.env.CLOUD_SQL_INSTANCE,   // e.g. spr-group-apps:asia-south1:spr-groupapps-pg
        ipType: IpAddressTypes.PUBLIC,
    });

    pool = new Pool({
        ...clientOpts,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DATABASE,
        options: `-c search_path=${process.env.PG_SCHEMA || 'ftp_app'},public`,
        max: 5,
    });

    pool.on('connect', () => {
        console.log('✅ Connected to Cloud SQL via Connector');
    });

    pool.on('error', (err) => {
        console.error('❌ PostgreSQL pool error:', err.message);
    });

    return pool;
}

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

            // Only treat as IS NULL if value is actually null/undefined
            // AND the preceding keyword is exactly IS (not LIKE, =, etc.)
            const lastWord = before.split(/\s+/).filter(Boolean).pop();
            
            if (lastWord === 'IS' && (value === null || value === undefined)) {
                result += 'NULL';
                // Don't push to newParams, don't increment pgIndex
            } else if (lastWord === 'IS' && value !== null && value !== undefined) {
                // IS with a real value — use IS NOT DISTINCT FROM for PG null-safe compare
                pgIndex++;
                result += `NOT DISTINCT FROM $${pgIndex}`;
                newParams.push(value);
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

// ════════════════════════════════════
// DB INTERFACE
// ════════════════════════════════════

const db = {};

// Called once from server.js before anything else
db.init = async function () {
    pool = await createPool();
    db.pool = pool;
};

db.getAsync = async function (sql, params = []) {
    const q = prepareQuery(sql, params);
    const result = await pool.query(q.sql, q.params);
    return result.rows[0] || null;
};

db.allAsync = async function (sql, params = []) {
    const q = prepareQuery(sql, params);
    const result = await pool.query(q.sql, q.params);
    return result.rows;
};

db.runAsync = async function (sql, params = []) {
    const q = prepareQuery(sql, params);
    const result = await pool.query(q.sql, q.params);
    return {
        lastID: result.rows[0]?.id || null,
        changes: result.rowCount || 0
    };
};

module.exports = db;