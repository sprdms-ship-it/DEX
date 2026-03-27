const API = "/api/files";

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
    document.getElementById("userBadge").textContent = payload.email || "User";
} catch (e) { localStorage.removeItem("token"); window.location.replace("index.html"); }

let currentFolder = null;
let folderHistory = [];
let selectedFile = null;
let shareLink = "";
let currentView = 'grid';
let currentFilter = 'all';
let currentTab = 'drive';
let allFiles = [];

function showToast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`; t.textContent = msg; c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function getFileIconData(item) {
    if (item.type === 'folder') return { icon: '📁', cls: 'folder' };
    const ext = item.name.split('.').pop().toLowerCase();
    const m = {
        pdf: { icon: '📕', cls: 'pdf' },
        doc: { icon: '📘', cls: 'doc' }, docx: { icon: '📘', cls: 'doc' },
        xls: { icon: '📗', cls: 'sheet' }, xlsx: { icon: '📗', cls: 'sheet' }, csv: { icon: '📊', cls: 'sheet' },
        ppt: { icon: '📙', cls: 'doc' }, pptx: { icon: '📙', cls: 'doc' },
        txt: { icon: '📄', cls: 'default' },
        jpg: { icon: '🖼️', cls: 'image' }, jpeg: { icon: '🖼️', cls: 'image' }, png: { icon: '🖼️', cls: 'image' },
        gif: { icon: '🖼️', cls: 'image' }, svg: { icon: '🖼️', cls: 'image' }, webp: { icon: '🖼️', cls: 'image' },
        mp4: { icon: '🎬', cls: 'media' }, avi: { icon: '🎬', cls: 'media' }, mov: { icon: '🎬', cls: 'media' },
        mp3: { icon: '🎵', cls: 'media' }, wav: { icon: '🎵', cls: 'media' },
        zip: { icon: '📦', cls: 'archive' }, rar: { icon: '📦', cls: 'archive' }, tar: { icon: '📦', cls: 'archive' },
        js: { icon: '⚙️', cls: 'default' }, py: { icon: '🐍', cls: 'default' },
        html: { icon: '🌐', cls: 'default' }, json: { icon: '📋', cls: 'default' }
    };
    return m[ext] || { icon: '📄', cls: 'default' };
}

function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateFull(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 24) {
        return 'You uploaded · ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    }
    return 'You uploaded · ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ─── TAB SWITCHING ───
function switchDriveTab(tab) {
    currentTab = tab;
    document.querySelectorAll('.sidebar-link').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === tab);
    });

    const title = document.getElementById('pageTitle');
    const bc = document.getElementById('breadcrumb');

    if (tab === 'drive') {
        title.textContent = 'My Bucket';
        bc.style.display = folderHistory.length > 0 ? 'flex' : 'none';
        folderHistory = [];
        fetchFiles(null);
    } else if (tab === 'shared') {
        title.textContent = 'Shared with me';
        bc.style.display = 'none';
        fetchSharedFiles();
    } else if (tab === 'recent') {
        title.textContent = 'Recent';
        bc.style.display = 'none';
        fetchRecentFiles();
    }
}

// ─── NAVIGATION ───
function navigateToRoot() {
    folderHistory = [];
    currentTab = 'drive';
    document.querySelectorAll('.sidebar-link').forEach(el => el.classList.toggle('active', el.dataset.tab === 'drive'));
    document.getElementById('pageTitle').textContent = 'My Bucket';
    document.getElementById('breadcrumb').style.display = 'none';
    fetchFiles(null);
}

function goBack() {
    folderHistory.pop();
    const parentId = folderHistory.length > 0 ? folderHistory[folderHistory.length - 1].id : null;
    fetchFiles(parentId, true);
}

function updateBreadcrumb() {
    const bc = document.getElementById("breadcrumb");
    bc.innerHTML = '';

    if (folderHistory.length === 0) {
        bc.style.display = 'none';
        document.getElementById("backBtn").style.display = 'none';
        return;
    }

    bc.style.display = 'flex';

    const root = document.createElement('a');
    root.textContent = 'My Bucket';
    root.onclick = () => navigateToRoot();
    bc.appendChild(root);

    folderHistory.forEach((folder, i) => {
        const sep = document.createElement('span');
        sep.className = 'separator'; sep.textContent = '›'; bc.appendChild(sep);
        const link = document.createElement('a');
        link.textContent = folder.name;
        link.onclick = () => { folderHistory = folderHistory.slice(0, i + 1); fetchFiles(folder.id, true); };
        bc.appendChild(link);
    });

    document.getElementById("backBtn").style.display = 'inline-flex';
}

// ─── VIEW / FILTER ───
function setView(view) {
    currentView = view;
    document.getElementById('viewGrid').classList.toggle('active', view === 'grid');
    document.getElementById('viewList').classList.toggle('active', view === 'list');
    document.getElementById('listHeader').style.display = view === 'list' ? 'grid' : 'none';
    renderFiles();
}

function setFilter(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.filter === filter));
    renderFiles();
}

// ─── NEW MENU ───
function toggleNewMenu() { document.getElementById('newMenu').classList.toggle('open'); }
function closeNewMenu() { document.getElementById('newMenu').classList.remove('open'); }
document.addEventListener('click', (e) => { if (!e.target.closest('#newMenuBtn') && !e.target.closest('#newMenu')) closeNewMenu(); });

// ─── FETCH FILES ───
async function fetchFiles(parent_id = null) {
    currentFolder = parent_id;
    updateBreadcrumb();

    let url = API;
    if (parent_id) url += `?parent_id=${parent_id}`;

    try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { if (res.status === 401) { localStorage.removeItem("token"); window.location.replace("index.html"); } return; }
        allFiles = await res.json();
        allFiles.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        renderFiles();
        updateStorage();
    } catch (err) { console.error("fetchFiles error:", err); showToast("Failed to load files", "error"); }
}

// ─── FETCH SHARED FILES ───
async function fetchSharedFiles() {
    try {
        const res = await fetch(API, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const data = await res.json();
        // Show files where user is NOT the owner (shared with them)
        allFiles = data.filter(f => f.owner_id !== payload.id);
        allFiles.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        renderFiles();
    } catch (err) { showToast("Failed to load shared files", "error"); }
}

// ─── FETCH RECENT FILES ───
async function fetchRecentFiles() {
    try {
        const res = await fetch(API, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        allFiles = await res.json();
        // Recent = all files sorted by date, most recent first
        allFiles.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        renderFiles();
    } catch (err) { showToast("Failed to load recent files", "error"); }
}

// ─── RENDER FILES ───
function renderFiles() {
    const container = document.getElementById("fileContainer");
    container.innerHTML = "";

    const isGrid = currentView === 'grid';
    container.className = isGrid ? 'file-grid' : 'file-list';
    document.getElementById('listHeader').style.display = isGrid ? 'none' : 'grid';

    let filtered = allFiles;
    if (currentFilter === 'folder') filtered = allFiles.filter(f => f.type === 'folder');
    if (currentFilter === 'file') filtered = allFiles.filter(f => f.type === 'file');

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" stroke="currentColor" stroke-width="1.5"/></svg>
                </div>
                <div class="empty-title">${currentFilter === 'all' ? (currentTab === 'shared' ? 'No files shared with you yet' : 'This folder is empty') : 'No ' + currentFilter + 's found'}</div>
                <div class="empty-text">${currentTab === 'shared' ? 'Files shared with you will appear here' : 'Click "New" to upload files or create folders'}</div>
            </div>`;
        return;
    }

    const folders = filtered.filter(f => f.type === 'folder');
    const files = filtered.filter(f => f.type === 'file');

    if (currentFilter === 'all' && folders.length > 0 && files.length > 0) {
        addSectionLabel(container, 'Folders');
        folders.forEach(item => container.appendChild(createCard(item)));
        addSectionLabel(container, 'Files');
        files.forEach(item => container.appendChild(createCard(item)));
    } else {
        filtered.forEach(item => container.appendChild(createCard(item)));
    }
}

