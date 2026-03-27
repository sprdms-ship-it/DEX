const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { generateOTP, sendOtpEmail } = require('../utils/otp');

// ─── SEND OTP ───
exports.sendOTP = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email required' });
        }

        const domain = email.split('@')[1];

        // Check domain is allowed
        const domainRow = await db.getAsync(
            `SELECT * FROM domains WHERE name = ?`, [domain]
        );
        if (!domainRow) {
            return res.status(400).json({ message: 'Domain not allowed. Contact admin.' });
        }

        // Check user is in allowed_users list
        const allowedUser = await db.getAsync(
            `SELECT * FROM allowed_users WHERE email = ?`, [email]
        );
        if (!allowedUser) {
            return res.status(403).json({ message: 'User not allowed. Contact admin to add your email.' });
        }

        const recentOtp = await db.getAsync(
        `SELECT * FROM otps WHERE email = ? ORDER BY expires_at DESC LIMIT 1`,
        [email]
        );

        if (recentOtp && new Date(recentOtp.expires_at) > new Date()) {
            return res.status(429).json({
                message: 'OTP already sent. Please wait before requesting again.'
            });
        }

        // Generate and store OTP
        const otp = generateOTP();
        const expiresAt = new Date(Date.now() + 2 * 60 * 1000).toISOString();

        await db.runAsync(
            `INSERT INTO otps (id, email, otp, expires_at) VALUES (?, ?, ?, ?)`,
            [uuidv4(), email, otp, expiresAt]
        );

        // Actually send the OTP via email
        try {
            await sendOtpEmail(email, otp);
            console.log(`OTP sent to ${email}`);
        } catch (mailErr) {
            console.error('Email sending failed:', mailErr.message);
            // Still return success — OTP is in DB, log it for dev
            console.log(`[DEV] OTP for ${email}: ${otp}`);
        }

        res.json({ message: 'OTP sent successfully' });

    } catch (err) {
        console.error('sendOTP error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── VERIFY OTP + SIGNUP ───
exports.verifyOTPAndSignup = async (req, res) => {
    try {
        const { name, email, company, mobile, password, otp } = req.body;

        if (!name || !email || !company || !mobile || !password || !otp) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const normalizedEmail = email.toLowerCase();
        const domain = normalizedEmail.split('@')[1];

        console.log("Verifying OTP for:", normalizedEmail);

        // ✅ CHECK APPROVED DOMAIN
        const domainRow = await db.getAsync(
            `SELECT * FROM domains WHERE name = ? AND is_approved = 1`,
            [domain]
        );

        if (!domainRow) {
            return res.status(400).json({ message: 'Domain not approved' });
        }

        // ✅ CHECK ALLOWED USER
        const allowedUser = await db.getAsync(
            `SELECT * FROM allowed_users WHERE email = ?`,
            [normalizedEmail]
        );

        if (!allowedUser) {
            return res.status(403).json({ message: 'User not authorized by admin' });
        }

        // ✅ CHECK EXISTING USER
        const existingUser = await db.getAsync(
            `SELECT * FROM users WHERE email = ?`,
            [normalizedEmail]
        );

        if (existingUser) {
            return res.status(400).json({ message: 'User already registered. Please log in.' });
        }

        // ✅ FETCH LATEST OTP
        const otpRow = await db.getAsync(
            `SELECT * FROM otps WHERE email = ? ORDER BY expires_at DESC LIMIT 1`,
            [normalizedEmail]
        );

        if (!otpRow) {
            return res.status(400).json({ message: 'No OTP found. Please request a new one.' });
        }

        // ✅ STRICT STRING COMPARISON
        if (String(otpRow.otp) !== String(otp)) {
            return res.status(400).json({ message: 'Invalid OTP' });
        }

        // ✅ EXPIRY CHECK
        if (new Date() > new Date(otpRow.expires_at)) {
            return res.status(400).json({ message: 'OTP expired. Please request a new one.' });
        }

        // ✅ DELETE OTP IMMEDIATELY (prevents reuse)
        await db.runAsync(`DELETE FROM otps WHERE email = ?`, [normalizedEmail]);

        // ✅ PASSWORD VALIDATION
        const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&]).{8,}$/;
        if (!passwordRegex.test(password)) {
            return res.status(400).json({
                message: 'Password must be at least 8 characters with an uppercase letter, a number, and a special character'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userId = uuidv4();

        // ✅ INSERT USER
        await db.runAsync(
            `INSERT INTO users (id, name, email, password, company, mobile, is_verified, role, domain)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, name, normalizedEmail, hashedPassword, company, mobile, 1, 'user', domain]
        );

        // ✅ GENERATE TOKEN
        const token = jwt.sign(
            { id: userId, email: normalizedEmail, role: 'user', name: name, avatar: null },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ message: 'Signup successful', token });

    } catch (err) {
        console.error('verifyOTPAndSignup error:', err);

        if (err.message && err.message.includes('UNIQUE constraint')) {
            return res.status(400).json({ message: 'User already exists' });
        }

        res.status(500).json({ message: 'Server error' });
    }
};

// ─── LOGIN ───
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const user = await db.getAsync(
            `SELECT * FROM users WHERE email = ?`, [email]
        );

        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        if (!user.password) {
            return res.status(400).json({ message: 'This account uses SSO login. Please use Google or Microsoft sign-in.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, role: user.role, name: user.name, avatar: user.avatar || null },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({ message: 'Login successful', token });

    } catch (err) {
        console.error('login error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── CHECK USER EXISTS ───
exports.checkUser = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email required' });
        }

        const domain = email.split('@')[1];

        // Check domain
        const domainRow = await db.getAsync(
            `SELECT * FROM domains WHERE name = ?`, [domain]
        );
        if (!domainRow) {
            return res.json({ status: 'invalid_domain' });
        }

        // Check existing user
        const user = await db.getAsync(
            `SELECT * FROM users WHERE email = ?`, [email]
        );
        if (user) {
            return res.json({ status: 'existing_user' });
        }

        // Check allowed users
        const allowed = await db.getAsync(
            `SELECT * FROM allowed_users WHERE email = ?`, [email]
        );
        if (allowed) {
            return res.json({ status: 'new_user' });
        }

        return res.json({ status: 'not_allowed' });

    } catch (err) {
        console.error('checkUser error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
