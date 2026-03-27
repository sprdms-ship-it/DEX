const API = "/api/files";

// ─── AUTH ───
const urlParams = new URLSearchParams(window.location.search);
const tokenFromSSO = urlParams.get("token");
if (tokenFromSSO) { localStorage.setItem("token", tokenFromSSO); window.location.replace("dashboard.html"); }

const token = localStorage.getItem("token");
if (!token) { window.location.replace("index.html"); }

window.history.pushState(null, null, window.location.href);
window.onpopstate = function () { window.history.pushState(null, null, window.location.href); };

let payload = null;
let userDomain = "";
try {
    payload = JSON.parse(atob(token.split('.')[1]));
    userDomain = payload?.email?.split("@")[1] || "";
    if (payload.exp && payload.exp * 1000 < Date.now()) { localStorage.removeItem("token"); window.location.replace("index.html"); }
    // ─── POPULATE PROFILE WIDGET ───
    const profileName = payload.name || payload.email.split('@')[0];
    const profileEmail = payload.email || '';
    const profileAvatar = payload.avatar || null;

    document.getElementById('profileName').textContent = profileName;
    document.getElementById('profileEmail').textContent = profileEmail;

    const imgEl = document.getElementById('profileAvatarImg');
    const initialEl = document.getElementById('profileAvatarInitial');

    if (profileAvatar) {
        imgEl.src = profileAvatar;
        imgEl.style.display = 'block';
        initialEl.style.display = 'none';
        imgEl.onerror = () => {
            // If image fails to load, fall back to initials
            imgEl.style.display = 'none';
            initialEl.style.display = 'block';
            initialEl.textContent = profileName.charAt(0).toUpperCase();
        };
    } else {
        imgEl.style.display = 'none';
        initialEl.style.display = 'block';
        initialEl.textContent = profileName.charAt(0).toUpperCase();
    }
} catch (e) { localStorage.removeItem("token"); window.location.replace("index.html"); }

// ─── STATE ───
let currentFolder = null;
let folderHistory = [];
let allFiles = [];
let selectedFile = null;
let shareLink = "";
let currentTab = "drive";
let searchQuery = "";
let contextTarget = null;

// ─── TOAST ───
function showToast(msg, type = "info") {
    const c = document.getElementById("toastContainer");
    const t = document.createElement("div");
    t.className = "toast " + type; t.textContent = msg; c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// ─── HELPERS ───
function formatSize(bytes) {
    bytes = parseInt(bytes) || 0;
    if (!bytes) return "—";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
    return (bytes / 1073741824).toFixed(2) + " GB";
}

function formatDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + " min ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function getFileType(name) {
    const ext = name.split(".").pop().toLowerCase();
    const map = {
        pdf: "pdf", doc: "doc", docx: "doc", xls: "xls", xlsx: "xls", csv: "xls",
        ppt: "ppt", pptx: "ppt", txt: "txt",
        jpg: "img", jpeg: "img", png: "img", gif: "img", svg: "img", webp: "img", bmp: "img",
        mp4: "vid", avi: "vid", mov: "vid", mkv: "vid",
        mp3: "mp3", wav: "mp3", aac: "mp3", ogg: "mp3",
        zip: "zip", rar: "zip", tar: "zip", "7z": "zip",
        js: "code", py: "code", html: "code", css: "code", json: "code"
    };
    return map[ext] || "file";
}

function getFileLabel(name) {
    const ext = name.split(".").pop().toUpperCase();
    const map = { pdf: "PDF", doc: "DOC", docx: "DOC", xls: "XLS", xlsx: "XLS", ppt: "PPT", pptx: "PPT", mp3: "MP3", wav: "WAV", mp4: "MP4", zip: "ZIP", rar: "RAR", txt: "TXT", csv: "CSV" };
    return map[name.split(".").pop().toLowerCase()] || ext;
}

function getFileColor(type) {
    const colors = {
        pdf: "#E53935", doc: "#1976D2", xls: "#2E7D32", ppt: "#E65100",
        img: "#00897B", vid: "#6A1B9A", mp3: "#F9A825", zip: "#546E7A",
        txt: "#78909C", code: "#37474F", file: "#90A4AE"
    };
    return colors[type] || "#90A4AE";
}