function addSectionLabel(container, text) {
    const el = document.createElement('div');
    el.className = 'section-label';
    el.textContent = text;
    container.appendChild(el);
}

// ─── CREATE CARD ───
function createCard(item) {
    const card = document.createElement("div");
    card.className = "file-card";
    const iconData = getFileIconData(item);

    if (item.type === "folder") {
        card.onclick = () => { folderHistory.push({ id: item.id, name: item.name }); fetchFiles(item.id); };
    } else {
        card.onclick = () => downloadFile(item);
    }

    const iconWrap = document.createElement("div");
    iconWrap.className = `file-icon-wrap ${iconData.cls}`;
    iconWrap.textContent = iconData.icon;

    const actions = document.createElement("div");
    actions.className = "file-actions";
    const shareBtn = document.createElement("button");
    shareBtn.className = "btn-icon"; shareBtn.innerHTML = "🔗"; shareBtn.title = "Share";
    shareBtn.onclick = (e) => { e.stopPropagation(); openShareModal(item); };
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-icon"; deleteBtn.innerHTML = "🗑️"; deleteBtn.title = "Delete";
    deleteBtn.onclick = (e) => { e.stopPropagation(); deleteFile(item); };
    actions.appendChild(shareBtn);
    actions.appendChild(deleteBtn);

    if (currentView === 'list') {
        // Grid layout: name-cell | date | size | actions
        const nameCell = document.createElement("div");
        nameCell.className = "file-name-cell";
        const name = document.createElement("div");
        name.className = "file-name";
        name.textContent = item.name;
        nameCell.appendChild(iconWrap);
        nameCell.appendChild(name);

        const dateCell = document.createElement("div");
        dateCell.className = "file-date";
        dateCell.textContent = formatDateFull(item.created_at);

        const sizeCell = document.createElement("div");
        sizeCell.className = "file-size";
        sizeCell.textContent = item.type === 'folder' ? '—' : formatSize(item.size);

        card.appendChild(nameCell);
        card.appendChild(dateCell);
        card.appendChild(sizeCell);
        card.appendChild(actions);
    } else {
        const name = document.createElement("div");
        name.className = "file-name";
        name.textContent = item.name;

        const meta = document.createElement("div");
        meta.className = "file-meta";
        const parts = [];
        if (item.type === 'folder') parts.push('Folder');
        else if (item.size) parts.push(formatSize(item.size));
        if (item.created_at) parts.push(formatDate(item.created_at));
        meta.textContent = parts.join(' · ');

        card.appendChild(actions);
        card.appendChild(iconWrap);
        card.appendChild(name);
        card.appendChild(meta);
    }

    return card;
}

