const db = require('../config/db');

const checkFileAccess = (requiredRole = 'viewer') => {
    return async (req, res, next) => {
        try {
            const user = req.user;
            const file_id = req.params.file_id || req.body.file_id;

            if (!file_id) {
                return res.status(400).json({ message: 'File ID required' });
            }

            // 1. Check if file exists
            const file = await db.getAsync(`SELECT * FROM files WHERE id = ?`, [file_id]);

            if (!file) {
                return res.status(404).json({ message: 'File not found' });
            }

            // 2. Owner has full access
            if (file.owner_id === user.id) {
                return next();
            }

            // 3. Check direct user permission
            const userPerm = await db.getAsync(
                `SELECT * FROM permissions WHERE file_id = ? AND user_id = ?`,
                [file_id, user.id]
            );

            if (userPerm) {
                if (requiredRole === 'editor' && userPerm.role === 'viewer') {
                    return res.status(403).json({ message: 'Insufficient permissions. Editor access required.' });
                }
                return next();
            }

            // 4. Check domain-level permission
            const userDomain = user.email ? user.email.split('@')[1] : null;

            if (userDomain) {
                const domainPerm = await db.getAsync(
                    `SELECT * FROM permissions WHERE file_id = ? AND domain = ?`,
                    [file_id, userDomain]
                );

                if (domainPerm) {
                    if (requiredRole === 'editor' && domainPerm.role === 'viewer') {
                        return res.status(403).json({ message: 'Insufficient permissions. Editor access required.' });
                    }
                    return next();
                }
            }

            return res.status(403).json({ message: 'Access denied' });

        } catch (err) {
            console.error('File access check error:', err);
            return res.status(500).json({ message: 'Server error during access check' });
        }
    };
};

module.exports = checkFileAccess;
