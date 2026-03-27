const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const passport = require('passport');
const jwt = require('jsonwebtoken');

// ─── GOOGLE SSO ───
router.get('/google',
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback', (req, res, next) => {
    passport.authenticate('google', { session: false }, (err, user, info) => {
        if (err || !user) {
            console.error('Google SSO failed:', err || info);
            return res.redirect('/?error=sso_failed');
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name, avatar: user.avatar || null },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.redirect(`/dashboard.html?token=${token}`);
    })(req, res, next);
});

// ─── MICROSOFT SSO ───
router.get('/microsoft',
    passport.authenticate('microsoft')
);

router.get('/microsoft/callback',
    passport.authenticate('microsoft', {
        session: false,
        failureRedirect: '/?error=sso_failed'
    }),
    (req, res) => {
        const token = jwt.sign(
            { id: req.user.id, email: req.user.email, role: req.user.role, name: req.user.name, avatar: req.user.avatar || null },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
        res.redirect(`/dashboard.html?token=${token}`);
    }
);

// ─── EMAIL/PASSWORD AUTH ───
router.post('/check-user', authController.checkUser);
router.post('/send-otp', authController.sendOTP);
router.post('/verify-signup', authController.verifyOTPAndSignup);
router.post('/login', authController.login);

module.exports = router;
