const bucket = require('../config/gcs');
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// ─── UPLOAD FILE ───
exports.uploadFile = async (req, res) => {
    try {
        const file = req.file;
        const user = req.user;
        const { parent_id } = req.body;

        if (!file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        if (parent_id) {
            const parentFolder = await db.getAsync(
                `SELECT * FROM files WHERE id = ? AND type = 'folder' AND owner_id = ?`,
                [parent_id, user.id]
            );
            if (!parentFolder) {
                return res.status(400).json({ message: 'Parent folder not found or not accessible' });
            }
        }

        const fileId = uuidv4();
        const fileName = Date.now() + '-' + file.originalname;
        const gcsPath = ['projects/ftp-dex/users', user.id, 'uploads', fileName].join('/');

        const blob = bucket.file(gcsPath);
        const blobStream = blob.createWriteStream({
            resumable: false,
            contentType: file.mimetype
        });

        blobStream.on('error', (err) => {
            console.error('GCS Upload Error:', err);
            return res.status(500).json({ message: 'Upload failed' });
        });

        blobStream.on('finish', async () => {
            await db.runAsync(
                `INSERT INTO files (id, name, path, type, size, parent_id, owner_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [fileId, file.originalname, gcsPath, 'file', file.size, parent_id || null, user.id]
            );

            res.json({
                message: 'File uploaded successfully',
                file: { id: fileId, name: file.originalname, size: file.size }
            });
        });

        blobStream.end(file.buffer);

    } catch (err) {
        console.error('uploadFile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── CREATE FOLDER ───
exports.createFolder = async (req, res) => {
    try {
        const { name, parent_id } = req.body;
        const user = req.user;

        if (!name) return res.status(400).json({ message: 'Folder name required' });

        const duplicate = await db.getAsync(
            `SELECT * FROM files WHERE name = ? AND parent_id IS ? AND owner_id = ? AND type = 'folder'`,
            [name, parent_id || null, user.id]
        );
        if (duplicate) return res.status(400).json({ message: 'A folder with this name already exists here' });

        const folderId = uuidv4();
        await db.runAsync(
            `INSERT INTO files (id, name, type, parent_id, owner_id) VALUES (?, ?, ?, ?, ?)`,
            [folderId, name, 'folder', parent_id || null, user.id]
        );

        res.json({ message: 'Folder created successfully', id: folderId });
    } catch (err) {
        console.error('createFolder error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── GET FILES ───
exports.getFiles = async (req, res) => {
    try {
        const { parent_id } = req.query;
        const user = req.user;

        const ownFiles = await db.allAsync(
            `SELECT * FROM files WHERE owner_id = ? AND parent_id IS ? ORDER BY type DESC, name ASC`,
            [user.id, parent_id || null]
        );

        const sharedFiles = await db.allAsync(
            `SELECT f.* FROM files f INNER JOIN permissions p ON p.file_id = f.id
             WHERE p.user_id = ? AND f.parent_id IS ? ORDER BY f.type DESC, f.name ASC`,
            [user.id, parent_id || null]
        );

        const userDomain = user.email ? user.email.split('@')[1] : null;
        let domainFiles = [];
        if (userDomain) {
            domainFiles = await db.allAsync(
                `SELECT f.* FROM files f INNER JOIN permissions p ON p.file_id = f.id
                 WHERE p.domain = ? AND f.parent_id IS ? ORDER BY f.type DESC, f.name ASC`,
                [userDomain, parent_id || null]
            );
        }

        const allFiles = [...ownFiles];
        const ids = new Set(allFiles.map(f => f.id));
        for (const file of [...sharedFiles, ...domainFiles]) {
            if (!ids.has(file.id)) { ids.add(file.id); allFiles.push(file); }
        }

        res.json(allFiles);
    } catch (err) {
        console.error('getFiles error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── SHARE WITH USER ───
exports.shareWithUser = async (req, res) => {
    try {
        const { file_id, target_email, role } = req.body;
        const user = req.user;

        if (!file_id || !target_email || !role) return res.status(400).json({ message: 'file_id, target_email, and role are required' });
        if (!['viewer', 'editor'].includes(role)) return res.status(400).json({ message: 'Role must be "viewer" or "editor"' });

        const targetUser = await db.getAsync(`SELECT id, email FROM users WHERE email = ?`, [target_email.toLowerCase()]);
        if (!targetUser) return res.status(404).json({ message: 'User not registered. Cannot share file.' });

        const file = await db.getAsync(`SELECT name FROM files WHERE id = ?`, [file_id]);
        if (!file) return res.status(404).json({ message: 'File not found' });

        const existing = await db.getAsync(`SELECT * FROM permissions WHERE file_id = ? AND user_id = ?`, [file_id, targetUser.id]);
        if (existing) {
            await db.runAsync(`UPDATE permissions SET role = ? WHERE file_id = ? AND user_id = ?`, [role, file_id, targetUser.id]);
        } else {
            await db.runAsync(`INSERT INTO permissions (id, file_id, user_id, role) VALUES (?, ?, ?, ?)`, [uuidv4(), file_id, targetUser.id, role]);
        }

        await sendShareEmail(targetUser.email, file.name, user.email, file_id);
        res.json({ message: 'File shared and email sent' });
    } catch (err) {
        console.error('shareWithUser error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── SHARE WITH DOMAIN ───
exports.shareWithDomain = async (req, res) => {
    try {
        const { file_id, domain, role } = req.body;
        if (!file_id || !domain || !role) return res.status(400).json({ message: 'file_id, domain, and role are required' });
        if (!['viewer', 'editor'].includes(role)) return res.status(400).json({ message: 'Role must be "viewer" or "editor"' });

        const existingDomainUser = await db.getAsync(`SELECT id FROM users WHERE email LIKE ?`, [`%@${domain}`]);
        if (!existingDomainUser) return res.status(404).json({ message: 'No users found with this domain' });

        const existing = await db.getAsync(`SELECT * FROM permissions WHERE file_id = ? AND domain = ?`, [file_id, domain]);
        if (existing) {
            await db.runAsync(`UPDATE permissions SET role = ? WHERE file_id = ? AND domain = ?`, [role, file_id, domain]);
            return res.json({ message: 'Domain permission updated' });
        }

        await db.runAsync(`INSERT INTO permissions (id, file_id, domain, role) VALUES (?, ?, ?, ?)`, [uuidv4(), file_id, domain, role]);
        res.json({ message: 'Shared with domain' });
    } catch (err) {
        console.error('shareWithDomain error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── CREATE SHARE LINK ───
exports.createShareLink = async (req, res) => {
    try {
        const { file_id, access_type } = req.body;
        if (!file_id || !access_type) return res.status(400).json({ message: 'file_id and access_type required' });

        const token = uuidv4();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        await db.runAsync(`INSERT INTO share_links (id, file_id, token, access_type, expires_at) VALUES (?, ?, ?, ?, ?)`,
            [uuidv4(), file_id, token, access_type, expiresAt]);

        const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        res.json({ message: 'Share link created', link: `${appUrl}/api/files/public/${token}`, expires_at: expiresAt });
    } catch (err) {
        console.error('createShareLink error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── ACCESS SHARED FILE VIA LINK ───
exports.accessSharedFile = async (req, res) => {
    try {
        const { token } = req.params;
        const link = await db.getAsync(`SELECT * FROM share_links WHERE token = ?`, [token]);
        if (!link) return res.status(404).json({ message: 'Invalid or expired link' });
        if (link.expires_at && new Date() > new Date(link.expires_at)) {
            return res.status(410).json({ message: 'Link has expired' });
        }

        const file = await db.getAsync(`SELECT * FROM files WHERE id = ?`, [link.file_id]);
        if (!file || file.type !== 'file') {
            return res.status(404).json({ message: 'File not found' });
        }

        const gcsFile = bucket.file(file.path);
        const [exists] = await gcsFile.exists();
        if (!exists) return res.status(404).json({ message: 'File not found in storage' });

        const [signedUrl] = await gcsFile.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000,
            responseDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`
        });

        res.redirect(signedUrl);
    } catch (err) {
        console.error('accessSharedFile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── DELETE FILE/FOLDER (GCS) ───
async function deleteRecursive(fileId) {
    const file = await db.getAsync(`SELECT * FROM files WHERE id = ?`, [fileId]);
    if (!file) return;

    if (file.type === 'folder') {
        const children = await db.allAsync(`SELECT id FROM files WHERE parent_id = ?`, [fileId]);
        for (const child of children) {
            await deleteRecursive(child.id);
        }
    }

    // Delete from GCS
    if (file.type === 'file' && file.path) {
        try {
            await bucket.file(file.path).delete();
        } catch (gcsErr) {
            console.error('GCS delete error (non-fatal):', gcsErr.message);
        }
    }

    await db.runAsync(`DELETE FROM permissions WHERE file_id = ?`, [fileId]);
    await db.runAsync(`DELETE FROM share_links WHERE file_id = ?`, [fileId]);
    await db.runAsync(`DELETE FROM files WHERE id = ?`, [fileId]);
}

exports.deleteFile = async (req, res) => {
    try {
        const { file_id } = req.params;
        const file = await db.getAsync(`SELECT * FROM files WHERE id = ?`, [file_id]);
        if (!file) return res.status(404).json({ message: 'File not found' });
        if (file.owner_id !== req.user.id) return res.status(403).json({ message: 'Only the owner can delete this' });

        await deleteRecursive(file_id);
        res.json({ message: `${file.type === 'folder' ? 'Folder' : 'File'} deleted successfully` });
    } catch (err) {
        console.error('deleteFile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── RENAME ───
exports.renameFile = async (req, res) => {
    try {
        const { file_id } = req.params;
        const { new_name } = req.body;
        if (!new_name) return res.status(400).json({ message: 'New name required' });
        await db.runAsync(`UPDATE files SET name = ? WHERE id = ?`, [new_name, file_id]);
        res.json({ message: 'Renamed successfully' });
    } catch (err) {
        console.error('renameFile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── MOVE ───
exports.moveFile = async (req, res) => {
    try {
        const { file_id } = req.params;
        const { new_parent_id } = req.body;
        if (new_parent_id) {
            let cur = new_parent_id;
            while (cur) {
                if (cur === file_id) return res.status(400).json({ message: 'Cannot move into itself' });
                const p = await db.getAsync(`SELECT parent_id FROM files WHERE id = ?`, [cur]);
                cur = p ? p.parent_id : null;
            }
        }
        await db.runAsync(`UPDATE files SET parent_id = ? WHERE id = ?`, [new_parent_id || null, file_id]);
        res.json({ message: 'Moved successfully' });
    } catch (err) {
        console.error('moveFile error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── DOWNLOAD FILE (GCS Signed URL) ───
exports.downloadFile = async (req, res) => {
    try {
        const { file_id } = req.params;
        console.log('downloadFile called for file_id:', file_id, 'user:', req.user?.id);

        const file = await db.getAsync(`SELECT * FROM files WHERE id = ?`, [file_id]);
        console.log('file found:', file);

        if (!file || file.type !== 'file') {
            return res.status(404).json({ message: 'File not found' });
        }

        // ✅ Normalize backslashes → forward slashes
        const normalizedPath = file.path.replace(/\\/g, '/');
        console.log('normalized GCS path:', normalizedPath);

        const gcsFile = bucket.file(normalizedPath);
        const [exists] = await gcsFile.exists();

        if (!exists) {
            console.error('GCS file not found at path:', normalizedPath);
            return res.status(404).json({ message: 'File not found in storage' });
        }

        const [signedUrl] = await gcsFile.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 15 * 60 * 1000,
            responseDisposition: `attachment; filename="${encodeURIComponent(file.name)}"`
        });

        res.json({ downloadUrl: signedUrl, name: file.name });

    } catch (err) {
        console.error('downloadFile error:', err);
        res.status(500).json({ message: err.message });
    }
};

// ─── SEARCH FILES ───
exports.searchFiles = async (req, res) => {
    try {
        const { q } = req.query;
        const user = req.user;

        if (!q || !q.trim()) {
            return res.json([]);
        }

        const searchTerm = '%' + q.trim().toLowerCase() + '%';

        // Search owned files
        const ownFiles = await db.allAsync(
            `SELECT * FROM files WHERE owner_id = ? AND LOWER(name) LIKE ? ORDER BY type DESC, created_at DESC`,
            [user.id, searchTerm]
        );

        // Search files shared with user
        const sharedFiles = await db.allAsync(
            `SELECT f.* FROM files f
             INNER JOIN permissions p ON p.file_id = f.id
             WHERE p.user_id = ? AND LOWER(f.name) LIKE ?
             ORDER BY f.type DESC, f.created_at DESC`,
            [user.id, searchTerm]
        );

        // Search files shared via domain
        const userDomain = user.email ? user.email.split('@')[1] : null;
        let domainFiles = [];
        if (userDomain) {
            domainFiles = await db.allAsync(
                `SELECT f.* FROM files f
                 INNER JOIN permissions p ON p.file_id = f.id
                 WHERE p.domain = ? AND LOWER(f.name) LIKE ?
                 ORDER BY f.type DESC, f.created_at DESC`,
                [userDomain, searchTerm]
            );
        }

        // Merge and deduplicate
        const allResults = [...ownFiles];
        const ids = new Set(allResults.map(f => f.id));
        for (const file of [...sharedFiles, ...domainFiles]) {
            if (!ids.has(file.id)) { ids.add(file.id); allResults.push(file); }
        }

        res.json(allResults);

    } catch (err) {
        console.error('searchFiles error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── SHARE EMAIL ───
const { sendMail } = require('../utils/mailer');

async function sendShareEmail(toEmail, fileName, sharedBy, fileId) {
    try {
        const subject = `${sharedBy} shared "${fileName}" with you — ONE SPR FTP DEX`;
        const appUrl = process.env.APP_URL || 'http://localhost:3000';
        const link = `${appUrl}/dashboard.html?file=${fileId}`;
        const ext = fileName.split('.').pop().toLowerCase();
        const iconColors = { pdf:'#E53935', doc:'#1976D2', docx:'#1976D2', xls:'#2E7D32', xlsx:'#2E7D32', ppt:'#E65100', pptx:'#E65100', txt:'#546E7A', jpg:'#00897B', png:'#00897B', mp4:'#6A1B9A', zip:'#F57F17' };
        const iconColor = iconColors[ext] || '#455A64';

        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f5f7;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7;padding:40px 0;"><tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
<tr><td style="background-color:#0e1520;padding:28px 36px;text-align:center;">
<table cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr>
<td style="background-color:rgba(255,255,255,0.08);border-radius:8px;padding:8px 10px;vertical-align:middle;">
<img src="https://img.icons8.com/fluency/28/folder-invoices.png" alt="" width="20" height="20" style="display:block;"/></td>
<td style="padding-left:12px;color:#ffffff;font-size:18px;font-weight:600;letter-spacing:0.5px;vertical-align:middle;">ONE SPR FTP DEX</td></tr></table></td></tr>
<tr><td style="padding:36px 36px 20px;">
<p style="margin:0 0 6px;font-size:14px;color:#6b7280;">Shared by</p>
<p style="margin:0 0 28px;font-size:17px;font-weight:600;color:#111827;">${sharedBy}</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fb;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
<tr><td style="padding:20px 24px;"><table cellpadding="0" cellspacing="0" width="100%"><tr>
<td width="48" style="vertical-align:top;"><div style="width:44px;height:44px;background-color:${iconColor}15;border-radius:10px;text-align:center;line-height:44px;"><span style="font-size:22px;color:${iconColor};">&#128196;</span></div></td>
<td style="padding-left:14px;vertical-align:middle;"><p style="margin:0 0 4px;font-size:15px;font-weight:600;color:#111827;word-break:break-word;">${fileName}</p>
<p style="margin:0;font-size:13px;color:#9ca3af;">.${ext.toUpperCase()} file</p></td></tr></table></td></tr></table>
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;"><tr><td align="center">
<a href="${link}" style="display:inline-block;padding:14px 40px;background-color:#0e1520;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Open File</a>
</td></tr></table>
<p style="margin:20px 0 0;font-size:12px;color:#9ca3af;text-align:center;">You'll need to sign in to access this file</p></td></tr>
<tr><td style="padding:0 36px;"><hr style="border:none;border-top:1px solid #f0f0f0;margin:0;"/></td></tr>
<tr><td style="padding:20px 36px 28px;text-align:center;">
<p style="margin:0 0 4px;font-size:12px;color:#c5c9d0;">Secured by SPR Group &bull; Enterprise File Portal</p>
<p style="margin:0;font-size:11px;color:#d1d5db;">Do not reply to this email.</p></td></tr>
</table></td></tr></table></body></html>`;

        await sendMail(toEmail, subject, html);
    } catch (err) {
        console.error('Error sending share email:', err.message);
    }
}
