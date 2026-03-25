const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { OIDCStrategy } = require('passport-azure-ad');
const db = require('../config/db');

require('dotenv').config();

// ─── SESSION HANDLING ───
passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

// ─── DYNAMIC DOMAIN CHECK + USER CREATION ───
// Instead of hardcoded domains, checks the domains table in DB
async function findOrCreateUser(email, name, done) {
    try {
        email = email.toLowerCase();
        const domain = email.split('@')[1];

        // Check if domain is approved in DB
        const domainRow = await db.getAsync(
            `SELECT * FROM domains WHERE name = ? AND is_approved = 1`,
            [domain]
        );

        if (!domainRow) {
            return done(null, false, { message: 'Domain not approved for SSO' });
        }

        // Check if user already exists
        const existingUser = await db.getAsync(
            `SELECT * FROM users WHERE email = ?`,
            [email]
        );

        if (existingUser) {
            return done(null, existingUser);
        }

        // Create new SSO user
        const id = Date.now().toString();
        await db.runAsync(
            `INSERT INTO users (id, name, email, role, domain, is_verified) VALUES (?, ?, ?, ?, ?, ?)`,
            [id, name, email, 'user', domain, 1]
        );

        const newUser = { id, name, email, role: 'user', domain };
        return done(null, newUser);

    } catch (err) {
        console.error('SSO findOrCreateUser error:', err);
        return done(err, null);
    }
}

// ─── GOOGLE SSO ───
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
    },
    async (accessToken, refreshToken, profile, done) => {
        const email = profile.emails[0].value;
        const name = profile.displayName || email.split('@')[0];
        findOrCreateUser(email, name, done);
    }));
}

// ─── MICROSOFT SSO ───
if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_TENANT_ID) {
    passport.use("microsoft",new OIDCStrategy({
        identityMetadata:
            `https://login.microsoftonline.com/${process.env.MICROSOFT_TENANT_ID}/v2.0/.well-known/openid-configuration`,
        clientID: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        responseType: 'code',
        responseMode: 'query',

        // ✅ FIXED (CRITICAL)
        redirectUrl:
            process.env.MICROSOFT_CALLBACK_URL ||
            'http://localhost:3000/auth/microsoft/callback',

        allowHttpForRedirectUrl: true, // ✅ REQUIRED for local dev

        scope: ['profile', 'email']
    },
    async (iss, sub, profile, accessToken, refreshToken, done) => {
        try {
            if (!profile || !profile._json) {
                console.error("Microsoft SSO: No profile received");
                return done(null, false);
            }

            // ✅ ROBUST EMAIL EXTRACTION
            const email =
                profile._json.preferred_username ||
                profile._json.email ||
                profile.emails?.[0]?.value;

            if (!email) {
                console.error("Microsoft SSO: Email not found in profile", profile);
                return done(null, false, { message: "Email not found" });
            }

            const name =
                profile.displayName ||
                profile._json.name ||
                email.split('@')[0];

            // ✅ REUSE YOUR EXISTING LOGIC (GOOD DESIGN)
            return findOrCreateUser(email, name, done);

        } catch (err) {
            console.error("Microsoft SSO error:", err);
            return done(err, null);
        }
    }));
}

module.exports = passport;
