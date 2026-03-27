const express = require('express');
const router = express.Router();

const fileController = require("../controllers/fileController");
const upload = require('../config/multer');
const authMiddleware = require('../middleware/authMiddleware');
const checkFileAccess = require('../middleware/fileAccessMiddleware');


// ─── PUBLIC ROUTE ───
router.get('/public/:token', fileController.accessSharedFile);


// ─── AUTH REQUIRED FOR ALL BELOW ───
router.use(authMiddleware);


// ─── FILE UPLOAD ───
router.post('/upload', (req, res, next) => {
    upload.single('file')(req, res, function (err) {
        if (err) {
            return res.status(400).json({ message: err.message });
        }
        next();
    });
}, fileController.uploadFile);


// ─── FOLDER OPERATIONS ───
router.post('/folder', fileController.createFolder);
router.get('/search', fileController.searchFiles);
router.get('/', fileController.getFiles);


// ─── SHARING ───
router.post('/share/user', fileController.shareWithUser);
router.post('/share/domain', fileController.shareWithDomain);
router.post('/share/link', fileController.createShareLink);


// ─── FILE OPERATIONS ───
router.delete('/:file_id', checkFileAccess('editor'), fileController.deleteFile);
router.put('/:file_id/rename', checkFileAccess('editor'), fileController.renameFile);
router.put('/:file_id/move', checkFileAccess('editor'), fileController.moveFile);
router.get('/:file_id/download', checkFileAccess('viewer'), fileController.downloadFile);


module.exports = router;