function getFileBg(type) {
    const bgs = {
        pdf: "#FFEBEE", doc: "#E3F2FD", xls: "#E8F5E9", ppt: "#FFF3E0",
        img: "#E0F2F1", vid: "#F3E5F5", mp3: "#FFFDE7", zip: "#ECEFF1",
        txt: "#ECEFF1", code: "#ECEFF1", file: "#F5F5F5"
    };
    return bgs[type] || "#F5F5F5";
}

// ─── TAB SWITCHING ───
function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll(".sidebar-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    if (tab === "drive") {
        folderHistory = [];
        currentFolder = null;
        fetchFiles(null);
    } else if (tab === "shared") {
        fetchSharedFiles();
    }
}

// ─── FOLDER TREE ───
async function loadFolderTree() {
    try {
        const res = await fetch(API, { headers: { Authorization: "Bearer " + token } });
        if (!res.ok) return;
        const data = await res.json();
        const folders = data.filter(f => f.type === "folder" && !f.parent_id);
        const tree = document.getElementById("folderTree");
        tree.innerHTML = "";
        if (folders.length === 0) {
            tree.innerHTML = '<div class="tree-empty">No folders yet</div>';
            return;
        }
        folders.forEach(f => {
            const item = document.createElement("button");
            item.className = "tree-item";
            item.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" fill="#F9A825" stroke="#F57F17" stroke-width="0.5"/></svg><span>' + f.name + '</span>';
            item.onclick = (e) => { e.stopPropagation(); folderHistory = [{ id: f.id, name: f.name }]; currentFolder = f.id; fetchFiles(f.id); };
            tree.appendChild(item);
        });
        document.getElementById("fileCountBadge").textContent = data.filter(f => f.owner_id === payload.id).length;
    } catch (err) { console.error("loadFolderTree:", err); }
}

// ─── SEARCH ───
let searchTimeout = null;
function handleSearch(query) {
    searchQuery = query.trim();
    clearTimeout(searchTimeout);
    if (!searchQuery) { fetchFiles(currentFolder); return; }
    searchTimeout = setTimeout(async () => {
        try {
            const res = await fetch(API + "/search?q=" + encodeURIComponent(searchQuery), {
                headers: { Authorization: "Bearer " + token }
            });
            if (!res.ok) return;
            allFiles = await res.json();
            allFiles.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
            renderFiles();
        } catch (err) { console.error("search error:", err); }
    }, 300);
}

// ─── BREADCRUMB ───
function updateBreadcrumb() {
    const bc = document.getElementById("breadcrumb");
    bc.innerHTML = "";
    const home = document.createElement("a");
    home.className = "bc-link";
    home.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" stroke-width="1.5"/></svg>';
    home.onclick = () => navigateToRoot();
    bc.appendChild(home);

    folderHistory.forEach((folder, i) => {
        const sep = document.createElement("span");
        sep.className = "bc-sep";
        sep.textContent = "/";
        bc.appendChild(sep);
        const link = document.createElement("a");
        link.className = "bc-link";
        link.textContent = folder.name;
        link.onclick = () => { folderHistory = folderHistory.slice(0, i + 1); currentFolder = folder.id; fetchFiles(folder.id); };
        bc.appendChild(link);
    });
}

