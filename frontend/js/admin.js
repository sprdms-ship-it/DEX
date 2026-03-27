const API = "/api/admin";
const token = localStorage.getItem("token");

if (!token) { window.location.replace("index.html"); }

let payload = null;
try {
    payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.role !== 'admin') { alert("Access denied"); window.location.replace("dashboard.html"); }
    if (payload.exp && payload.exp * 1000 < Date.now()) { localStorage.removeItem("token"); window.location.replace("index.html"); }
    document.getElementById("userBadge").textContent = payload.email || "Admin";
} catch (e) { localStorage.removeItem("token"); window.location.replace("index.html"); }

window.history.pushState(null, null, window.location.href);
window.onpopstate = function () { window.history.pushState(null, null, window.location.href); };

// ─── STATE ───
let currentDetailUserId = null;
let adminBrowseHistory = [];

// ─── HELPERS ───
function showToast(msg, type = 'info') {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`; t.textContent = msg; c.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function formatSize(bytes) {
    if (!bytes) return '0 B';
    bytes = parseInt(bytes);
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(2) + ' GB';
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) +
        ' ' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name, email) {
    if (name && name.trim()) { const p = name.trim().split(' '); return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase(); }
    return email ? email[0].toUpperCase() : '?';
}

function getFileIcon(name, type) {
    if (type === 'folder') return '📁';
    const ext = (name || '').split('.').pop().toLowerCase();
    const m = { pdf:'📕', doc:'📘', docx:'📘', xls:'📗', xlsx:'📗', ppt:'📙', pptx:'📙', txt:'📄', csv:'📊', jpg:'🖼️', jpeg:'🖼️', png:'🖼️', gif:'🖼️', mp4:'🎬', mp3:'🎵', zip:'📦', rar:'📦', js:'⚙️', html:'🌐', json:'📋' };
    return m[ext] || '📄';
}

// ─── TAB SWITCHING ───
function switchAdminTab(tab) {
    document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    if (tab === 'analytics') fetchRegisteredUsers();
}

// ════════════════════════════════════
//  DOMAINS
// ════════════════════════════════════
async function addDomain() {
    const input = document.getElementById("domainInput");
    const domain = input.value.trim();
    if (!domain) { showToast("Enter a domain name", "error"); return; }
    try {
        const res = await fetch(`${API}/domain`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ domain }) });
        const data = await res.json();
        if (res.ok) { showToast("Domain added", "success"); input.value = ""; fetchDomains(); }
        else showToast(data.message || "Failed", "error");
    } catch (err) { showToast("Connection error", "error"); }
}

async function fetchDomains() {
    try {
        const res = await fetch(`${API}/domains`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const list = document.getElementById("domainList");
        list.innerHTML = "";
        if (data.length === 0) { list.innerHTML = '<li style="color:var(--text-muted);justify-content:center;border:none;">No domains added yet</li>'; return; }
        data.forEach(d => {
            const li = document.createElement("li");
            const info = document.createElement("div"); info.className = "item-info";
            const name = document.createElement("span"); name.textContent = d.name;
            const badge = document.createElement("span"); badge.className = `status-badge ${d.is_approved ? 'approved' : 'pending'}`; badge.textContent = d.is_approved ? 'Approved' : 'Disabled';
            info.appendChild(name); info.appendChild(badge);
            const actions = document.createElement("div"); actions.className = "item-actions";
            const toggleBtn = document.createElement("button"); toggleBtn.className = "btn btn-sm"; toggleBtn.textContent = d.is_approved ? "Disable" : "Approve";
            toggleBtn.onclick = async () => { await fetch(`${API}/domain/${d.id}/toggle`, { method: "PATCH", headers: { Authorization: `Bearer ${token}` } }); fetchDomains(); };
            const deleteBtn = document.createElement("button"); deleteBtn.className = "btn btn-danger btn-sm"; deleteBtn.textContent = "Delete";
            deleteBtn.onclick = () => openConfirmModal(`Delete domain "${d.name}"?`, async () => {
                const r = await fetch(`${API}/domain/${d.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                if (r.ok) { showToast("Domain deleted", "success"); fetchDomains(); }
            });
            actions.appendChild(toggleBtn); actions.appendChild(deleteBtn);
            li.appendChild(info); li.appendChild(actions); list.appendChild(li);
        });
    } catch (err) { showToast("Failed to load domains", "error"); }
}

