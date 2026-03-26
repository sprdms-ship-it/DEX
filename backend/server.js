require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const db = require('./config/db');
const initDB = require('./models/initDB');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
    app.set('trust proxy', 1);
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'sso_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: isProd,
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000
    }
}));

// ─── Routes (loaded after db.init) ───
const PORT = process.env.PORT || 3000;

async function start() {
    try {
        // ✅ STEP 1: Initialize Cloud SQL Connector pool FIRST
        await db.init();
        console.log('✅ Database pool ready');
    } catch (err) {
        console.error('❌ Failed to connect to database:', err.message);
        process.exit(1); // Don't start app without DB
    }

    try {
        // ✅ STEP 2: Initialize tables
        await initDB();
        console.log('✅ Database initialized');
    } catch (err) {
        console.error('⚠️ DB init failed (tables may already exist):', err.message);
    }

    // ✅ STEP 3: Load passport AFTER db is ready
    const passport = require('./config/passport');
    app.use(passport.initialize());
    app.use(passport.session());

    // ✅ STEP 4: Mount routes
    const authRoutes = require('./routes/authRoutes');
    const fileRoutes = require('./routes/fileRoutes');
    const adminRoutes = require('./routes/adminRoutes');

    app.use('/auth', authRoutes);
    app.use('/api/files', fileRoutes);
    app.use('/api/admin', adminRoutes);

    app.use(express.static(path.join(__dirname, '../frontend')));

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    });

    app.get('/health', (req, res) => {
        res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    app.use((err, req, res, next) => {
        console.error('Unhandled error:', err);
        res.status(500).json({ message: 'Internal server error' });
    });

    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
}

start();
