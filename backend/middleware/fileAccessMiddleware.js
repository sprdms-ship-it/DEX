const db = require('../config/db');

const checkFileAccess = (requiredRole = 'viewer') => {
    return async (req, res, next) => {
        try {
            const user = req.user;
            const file_id = req.params.file_id || req.body.file_id;

            console.log(`[checkFileAccess] file_id=${file_id} user=${user?.id} role_required=${requiredRole}`);

            if (!file_id) return res.status(400).json({ message: 'File ID required' });

            const file = await db.getAsync(`SELECT * FROM files WHERE id = ?`, [file_id]);
            console.log(`[checkFileAccess] file found:`, file ? file.name : 'NOT FOUND');

            if (!file) return res.status(404).json({ message: 'File not found' });

            if (file.owner_id === user.id) return next();

            const userPerm = await db.getAsync(
                `SELECT * FROM permissions WHERE file_id = ? AND user_id = ?`,
                [file_id, user.id]
            );
            console.log(`[checkFileAccess] userPerm:`, userPerm);

            if (userPerm) {
                if (requiredRole === 'editor' && userPerm.role === 'viewer') {
                    return res.status(403).json({ message: 'Insufficient permissions. Editor access required.' });
                }
                return next();
            }

            const userDomain = user.email ? user.email.split('@')[1] : null;
            if (userDomain) {
                const domainPerm = await db.getAsync(
                    `SELECT * FROM permissions WHERE file_id = ? AND domain = ?`,
                    [file_id, userDomain]
                );
                console.log(`[checkFileAccess] domainPerm:`, domainPerm);

                if (domainPerm) {
                    if (requiredRole === 'editor' && domainPerm.role === 'viewer') {
                        return res.status(403).json({ message: 'Insufficient permissions. Editor access required.' });
                    }
                    return next();
                }
            }

            return res.status(403).json({ message: 'Access denied' });

        } catch (err) {
            console.error('[checkFileAccess] error:', err);
            return res.status(500).json({ message: 'Server error during access check' });
        }
    };
};


module.exports = checkFileAccess;