// ════════════════════════════════════
//  ALLOWED USERS
// ════════════════════════════════════
async function addUser() {
    const input = document.getElementById("userEmail");
    const email = input.value.trim();
    if (!email || !email.includes('@')) { showToast("Enter a valid email", "error"); return; }
    try {
        const res = await fetch(`${API}/user`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ email }) });
        const data = await res.json();
        if (res.ok) { showToast("User added", "success"); input.value = ""; fetchUsers(); }
        else showToast(data.message || "Failed", "error");
    } catch (err) { showToast("Connection error", "error"); }
}

async function fetchUsers() {
    try {
        const res = await fetch(`${API}/users`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const data = await res.json();
        const list = document.getElementById("userList");
        list.innerHTML = "";
        if (data.length === 0) { list.innerHTML = '<li style="color:var(--text-muted);justify-content:center;border:none;">No users added yet</li>'; return; }
        data.forEach(u => {
            const li = document.createElement("li");
            const info = document.createElement("div"); info.className = "item-info"; info.textContent = u.email;
            const actions = document.createElement("div"); actions.className = "item-actions";
            const deleteBtn = document.createElement("button"); deleteBtn.className = "btn btn-danger btn-sm"; deleteBtn.textContent = "Delete";
            deleteBtn.onclick = () => openConfirmModal(`Remove user "${u.email}"?`, async () => {
                const r = await fetch(`${API}/user/${u.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
                if (r.ok) { showToast("User removed", "success"); fetchUsers(); }
            });
            actions.appendChild(deleteBtn); li.appendChild(info); li.appendChild(actions); list.appendChild(li);
        });
    } catch (err) { showToast("Failed to load users", "error"); }
}

// ════════════════════════════════════
//  USER ANALYTICS
// ════════════════════════════════════
async function fetchRegisteredUsers() {
    try {
        const res = await fetch(`${API}/registered-users`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const users = await res.json();
        let totalFiles = 0, totalFolders = 0, totalStorage = 0;
        users.forEach(u => {
            u.file_count = parseInt(u.file_count) || 0;
            u.folder_count = parseInt(u.folder_count) || 0;
            u.storage_used = parseInt(u.storage_used) || 0;
            totalFiles += u.file_count;
            totalFolders += u.folder_count;
            totalStorage += u.storage_used;
        });
        document.getElementById('statTotalUsers').textContent = users.length;
        document.getElementById('statTotalFiles').textContent = totalFiles;
        document.getElementById('statTotalFolders').textContent = totalFolders;
        document.getElementById('statTotalStorage').textContent = formatSize(totalStorage);

        const tbody = document.getElementById('userAnalyticsBody');
        tbody.innerHTML = '';
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:32px;">No registered users</td></tr>';
            return;
        }
        users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><div class="user-cell"><div class="user-avatar">${getInitials(u.name, u.email)}</div><div><div class="user-cell-name">${u.name || '—'}</div><div class="user-cell-email">${u.email}</div></div></div></td>
                <td>${u.domain || '—'}</td>
                <td>${u.file_count}</td>
                <td>${u.folder_count}</td>
                <td><div class="storage-bar-mini"><div class="storage-bar-track"><div class="fill" style="width:${Math.min((u.storage_used / ((parseInt(u.storage_limit) || 524288000))) * 100, 100).toFixed(1)}%"></div></div><span style="font-size:12px;color:var(--text-muted);">${formatSize(u.storage_used)} / ${formatSize(parseInt(u.storage_limit) || 524288000)}</span></div></td>
                <td style="font-size:13px;color:var(--text-muted);">${formatDate(u.created_at)}</td>
                <td><button class="view-detail-btn" onclick="openUserDetail('${u.id}')">View</button></td>`;
            tbody.appendChild(tr);
        });
    } catch (err) { console.error(err); showToast("Failed to load analytics", "error"); }
}

// ════════════════════════════════════
//  USER DETAIL MODAL
// ════════════════════════════════════
async function openUserDetail(userId) {
    currentDetailUserId = userId;
    adminBrowseHistory = [];
    try {
        const res = await fetch(`${API}/user-detail/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const data = await res.json();

        document.getElementById('detailUserName').textContent = data.user.name || data.user.email;
        document.getElementById('detailUserInfo').innerHTML = `
            <div class="detail-avatar">${getInitials(data.user.name, data.user.email)}</div>
            <div>
                <div class="detail-name">${data.user.name || '—'}</div>
                <div class="detail-email">${data.user.email}</div>
                <div class="detail-meta">${data.user.company || ''} ${data.user.company ? '·' : ''} ${data.user.domain || ''} · Joined ${formatDate(data.user.created_at)}</div>
            </div>`;

        const userLimit = parseInt(data.user.storage_limit) || 524288000;
        const userUsed = parseInt(data.stats.storage_used) || 0;
        document.getElementById('detailStats').innerHTML = `
            <div class="detail-stat"><div class="detail-stat-value">${parseInt(data.stats.file_count) || 0}</div><div class="detail-stat-label">Files</div></div>
            <div class="detail-stat"><div class="detail-stat-value">${parseInt(data.stats.folder_count) || 0}</div><div class="detail-stat-label">Folders</div></div>
            <div class="detail-stat"><div class="detail-stat-value">${formatSize(userUsed)}</div><div class="detail-stat-label">Storage</div></div>
            <div class="detail-stat"><div class="detail-stat-value">${data.shared_by_user.length}</div><div class="detail-stat-label">Shared</div></div>`;

        document.getElementById('storageLimitInput').value = Math.round(userLimit / (1024 * 1024));
        document.getElementById('storageLimitInfo').textContent = `Using ${formatSize(userUsed)} of ${formatSize(userLimit)}`;

        renderDetailList('detailOwnedList', data.owned_files, 'owned');
        renderDetailList('detailSharedWithList', data.shared_with_user, 'shared-with');
        renderDetailList('detailSharedByList', data.shared_by_user, 'shared-by');

        adminBrowseFiles(null);
        switchDetailTab('owned');
        document.getElementById('userDetailModal').style.display = 'block';
    } catch (err) { console.error(err); showToast("Failed to load user details", "error"); }
}

function renderDetailList(containerId, items, mode) {
    const el = document.getElementById(containerId);
    if (!items || items.length === 0) {
        el.innerHTML = `<div class="detail-empty">No ${mode === 'owned' ? 'files or folders' : 'shared files'} found</div>`;
        return;
    }
    el.innerHTML = '';
    items.forEach(item => {
        const row = document.createElement('div'); row.className = 'detail-file-row';
        const icon = document.createElement('div'); icon.className = 'detail-file-icon'; icon.textContent = getFileIcon(item.name, item.type);
        const name = document.createElement('div'); name.className = 'detail-file-name'; name.textContent = item.name;
        row.appendChild(icon); row.appendChild(name);

        if (mode === 'owned') {
            const meta = document.createElement('div'); meta.className = 'detail-file-meta'; meta.textContent = item.type === 'file' ? formatSize(item.size) : 'Folder';
            row.appendChild(meta);
            const del = document.createElement('button'); del.className = 'admin-del-btn'; del.textContent = 'Delete';
            del.onclick = () => openConfirmModal(`Admin delete "${item.name}"?`, async () => {
                const r = await fetch(`${API}/file/${item.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                if (r.ok) { showToast('Deleted', 'success'); openUserDetail(currentDetailUserId); }
                else showToast('Failed', 'error');
            });
            row.appendChild(del);
        }

        if (mode === 'shared-with') {
            const by = document.createElement('div'); by.className = 'detail-file-meta'; by.textContent = item.shared_by || '';
            const badge = document.createElement('span'); badge.className = `detail-file-badge ${item.role}`; badge.textContent = item.role;
            row.appendChild(by); row.appendChild(badge);
        }

        if (mode === 'shared-by') {
            const w = document.createElement('div'); w.className = 'detail-file-meta'; w.textContent = item.shared_with_email || item.domain || '—';
            const badge = document.createElement('span'); badge.className = `detail-file-badge ${item.role}`; badge.textContent = item.role;
            row.appendChild(w); row.appendChild(badge);
        }

        el.appendChild(row);
    });
}

// ════════════════════════════════════
//  DOWNLOAD LOGS TAB
// ════════════════════════════════════
async function loadUserDownloads(userId) {
    const el = document.getElementById('detailDownloadsList');
    el.innerHTML = '<div class="detail-empty">Loading...</div>';
    try {
        const res = await fetch(`${API}/user-downloads/${userId}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const logs = await res.json();

        document.getElementById('downloadCountBadge').textContent = logs.length;

        if (logs.length === 0) {
            el.innerHTML = '<div class="detail-empty">This user has not downloaded any files yet.</div>';
            return;
        }

        el.innerHTML = '';

        const totalBytes = logs.reduce((sum, l) => sum + (parseInt(l.file_size) || 0), 0);
        const summary = document.createElement('div');
        summary.className = 'download-summary';
        summary.innerHTML = `
            <div class="download-summary-item">
                <span class="download-summary-value">${logs.length}</span>
                <span class="download-summary-label">Total Downloads</span>
            </div>
            <div class="download-summary-item">
                <span class="download-summary-value">${formatSize(totalBytes)}</span>
                <span class="download-summary-label">Data Transferred</span>
            </div>
            <div class="download-summary-item">
                <span class="download-summary-value">${formatDateTime(logs[0].downloaded_at)}</span>
                <span class="download-summary-label">Last Download</span>
            </div>`;
        el.appendChild(summary);

        const list = document.createElement('div');
        list.className = 'download-log-list';
        logs.forEach((log, i) => {
            const row = document.createElement('div');
            row.className = 'download-log-row';
            row.innerHTML = `
                <div class="download-log-index">${i + 1}</div>
                <div class="download-log-icon">${getFileIcon(log.file_name || '', 'file')}</div>
                <div class="download-log-info">
                    <div class="download-log-name">${log.file_name || '—'}</div>
                    <div class="download-log-meta">${formatSize(log.file_size)}</div>
                </div>
                <div class="download-log-time">
                    <div class="download-log-date">${formatDateTime(log.downloaded_at)}</div>
                </div>`;
            list.appendChild(row);
        });
        el.appendChild(list);

    } catch (err) {
        console.error(err);
        el.innerHTML = '<div class="detail-empty" style="color:var(--danger);">Failed to load download history.</div>';
    }
}

// ════════════════════════════════════
//  ADMIN FILE MANAGEMENT
// ════════════════════════════════════
async function adminBrowseFiles(parentId) {
    if (!currentDetailUserId) return;
    try {
        let url = `${API}/user-files/${currentDetailUserId}`;
        if (parentId) url += `?parent_id=${parentId}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error();
        const files = await res.json();

        updateAdminBrowseBc();
        const el = document.getElementById('adminFilesList');
        el.innerHTML = '';
        if (files.length === 0) { el.innerHTML = '<div class="detail-empty">No files or folders here</div>'; return; }

        files.sort((a, b) => {
            if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
            return new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });

        files.forEach(item => {
            const row = document.createElement('div'); row.className = 'detail-file-row manage-file-row';
            const icon = document.createElement('div'); icon.className = 'detail-file-icon'; icon.textContent = getFileIcon(item.name, item.type);
            const name = document.createElement('div'); name.className = 'detail-file-name'; name.textContent = item.name;
            if (item.type === 'folder') {
                name.style.cursor = 'pointer'; name.style.color = 'var(--accent)';
                name.onclick = () => { adminBrowseHistory.push({ id: item.id, name: item.name }); adminBrowseFiles(item.id); };
            }
            const meta = document.createElement('div'); meta.className = 'detail-file-meta'; meta.textContent = item.type === 'file' ? formatSize(item.size) : 'Folder';
            const del = document.createElement('button'); del.className = 'admin-del-btn'; del.textContent = 'Delete';
            del.onclick = () => openConfirmModal(`Delete "${item.name}" from this user?`, async () => {
                const r = await fetch(`${API}/file/${item.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
                if (r.ok) {
                    showToast('Deleted', 'success');
                    const cur = adminBrowseHistory.length > 0 ? adminBrowseHistory[adminBrowseHistory.length - 1].id : null;
                    adminBrowseFiles(cur);
                } else showToast('Failed', 'error');
            });
            row.appendChild(icon); row.appendChild(name); row.appendChild(meta); row.appendChild(del);
            el.appendChild(row);
        });
    } catch (err) { console.error(err); showToast("Failed to browse files", "error"); }
}

function updateAdminBrowseBc() {
    const bc = document.getElementById('adminBrowseBc');
    if (adminBrowseHistory.length === 0) { bc.style.display = 'none'; return; }
    bc.style.display = 'flex'; bc.innerHTML = '';
    const root = document.createElement('a'); root.textContent = 'Root';
    root.style.cssText = 'cursor:pointer;color:var(--accent);font-size:12px;text-decoration:none;';
    root.onclick = () => { adminBrowseHistory = []; adminBrowseFiles(null); };
    bc.appendChild(root);
    adminBrowseHistory.forEach((f, i) => {
        const sep = document.createElement('span'); sep.textContent = ' › '; sep.style.cssText = 'color:var(--text-hint);font-size:12px;';
        bc.appendChild(sep);
        const link = document.createElement('a'); link.textContent = f.name;
        link.style.cssText = 'cursor:pointer;color:var(--accent);font-size:12px;text-decoration:none;';
        link.onclick = () => { adminBrowseHistory = adminBrowseHistory.slice(0, i + 1); adminBrowseFiles(f.id); };
        bc.appendChild(link);
    });
}

async function adminCreateFolder() {
    const input = document.getElementById('adminFolderName');
    const name = input.value.trim();
    if (!name) { showToast("Enter folder name", "error"); return; }
    const parentId = adminBrowseHistory.length > 0 ? adminBrowseHistory[adminBrowseHistory.length - 1].id : null;
    try {
        const res = await fetch(`${API}/user-files/${currentDetailUserId}/folder`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name, parent_id: parentId })
        });
        const data = await res.json();
        if (res.ok) { showToast('Folder created', 'success'); input.value = ''; adminBrowseFiles(parentId); }
        else showToast(data.message || 'Failed', 'error');
    } catch (err) { showToast("Error", "error"); }
}

async function adminUploadFile() {
    const fileInput = document.getElementById('adminFileInput');
    if (!fileInput.files.length) { showToast("Select a file", "error"); return; }
    const parentId = adminBrowseHistory.length > 0 ? adminBrowseHistory[adminBrowseHistory.length - 1].id : null;
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    if (parentId) formData.append('parent_id', parentId);
    try {
        const res = await fetch(`${API}/user-files/${currentDetailUserId}/upload`, {
            method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData
        });
        const data = await res.json();
        if (res.ok) { showToast(`"${fileInput.files[0].name}" uploaded`, 'success'); fileInput.value = ''; adminBrowseFiles(parentId); }
        else showToast(data.message || 'Failed', 'error');
    } catch (err) { showToast("Upload failed", "error"); }
}

async function updateStorageLimit() {
    if (!currentDetailUserId) return;
    const mb = parseFloat(document.getElementById('storageLimitInput').value);
    if (isNaN(mb) || mb < 0) { showToast('Enter a valid number', 'error'); return; }
    try {
        const res = await fetch(`${API}/user-storage/${currentDetailUserId}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ storage_limit_mb: mb })
        });
        const data = await res.json();
        if (res.ok) { showToast(`Storage limit set to ${mb} MB`, 'success'); openUserDetail(currentDetailUserId); }
        else showToast(data.message || 'Failed', 'error');
    } catch (err) { showToast('Error updating limit', 'error'); }
}

// ─── DETAIL TAB SWITCH ───
function switchDetailTab(tab) {
    const tabs = ['owned', 'shared-with', 'shared-by', 'downloads', 'manage'];
    document.querySelectorAll('.detail-tab').forEach((b, i) => b.classList.toggle('active', tabs[i] === tab));
    document.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`detail-${tab}`).classList.add('active');
    if (tab === 'manage') { adminBrowseHistory = []; adminBrowseFiles(null); }
    if (tab === 'downloads') { loadUserDownloads(currentDetailUserId); }
}

function closeUserDetail() { document.getElementById('userDetailModal').style.display = 'none'; currentDetailUserId = null; }

// ─── CONFIRM MODAL ───
let confirmCallback = null;
function openConfirmModal(msg, cb) { document.getElementById("confirmText").textContent = msg; document.getElementById("confirmModal").style.display = "block"; confirmCallback = cb; }
function closeConfirmModal() { document.getElementById("confirmModal").style.display = "none"; confirmCallback = null; }
document.getElementById("confirmYes").onclick = () => { if (confirmCallback) confirmCallback(); closeConfirmModal(); };
document.getElementById("confirmModal").onclick = (e) => { if (e.target === document.getElementById("confirmModal")) closeConfirmModal(); };

function logout() { localStorage.removeItem("token"); window.location.replace("index.html"); }

fetchDomains();
fetchUsers();