function navigateToRoot() {
    folderHistory = [];
    currentFolder = null;
    currentTab = "drive";
    document.querySelectorAll(".sidebar-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === "drive"));
    fetchFiles(null);
}

// ─── FETCH FILES ───
async function fetchFiles(parent_id = null) {
    currentFolder = parent_id;
    updateBreadcrumb();
    let url = API;
    if (parent_id) url += "?parent_id=" + parent_id;
    try {
        const res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
        if (!res.ok) { if (res.status === 401) { localStorage.removeItem("token"); window.location.replace("index.html"); } return; }
        allFiles = await res.json();
        allFiles.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        renderFiles();
        updateStorage();
        loadFolderTree();
    } catch (err) { console.error("fetchFiles:", err); showToast("Failed to load files", "error"); }
}

async function fetchSharedFiles() {
    updateBreadcrumb();
    try {
        const res = await fetch(API, { headers: { Authorization: "Bearer " + token } });
        if (!res.ok) return;
        const data = await res.json();
        allFiles = data.filter(f => f.owner_id !== payload.id);
        allFiles.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        renderFiles();
    } catch (err) { showToast("Failed to load shared files", "error"); }
}

// ─── RENDER FILES ───
function renderFiles() {
    const container = document.getElementById("fileContainer");
    container.innerHTML = "";

    let filtered = allFiles;
    if (searchQuery) {
        filtered = allFiles.filter(f => f.name.toLowerCase().includes(searchQuery));
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg width="56" height="56" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" stroke-width="1"/></svg></div><div class="empty-title">' + (searchQuery ? "No results for \"" + searchQuery + "\"" : (currentTab === "shared" ? "No files shared with you yet" : "This folder is empty")) + '</div><div class="empty-text">' + (currentTab === "shared" ? "Files shared with you will appear here" : "Drag & drop files here or click + to upload") + '</div></div>';
        return;
    }

    const folders = filtered.filter(f => f.type === "folder");
    const files = filtered.filter(f => f.type === "file");

    if (folders.length > 0) {
        const folderSection = document.createElement("div");
        folderSection.className = "section";
        folderSection.innerHTML = '<div class="section-header"><span class="section-title">Folders</span><svg class="section-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>';
        const folderGrid = document.createElement("div");
        folderGrid.className = "folder-grid";
        folders.forEach(item => folderGrid.appendChild(createFolderCard(item)));
        folderSection.appendChild(folderGrid);
        container.appendChild(folderSection);
    }

    if (files.length > 0) {
        const fileSection = document.createElement("div");
        fileSection.className = "section";
        fileSection.innerHTML = '<div class="section-header"><span class="section-title">Files</span><svg class="section-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></div>';
        const fileGrid = document.createElement("div");
        fileGrid.className = "file-grid";
        files.forEach(item => fileGrid.appendChild(createFileCard(item)));
        fileSection.appendChild(fileGrid);
        container.appendChild(fileSection);
    }
}

// ─── FOLDER CARD ───
function createFolderCard(item) {
    const card = document.createElement("div");
    card.className = "folder-card";
    card.onclick = () => { folderHistory.push({ id: item.id, name: item.name }); currentFolder = item.id; fetchFiles(item.id); };
    card.oncontextmenu = (e) => { e.preventDefault(); showContextMenu(e, item); };
    card.innerHTML = '<div class="folder-icon"><svg width="44" height="44" viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" fill="#F9A825" stroke="#F57F17" stroke-width="0.3"/></svg></div><div class="folder-name">' + item.name + '</div><div class="folder-meta">' + formatDate(item.created_at) + '</div>';
    return card;
}

// ─── FILE CARD ───
function createFileCard(item) {
    const card = document.createElement("div");
    card.className = "file-card";
    card.onclick = () => downloadFile(item);
    card.oncontextmenu = (e) => { e.preventDefault(); showContextMenu(e, item); };

    const type = getFileType(item.name);
    const color = getFileColor(type);
    const bg = getFileBg(type);
    const label = getFileLabel(item.name);

    let thumbHTML;
    if (type === "img") {
        thumbHTML = '<div class="file-thumb" style="background:' + bg + '"><svg width="40" height="40" viewBox="0 0 24 24" fill="none"><rect x="2" y="3" width="20" height="18" rx="2" stroke="' + color + '" stroke-width="1.2" fill="' + bg + '"/><circle cx="8" cy="9" r="2" fill="' + color + '" opacity="0.5"/><path d="M2 17l5-5 3 3 4-4 8 6" stroke="' + color + '" stroke-width="1.2" fill="none"/></svg></div>';
    } else {
        thumbHTML = '<div class="file-thumb" style="background:' + bg + '"><div class="file-badge" style="background:' + color + '">' + label + '</div><svg width="40" height="48" viewBox="0 0 40 48" fill="none"><rect x="2" y="2" width="36" height="44" rx="4" fill="white" stroke="#E0E0E0" stroke-width="1"/><rect x="2" y="2" width="36" height="12" rx="4" fill="' + bg + '"/><line x1="10" y1="22" x2="30" y2="22" stroke="#E0E0E0" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="28" x2="26" y2="28" stroke="#E0E0E0" stroke-width="1.5" stroke-linecap="round"/><line x1="10" y1="34" x2="22" y2="34" stroke="#E0E0E0" stroke-width="1.5" stroke-linecap="round"/></svg></div>';
    }

    card.innerHTML = thumbHTML + '<div class="file-info"><div class="file-name">' + item.name + '</div><div class="file-meta">' + formatSize(item.size) + '</div></div>';
    return card;
}

