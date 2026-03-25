const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// ─── CREATE DOMAIN ───
exports.createDomain = async (req, res) => {
    try {
        const { domain } = req.body;
        if (!domain || !domain.includes('.')) {
            return res.status(400).json({ message: 'Valid domain name required (e.g., company.com)' });
        }
        const existing = await db.getAsync(`SELECT * FROM domains WHERE name = ?`, [domain.toLowerCase()]);
        if (existing) {
            return res.status(400).json({ message: 'Domain already exists' });
        }
        await db.runAsync(
            `INSERT INTO domains (id, name, is_approved, created_by) VALUES (?, ?, ?, ?)`,
            [uuidv4(), domain.toLowerCase(), 1, req.user.id]
        );
        res.json({ message: 'Domain added successfully' });
    } catch (err) {
        console.error('createDomain error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── ADD ALLOWED USER ───
exports.addAllowedUser = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ message: 'Valid email required' });
        }
        const normalizedEmail = email.toLowerCase();
        const domain = normalizedEmail.split('@')[1];
        const domainRow = await db.getAsync(`SELECT * FROM domains WHERE name = ?`, [domain]);
        if (!domainRow) {
            return res.status(400).json({ message: `Domain "${domain}" not found. Add the domain first.` });
        }
        const existing = await db.getAsync(`SELECT * FROM allowed_users WHERE email = ?`, [normalizedEmail]);
        if (existing) {
            return res.status(400).json({ message: 'User email already in allowed list' });
        }
        await db.runAsync(
            `INSERT INTO allowed_users (id, email) VALUES (?, ?)`,
            [uuidv4(), normalizedEmail]
        );
        res.json({ message: 'User added to allowed list' });
    } catch (err) {
        console.error('addAllowedUser error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── GET DOMAINS ───
exports.getDomains = async (req, res) => {
    try {
        const rows = await db.allAsync(`SELECT * FROM domains ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) {
        console.error('getDomains error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── GET ALLOWED USERS ───
exports.getUsers = async (req, res) => {
    try {
        const rows = await db.allAsync(`SELECT * FROM allowed_users ORDER BY created_at DESC`);
        res.json(rows);
    } catch (err) {
        console.error('getUsers error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── DELETE DOMAIN ───
exports.deleteDomain = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.runAsync(`DELETE FROM domains WHERE id = ?`, [id]);
        if (result.changes === 0) {
            return res.status(404).json({ message: 'Domain not found' });
        }
        res.json({ message: 'Domain deleted successfully' });
    } catch (err) {
        console.error('deleteDomain error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── DELETE USER ───
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.runAsync(`DELETE FROM allowed_users WHERE id = ?`, [id]);
        if (result.changes === 0) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.json({ message: 'User deleted successfully' });
    } catch (err) {
        console.error('deleteUser error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── TOGGLE DOMAIN APPROVAL ───
exports.toggleDomain = async (req, res) => {
    try {
        const { id } = req.params;
        const domain = await db.getAsync(`SELECT * FROM domains WHERE id = ?`, [id]);
        if (!domain) {
            return res.status(404).json({ message: 'Domain not found' });
        }
        const newStatus = domain.is_approved ? 0 : 1;
        await db.runAsync(`UPDATE domains SET is_approved = ? WHERE id = ?`, [newStatus, id]);
        res.json({
            message: `Domain ${newStatus ? 'approved' : 'disabled'} successfully`,
            is_approved: newStatus
        });
    } catch (err) {
        console.error('toggleDomain error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ════════════════════════════════════
//  NEW: USER ANALYTICS ENDPOINTS
// ════════════════════════════════════

// ─── GET ALL REGISTERED USERS (with storage stats) ───
exports.getRegisteredUsers = async (req, res) => {
    try {
        const users = await db.allAsync(
            `SELECT id, name, email, company, role, domain, created_at FROM users ORDER BY created_at DESC`
        );

        // For each user, get file/folder counts and storage used
        const enriched = [];
        for (const user of users) {
            const stats = await db.getAsync(
                `SELECT 
                    COUNT(*) as total_items,
                    SUM(CASE WHEN type = 'file' THEN 1 ELSE 0 END) as file_count,
                    SUM(CASE WHEN type = 'folder' THEN 1 ELSE 0 END) as folder_count,
                    COALESCE(SUM(CASE WHEN type = 'file' THEN size ELSE 0 END), 0) as storage_used
                 FROM files WHERE owner_id = ?`,
                [user.id]
            );

            enriched.push({
                ...user,
                file_count: stats.file_count || 0,
                folder_count: stats.folder_count || 0,
                total_items: stats.total_items || 0,
                storage_used: stats.storage_used || 0
            });
        }

        res.json(enriched);
    } catch (err) {
        console.error('getRegisteredUsers error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── GET USER DETAIL (files, folders, permissions) ───
exports.getUserDetail = async (req, res) => {
    try {
        const { userId } = req.params;

        // Get user info
        const user = await db.getAsync(
            `SELECT id, name, email, company, role, domain, created_at FROM users WHERE id = ?`,
            [userId]
        );
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Get files/folders owned by user
        const ownedFiles = await db.allAsync(
            `SELECT id, name, type, size, parent_id, created_at FROM files WHERE owner_id = ? ORDER BY created_at DESC`,
            [userId]
        );

        // Get files shared WITH this user (via direct permission)
        const sharedWithUser = await db.allAsync(
            `SELECT f.id, f.name, f.type, f.size, f.created_at, p.role,
                    (SELECT u2.email FROM users u2 WHERE u2.id = f.owner_id) as shared_by
             FROM files f
             INNER JOIN permissions p ON p.file_id = f.id AND p.user_id = ?
             ORDER BY f.created_at DESC`,
            [userId]
        );

        // Get files shared BY this user (permissions they granted)
        const sharedByUser = await db.allAsync(
            `SELECT f.id, f.name, f.type, p.role, p.user_id, p.domain,
                    (SELECT u2.email FROM users u2 WHERE u2.id = p.user_id) as shared_with_email
             FROM permissions p
             INNER JOIN files f ON f.id = p.file_id
             WHERE f.owner_id = ?
             ORDER BY f.name ASC`,
            [userId]
        );

        // Storage stats
        const stats = await db.getAsync(
            `SELECT 
                COUNT(*) as total_items,
                SUM(CASE WHEN type = 'file' THEN 1 ELSE 0 END) as file_count,
                SUM(CASE WHEN type = 'folder' THEN 1 ELSE 0 END) as folder_count,
                COALESCE(SUM(CASE WHEN type = 'file' THEN size ELSE 0 END), 0) as storage_used
             FROM files WHERE owner_id = ?`,
            [userId]
        );

        res.json({
            user,
            stats: {
                file_count: stats.file_count || 0,
                folder_count: stats.folder_count || 0,
                total_items: stats.total_items || 0,
                storage_used: stats.storage_used || 0
            },
            owned_files: ownedFiles,
            shared_with_user: sharedWithUser,
            shared_by_user: sharedByUser
        });

    } catch (err) {
        console.error('getUserDetail error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ════════════════════════════════════
//  ADMIN FILE MANAGEMENT
// ════════════════════════════════════

// ─── ADMIN: DELETE A USER'S FILE/FOLDER ───
async function adminDeleteRecursive(fileId) {
    const file = await db.getAsync(`SELECT * FROM files WHERE id = ?`, [fileId]);
    if (!file) return;

    if (file.type === 'folder') {
        const children = await db.allAsync(`SELECT id FROM files WHERE parent_id = ?`, [fileId]);
        for (const child of children) {
            await adminDeleteRecursive(child.id);
        }
    }

    if (file.type === 'file' && file.path) {
        const absolutePath = path.resolve(path.join(__dirname, '..'), file.path);
        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
        }
    }

    await db.runAsync(`DELETE FROM permissions WHERE file_id = ?`, [fileId]);
    await db.runAsync(`DELETE FROM share_links WHERE file_id = ?`, [fileId]);
    await db.runAsync(`DELETE FROM files WHERE id = ?`, [fileId]);
}

exports.adminDeleteFile = async (req, res) => {
    try {
        const { fileId } = req.params;

        const file = await db.getAsync(`SELECT * FROM files WHERE id = ?`, [fileId]);
        if (!file) {
            return res.status(404).json({ message: 'File not found' });
        }

        await adminDeleteRecursive(fileId);

        res.json({ message: `${file.type === 'folder' ? 'Folder' : 'File'} "${file.name}" deleted by admin` });

    } catch (err) {
        console.error('adminDeleteFile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── ADMIN: CREATE FOLDER IN A USER'S SPACE ───
exports.adminCreateFolder = async (req, res) => {
    try {
        const { userId } = req.params;
        const { name, parent_id } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Folder name required' });
        }

        // Verify user exists
        const user = await db.getAsync(`SELECT id FROM users WHERE id = ?`, [userId]);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // If parent_id given, verify it belongs to this user
        if (parent_id) {
            const parentFolder = await db.getAsync(
                `SELECT * FROM files WHERE id = ? AND type = 'folder' AND owner_id = ?`,
                [parent_id, userId]
            );
            if (!parentFolder) {
                return res.status(400).json({ message: 'Parent folder not found for this user' });
            }
        }

        // Check duplicate
        const duplicate = await db.getAsync(
            `SELECT * FROM files WHERE name = ? AND parent_id IS ? AND owner_id = ? AND type = 'folder'`,
            [name, parent_id || null, userId]
        );
        if (duplicate) {
            return res.status(400).json({ message: 'Folder with this name already exists' });
        }

        const folderId = uuidv4();
        await db.runAsync(
            `INSERT INTO files (id, name, type, parent_id, owner_id) VALUES (?, ?, ?, ?, ?)`,
            [folderId, name, 'folder', parent_id || null, userId]
        );

        res.json({ message: `Folder "${name}" created in user's space`, id: folderId });

    } catch (err) {
        console.error('adminCreateFolder error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── ADMIN: UPLOAD FILE TO A USER'S SPACE ───
exports.adminUploadFile = async (req, res) => {
    try {
        const { userId } = req.params;
        const file = req.file;
        const { parent_id } = req.body;

        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        // Verify user exists
        const user = await db.getAsync(`SELECT id FROM users WHERE id = ?`, [userId]);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // If parent_id given, verify it belongs to this user
        if (parent_id) {
            const parentFolder = await db.getAsync(
                `SELECT * FROM files WHERE id = ? AND type = 'folder' AND owner_id = ?`,
                [parent_id, userId]
            );
            if (!parentFolder) {
                return res.status(400).json({ message: 'Parent folder not found for this user' });
            }
        }

        const fileId = uuidv4();
        const relativePath = path.relative(path.join(__dirname, '..'), file.path);

        await db.runAsync(
            `INSERT INTO files (id, name, path, type, size, parent_id, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [fileId, file.originalname, relativePath, 'file', file.size, parent_id || null, userId]
        );

        res.json({
            message: `File "${file.originalname}" uploaded to user's space`,
            file: { id: fileId, name: file.originalname, size: file.size }
        });

    } catch (err) {
        console.error('adminUploadFile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── ADMIN: GET A USER'S FILES (for browsing their folder structure) ───
exports.adminGetUserFiles = async (req, res) => {
    try {
        const { userId } = req.params;
        const { parent_id } = req.query;

        const files = await db.allAsync(
            `SELECT * FROM files WHERE owner_id = ? AND parent_id IS ? ORDER BY type DESC, created_at DESC`,
            [userId, parent_id || null]
        );

        res.json(files);

    } catch (err) {
        console.error('adminGetUserFiles error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};
