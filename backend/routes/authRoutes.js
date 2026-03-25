const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const passport = require('passport');
const jwt = require('jsonwebtoken');

// ─── GOOGLE SSO ───
router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

// TEMPORARY DEBUG - remove after fixing
router.get('/google/debug', (req, res) => {
    res.json({
        clientID: process.env.GOOGLE_CLIENT_ID ? '✅ Set (' + process.env.GOOGLE_CLIENT_ID.substring(0, 15) + '...)' : '❌ MISSING',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ? '✅ Set' : '❌ MISSING',
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
        jwtSecret: process.env.JWT_SECRET ? '✅ Set' : '❌ MISSING'
    });
});

router.get('/google/callback', (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user, info) => {
        console.log('Google SSO Error:', err);
        console.log('Google SSO User:', user);
        console.log('Google SSO Info:', info);

        if (err || !user) {
            return res.redirect('/?error=sso_failed');
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.redirect(`/dashboard.html?token=${token}`);
    })(req, res, next);
});

// ─── MICROSOFT SSO ───
// 🔹 Start Microsoft login
router.get(
  "/microsoft",
  passport.authenticate("microsoft")
);

// 🔹 Microsoft callback (THIS IS WHAT YOU'RE MISSING)
router.get(
  "/microsoft/callback",
  passport.authenticate("microsoft", {
    session: false,
    failureRedirect: "/login.html?error=sso_failed",
  }),
  (req, res) => {
    const user = req.user;

    const jwt = require("jsonwebtoken");

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.redirect(`/success.html?token=${token}`);
  }
);

// ─── EMAIL/PASSWORD AUTH ───
router.post('/check-user', authController.checkUser);
router.post('/send-otp', authController.sendOTP);
router.post('/verify-signup', authController.verifyOTPAndSignup);
router.post('/login', authController.login);

module.exports = router;