// ─── CONTEXT MENU ───
function showContextMenu(e, item) {
    contextTarget = item;
    const menu = document.getElementById("contextMenu");
    menu.style.display = "block";
    menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + "px";
    menu.style.top = Math.min(e.clientY, window.innerHeight - 140) + "px";
}

function hideContextMenu() { document.getElementById("contextMenu").style.display = "none"; contextTarget = null; }
document.addEventListener("click", hideContextMenu);

// REPLACE these three functions:
function ctxShare() { 
    const target = contextTarget;  // capture before hideContextMenu clears it
    hideContextMenu(); 
    if (target) openShareModal(target); 
}
function ctxDownload() { 
    const target = contextTarget;
    hideContextMenu(); 
    if (target && target.type === "file") downloadFile(target); 
}
function ctxDelete() { 
    const target = contextTarget;
    hideContextMenu(); 
    if (target) deleteFile(target); 
}

// ─── STORAGE ───
function updateStorage() {
    let total = 0;
    allFiles.forEach(f => { if (f.size) total += parseInt(f.size) || 0; });
    const max = 500 * 1024 * 1024;
    const pct = Math.min((total / max) * 100, 100);
    const fill = document.getElementById("storageFill");
    const text = document.getElementById("storageText");
    const pctEl = document.getElementById("storagePct");
    if (fill) fill.style.width = pct.toFixed(1) + "%";
    if (text) text.textContent = formatSize(total) + " of 500 MB";
    if (pctEl) pctEl.textContent = pct.toFixed(0) + "%";
}

// ─── FILE OPERATIONS ───
async function downloadFile(item) {
    try {
        const res = await fetch(API + "/" + item.id + "/download", { headers: { Authorization: "Bearer " + token } });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.downloadUrl) {
            const a = document.createElement("a");
            a.href = data.downloadUrl; a.download = data.name || item.name; a.target = "_blank";
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        }
    } catch (err) { showToast("Download failed", "error"); }
}

function openFolderModal() {
    document.getElementById("folderModal").style.display = "flex";
    document.getElementById("folderNameInput").value = "";
    setTimeout(() => document.getElementById("folderNameInput").focus(), 100);
}

function closeFolderModal() { document.getElementById("folderModal").style.display = "none"; }

async function confirmCreateFolder() {
    const name = document.getElementById("folderNameInput").value.trim();
    if (!name) { showToast("Enter a folder name", "error"); return; }
    closeFolderModal();
    try {
        const res = await fetch(API + "/folder", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({ name: name, parent_id: currentFolder })
        });
        const data = await res.json();
        if (res.ok) { showToast("Folder created", "success"); fetchFiles(currentFolder); }
        else showToast(data.message || "Failed", "error");
    } catch (err) { showToast("Connection error", "error"); }
}

// Keep old createFolder for backwards compat
function createFolder() { openFolderModal(); }

async function uploadFile() {
    const fileInput = document.getElementById("fileInput");
    if (!fileInput.files.length) return;
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    if (currentFolder) formData.append("parent_id", currentFolder);
    showToast("Uploading...", "info");
    try {
        const res = await fetch(API + "/upload", { method: "POST", headers: { Authorization: "Bearer " + token }, body: formData });
        const data = await res.json();
        if (res.ok) { showToast('"' + fileInput.files[0].name + '" uploaded', "success"); fileInput.value = ""; fetchFiles(currentFolder); }
        else showToast(data.message || "Upload failed", "error");
    } catch (err) { showToast("Upload failed", "error"); }
}

async function deleteFile(item) {
    if (!confirm('Delete "' + item.name + '"? This cannot be undone.')) return;
    try {
        const res = await fetch(API + "/" + item.id, { method: "DELETE", headers: { Authorization: "Bearer " + token } });
        const data = await res.json();
        if (res.ok) { showToast('"' + item.name + '" deleted', "success"); fetchFiles(currentFolder); }
        else showToast(data.message || "Delete failed", "error");
    } catch (err) { showToast("Delete failed", "error"); }
}

