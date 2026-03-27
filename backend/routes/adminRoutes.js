const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const upload = require('../config/multer');
const {
    createDomain,
    addAllowedUser,
    getDomains,
    getUsers,
    deleteDomain,
    deleteUser,
    toggleDomain,
    getRegisteredUsers,
    getUserDetail,
    adminDeleteFile,
    adminCreateFolder,
    adminUploadFile,
    adminGetUserFiles,
    updateStorageLimit
} = require('../controllers/adminController');

// All admin routes require auth + admin role
router.use(authMiddleware, adminMiddleware);

// Domains
router.post('/domain', createDomain);
router.get('/domains', getDomains);
router.delete('/domain/:id', deleteDomain);
router.patch('/domain/:id/toggle', toggleDomain);

// Allowed users (whitelist)
router.post('/user', addAllowedUser);
router.get('/users', getUsers);
router.delete('/user/:id', deleteUser);

// User analytics
router.get('/registered-users', getRegisteredUsers);
router.get('/user-detail/:userId', getUserDetail);

// Admin file management
router.get('/user-files/:userId', adminGetUserFiles);
router.post('/user-files/:userId/folder', adminCreateFolder);
router.post('/user-files/:userId/upload', upload.single('file'), adminUploadFile);
router.delete('/file/:fileId', adminDeleteFile);

// Storage limit
router.patch('/user-storage/:userId', updateStorageLimit);

module.exports = router;
