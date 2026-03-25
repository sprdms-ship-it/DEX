const fs = require("fs");
const path = require("path");

// Decide folder based on file type
const getFileCategory = (file) => {
    const mime = file.mimetype;

    if (mime.startsWith("image")) return "images";
    if (
        mime.includes("pdf") ||
        mime.includes("word") ||
        mime.includes("text")
    ) return "documents";

    return "others";
};

// Ensure user directory exists
const ensureUserDirs = (userId, category) => {
    const basePath = path.join(__dirname, "..", "storage", "users", userId.toString());

    const uploadPath = path.join(basePath, "uploads", category);

    // Create directories recursively
    fs.mkdirSync(uploadPath, { recursive: true });

    return uploadPath;
};

module.exports = {
    getFileCategory,
    ensureUserDirs
};