// ─── STORAGE ───
function updateStorage() {
    let total = 0;
    allFiles.forEach(f => { if (f.size) total += parseInt(f.size) || 0; });
    const max = 500 * 1024 * 1024;
    const pct = Math.min((total / max) * 100, 100);
    const fill = document.getElementById('storageFill');
    const text = document.getElementById('storageText');
    if (fill) fill.style.width = pct.toFixed(1) + '%';
    if (text) text.textContent = `${formatSize(total)} of 500 MB used`;
}

// ─── FILE OPERATIONS (unchanged) ───
async function downloadFile(item) {
    try {
        const res = await fetch(`${API}/${item.id}/download`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (data.downloadUrl) {
            const a = document.createElement('a');
            a.href = data.downloadUrl;
            a.download = data.name || item.name;
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } else {
            throw new Error('No download URL');
        }
    } catch (err) { showToast("Download failed", "error"); }
}

async function createFolder() {
    const name = prompt("Enter folder name:");
    if (!name || !name.trim()) return;
    try {
        const res = await fetch(`${API}/folder`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name: name.trim(), parent_id: currentFolder })
        });
        const data = await res.json();
        if (res.ok) { showToast("Folder created", "success"); fetchFiles(currentFolder); }
        else showToast(data.message || "Failed", "error");
    } catch (err) { showToast("Connection error", "error"); }
}

