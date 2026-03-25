require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('./config/passport');
const initDB = require('./models/initDB');

const app = express();

// ─── MIDDLEWARE ───
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'sso_secret',
    resave: false,
    saveUninitialized: false, // changed to false — don't create session until something is stored
    cookie: { secure: false }  // set to true in production with HTTPS
}));

app.use(passport.initialize());
app.use(passport.session());

// ─── ROUTES ───
const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/admin', adminRoutes);

// ─── SERVE FRONTEND ───
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── GLOBAL ERROR HANDLER ───
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ message: 'Internal server error' });
});

// ─── START SERVER ───
const PORT = process.env.PORT || 3000;

initDB()
    .then(() => {
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    })
    .catch((err) => {
        console.error('Failed to initialize database:', err);
        process.exit(1);
    });