// ─── SHARE ───
function openShareModal(item) {
    selectedFile = item; shareLink = "";
    document.getElementById("shareFileName").textContent = 'Share "' + item.name + '"';
    document.getElementById("shareEmail").value = "";
    document.getElementById("generalAccess").value = "restricted";
    document.getElementById("shareLinkSection").style.display = "none";
    document.getElementById("shareModal").style.display = "flex";
}

function closeShareModal() { document.getElementById("shareModal").style.display = "none"; }

async function shareWithUser() {
    const email = document.getElementById("shareEmail").value.trim();
    const role = document.getElementById("shareRole").value;
    if (!email) { showToast("Enter an email", "error"); return; }
    try {
        const res = await fetch(API + "/share/user", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
            body: JSON.stringify({ file_id: selectedFile.id, target_email: email, role: role })
        });
        const data = await res.json();
        if (res.ok) { showToast("Shared with " + email, "success"); document.getElementById("shareEmail").value = ""; }
        else showToast(data.message || "Share failed", "error");
    } catch (err) { showToast("Share failed", "error"); }
}

async function updateGeneralAccess() {
    const type = document.getElementById("generalAccess").value;
    if (type === "domain") {
        try {
            const res = await fetch(API + "/share/domain", {
                method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                body: JSON.stringify({ file_id: selectedFile.id, domain: userDomain, role: "viewer" })
            });
            if (res.ok) showToast("Shared with @" + userDomain, "success");
        } catch (err) { showToast("Error", "error"); }
    }
    if (type === "link") {
        try {
            const res = await fetch(API + "/share/link", {
                method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                body: JSON.stringify({ file_id: selectedFile.id, access_type: "view" })
            });
            const data = await res.json();
            if (res.ok) {
                shareLink = data.link;
                document.getElementById("shareLinkDisplay").value = shareLink;
                document.getElementById("shareLinkSection").style.display = "block";
                showToast("Link generated", "success");
            }
        } catch (err) { showToast("Error", "error"); }
    }
    if (type === "restricted") { document.getElementById("shareLinkSection").style.display = "none"; }
}

function copyLink() {
    if (!shareLink) { showToast("Generate a link first", "error"); return; }
    navigator.clipboard.writeText(shareLink).then(() => showToast("Link copied", "success")).catch(() => showToast("Failed to copy", "error"));
}

// ─── DRAG & DROP ───
const mainContent = document.getElementById("mainContent");
if (mainContent) {
    let dragCounter = 0;
    mainContent.addEventListener("dragenter", (e) => { e.preventDefault(); dragCounter++; document.getElementById("dropOverlay").classList.add("visible"); });
    mainContent.addEventListener("dragleave", (e) => { e.preventDefault(); dragCounter--; if (dragCounter === 0) document.getElementById("dropOverlay").classList.remove("visible"); });
    mainContent.addEventListener("dragover", (e) => { e.preventDefault(); });
    mainContent.addEventListener("drop", async (e) => {
        e.preventDefault(); dragCounter = 0;
        document.getElementById("dropOverlay").classList.remove("visible");
        const files = e.dataTransfer.files;
        if (!files.length) return;
        const formData = new FormData();
        formData.append("file", files[0]);
        if (currentFolder) formData.append("parent_id", currentFolder);
        showToast("Uploading...", "info");
        try {
            const res = await fetch(API + "/upload", { method: "POST", headers: { Authorization: "Bearer " + token }, body: formData });
            const data = await res.json();
            if (res.ok) { showToast('"' + files[0].name + '" uploaded', "success"); fetchFiles(currentFolder); }
            else showToast(data.message || "Upload failed", "error");
        } catch (err) { showToast("Upload failed", "error"); }
    });
}

// ─── FAB LONG PRESS FOR NEW FOLDER ───
let fabTimer = null;
const fabBtn = document.getElementById("fabBtn");
if (fabBtn) {
    fabBtn.addEventListener("mousedown", () => { fabTimer = setTimeout(() => { openFolderModal(); fabTimer = null; }, 600); });
    fabBtn.addEventListener("mouseup", () => { if (fabTimer) { clearTimeout(fabTimer); fabTimer = null; } });
    fabBtn.addEventListener("mouseleave", () => { if (fabTimer) { clearTimeout(fabTimer); fabTimer = null; } });
}

function logout() { localStorage.removeItem("token"); window.location.replace("index.html"); }

// ─── INIT ───
fetchFiles();