async function uploadFile() {
    const fileInput = document.getElementById("fileInput");
    if (!fileInput.files.length) return;
    const formData = new FormData();
    formData.append("file", fileInput.files[0]);
    if (currentFolder) formData.append("parent_id", currentFolder);
    try {
        const res = await fetch(`${API}/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
        const data = await res.json();
        if (res.ok) { showToast(`"${fileInput.files[0].name}" uploaded`, "success"); fileInput.value = ""; fetchFiles(currentFolder); }
        else showToast(data.message || "Upload failed", "error");
    } catch (err) { showToast("Upload failed", "error"); }
}

async function deleteFile(item) {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`${API}/${item.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (res.ok) { showToast(`"${item.name}" deleted`, "success"); fetchFiles(currentFolder); }
        else showToast(data.message || "Delete failed", "error");
    } catch (err) { showToast("Delete failed", "error"); }
}

// ─── SHARE (unchanged) ───
function openShareModal(item) {
    selectedFile = item; shareLink = "";
    document.getElementById("shareFileName").textContent = `Share "${item.name}"`;
    document.getElementById("shareEmail").value = "";
    document.getElementById("generalAccess").value = "restricted";
    document.getElementById("shareLinkSection").style.display = "none";
    document.getElementById("shareModal").style.display = "block";
}

function closeShareModal(e) {
    if (e && e.target !== document.getElementById("shareModal")) return;
    document.getElementById("shareModal").style.display = "none";
}

async function shareWithUser() {
    const email = document.getElementById("shareEmail").value.trim();
    const role = document.getElementById("shareRole").value;
    if (!email) { showToast("Enter an email", "error"); return; }
    try {
        const res = await fetch(`${API}/share/user`, {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ file_id: selectedFile.id, target_email: email, role })
        });
        const data = await res.json();
        if (res.ok) { showToast(`Shared with ${email}`, "success"); document.getElementById("shareEmail").value = ""; }
        else showToast(data.message || "Share failed", "error");
    } catch (err) { showToast("Share failed", "error"); }
}

async function updateGeneralAccess() {
    const type = document.getElementById("generalAccess").value;
    if (type === "domain") {
        try {
            const res = await fetch(`${API}/share/domain`, {
                method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ file_id: selectedFile.id, domain: userDomain, role: "viewer" })
            });
            if (res.ok) showToast(`Shared with @${userDomain}`, "success");
        } catch (err) { showToast("Error", "error"); }
    }
    if (type === "link") {
        try {
            const res = await fetch(`${API}/share/link`, {
                method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
const dashMain = document.querySelector('.dash-main');
if (dashMain) {
    dashMain.addEventListener('dragover', (e) => { e.preventDefault(); dashMain.classList.add('drag-over'); });
    dashMain.addEventListener('dragleave', () => { dashMain.classList.remove('drag-over'); });
    dashMain.addEventListener('drop', async (e) => {
        e.preventDefault(); dashMain.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (!files.length) return;
        const formData = new FormData();
        formData.append("file", files[0]);
        if (currentFolder) formData.append("parent_id", currentFolder);
        try {
            const res = await fetch(`${API}/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: formData });
            const data = await res.json();
            if (res.ok) { showToast(`"${files[0].name}" uploaded`, "success"); fetchFiles(currentFolder); }
            else showToast(data.message || "Upload failed", "error");
        } catch (err) { showToast("Upload failed", "error"); }
    });
}

function logout() { localStorage.removeItem("token"); window.location.replace("index.html"); }

fetchFiles();
