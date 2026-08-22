/* ═══════════════════════════════════════════════════════════════
   ResumeScreen — Single-Page Application
   
   Architecture:
     • Hash-based router (#/home, #/jobs/new, #/jobs/3, etc.)
     • Each "view" is a function that writes HTML into #main-content
     • Event delegation for clicks (data-action attributes)
     • Direct listeners for drag-drop and file inputs (attached post-render)
   ═══════════════════════════════════════════════════════════════ */


/* ───────────────────────────────────
   Configuration & State
   ─────────────────────────────────── */

const API = '/api';

const state = {
    hasApiKey: false,
    currentJobId: null,
};

// Colour themes assigned to job cards by index
const JOB_THEMES = [
    { bg: '#EEF2FF', color: '#4F6BED' },
    { bg: '#F3E8FF', color: '#9333EA' },
    { bg: '#ECFDF5', color: '#10B981' },
    { bg: '#FEF3C7', color: '#F59E0B' },
    { bg: '#E0F2FE', color: '#0EA5E9' },
    { bg: '#FEE2E2', color: '#EF4444' },
];

// Temporary storage for files selected via the upload zone
let pendingResumeFiles = [];
let pendingJdFile = null;


/* ───────────────────────────────────
   Initialisation
   ─────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
    await checkApiKey();
    window.addEventListener('hashchange', handleRoute);
    handleRoute();
});


async function checkApiKey() {
    try {
        const data = await apiFetch('/health');
        state.hasApiKey = data.has_api_key;
    } catch {
        state.hasApiKey = false;
    }
}


/* ───────────────────────────────────
   Router
   ─────────────────────────────────── */

function handleRoute() {
    const raw = window.location.hash.replace(/^#\/?/, '') || 'home';
    const parts = raw.split('/');
    const view = parts[0];
    const param = parts[1];

    updateActiveNav(view);

    switch (view) {
        case 'home':     loadDashboard();               break;
        case 'jobs':
            if (param === 'new')   renderNewJob();
            else if (param)        loadJobDetail(parseInt(param));
            else                   loadDashboard();
            break;
        case 'candidates': loadAllCandidates();          break;
        case 'settings':   renderSettings();             break;
        default:           loadDashboard();
    }
}


function navigate(path) {
    window.location.hash = '#/' + path;
}


function updateActiveNav(view) {
    document.querySelectorAll('.nav-item').forEach(el => {
        const v = el.dataset.view;
        el.classList.toggle('active',
            v === view || (view === 'home' && v === 'home'));
    });
}


/* ───────────────────────────────────
   API Helper
   ─────────────────────────────────── */

async function apiFetch(path, opts = {}) {
    const headers = {};
    if (!(opts.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(API + path, { ...opts, headers: { ...headers, ...opts.headers } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Request failed');
    return data;
}


/* ───────────────────────────────────
   Utilities
   ─────────────────────────────────── */

function getGreeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

function timeAgo(str) {
    if (!str) return '';
    const d = new Date(str + (str.endsWith('Z') ? '' : 'Z'));
    const s = Math.floor((Date.now() - d) / 1000);
    if (s < 60)    return 'Just now';
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

function theme(i) { return JOB_THEMES[i % JOB_THEMES.length]; }

function esc(text) {
    const d = document.createElement('div');
    d.textContent = text ?? '';
    return d.innerHTML;
}

function showToast(msg, type = 'info') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.className = `toast toast-${type} show`;
    clearTimeout(t._tid);
    t._tid = setTimeout(() => t.classList.remove('show'), 3500);
}


/* ───────────────────────────────────
   SVG Icon helpers (avoids an icon library)
   ─────────────────────────────────── */

const ICONS = {
    briefcase: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>',
    plus: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
    arrow: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>',
    back: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>',
    dots: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>',
    upload: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>',
    chevDown: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>',
    people: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>',
    clock: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
    person: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
    bell: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>',
    pulse: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>',
    doc: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
    trash: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
    info: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
    search: '<svg width="WW" height="WW" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
};

function icon(name, size = 18) {
    return (ICONS[name] || '').replace(/WW/g, size);
}


/* ═══════════════════════════════════════════════════════════════
   VIEWS
   ═══════════════════════════════════════════════════════════════ */


/* ─── Dashboard ─── */

async function loadDashboard() {
    const main = document.getElementById('main-content');
    main.innerHTML = loadingHTML('Loading dashboard...');

    try {
        const data = await apiFetch('/dashboard');
        state.hasApiKey = (await apiFetch('/health')).has_api_key;
        renderDashboard(data);
    } catch (err) {
        main.innerHTML = errorHTML('Failed to load dashboard', err.message);
    }
}


function renderDashboard(data) {
    const { jobs, attention, activity } = data;
    const main = document.getElementById('main-content');
    const latest = jobs[0];
    const others = jobs.slice(1, 4);

    main.innerHTML = `
    <div class="dashboard">
        <div class="dashboard-main">

            <div class="page-header">
                <div>
                    <h1 class="greeting">${getGreeting()}, Kashyap!</h1>
                    <p class="subtitle">Here's what's happening with your hiring today.</p>
                </div>
                <button class="btn btn-primary" onclick="navigate('jobs/new')">
                    ${icon('plus', 16)} New Job
                </button>
            </div>

            ${!state.hasApiKey ? `
            <div class="api-key-banner">
                ${icon('info', 18)}
                <span>Set up your Gemini API key in <a href="#/settings">Settings</a> to start screening candidates.</span>
            </div>` : ''}

            ${latest ? featuredJobHTML(latest, 0) : emptyJobsHTML()}

            ${others.length ? `
            <div class="section-header"><h2 class="section-title">Your jobs</h2></div>
            <div class="jobs-grid">${others.map((j, i) => jobCardHTML(j, i + 1)).join('')}</div>
            ` : ''}

            ${jobs.length ? uploadBarHTML() : ''}
        </div>

        <div class="dashboard-right">
            ${attentionPanelHTML(attention)}
            ${activityPanelHTML(activity)}
        </div>
    </div>`;
}


/* ─── Featured Job Card ─── */

function featuredJobHTML(job, idx) {
    const t = theme(idx);
    const screened = (job.strong_count || 0) + (job.review_count || 0) + (job.low_count || 0);

    return `
    <div class="card featured-job" onclick="navigate('jobs/${job.id}')" style="cursor:pointer">
        <div class="featured-job-header">
            <div class="job-icon" style="background:${t.bg};color:${t.color}">${icon('briefcase', 24)}</div>
            <div class="featured-job-info">
                <h2 class="featured-job-title">${esc(job.title)}</h2>
                <p class="featured-job-meta">${job.total_candidates || 0} resumes &middot; Updated ${timeAgo(job.updated_at)}</p>
            </div>
            <button class="btn-icon" onclick="event.stopPropagation();confirmDeleteJob(${job.id},'${esc(job.title)}')">${icon('dots', 18)}</button>
        </div>

        ${screened > 0 ? `
        <div class="featured-stats">
            ${statBoxHTML(job.strong_count, 'Strong Match', 'strong', 'people')}
            ${statBoxHTML(job.review_count, 'Review', 'review', 'clock')}
            ${statBoxHTML(job.low_count, 'Low Match', 'low', 'person')}
        </div>` : `
        <div class="featured-stats-empty">
            <p>${job.total_candidates > 0
                ? `${job.total_candidates} candidate(s) waiting to be screened`
                : 'No candidates uploaded yet'}</p>
        </div>`}

        <div class="featured-job-footer">
            <span class="view-link" onclick="event.stopPropagation();navigate('jobs/${job.id}')">View Candidates ${icon('arrow', 14)}</span>
        </div>
    </div>`;
}

function statBoxHTML(count, label, cat, iconName) {
    return `
    <div class="stat-box ${cat}">
        <div>
            <div class="stat-number ${cat}">${count || 0}</div>
            <div class="stat-label">${label}</div>
        </div>
        <div class="stat-icon-circle ${cat}">${icon(iconName, 18)}</div>
    </div>`;
}


/* ─── Small Job Card ─── */

function jobCardHTML(job, idx) {
    const t = theme(idx);
    const n = job.total_candidates || 0;

    return `
    <div class="card job-card" onclick="navigate('jobs/${job.id}')">
        <div class="job-card-header">
            <div class="job-icon-sm" style="background:${t.bg};color:${t.color}">${icon('briefcase', 20)}</div>
            <button class="btn-icon" onclick="event.stopPropagation();confirmDeleteJob(${job.id},'${esc(job.title)}')">${icon('dots', 16)}</button>
        </div>
        <h3 class="job-card-title">${esc(job.title)}</h3>
        <p class="job-card-meta">${n} candidate${n !== 1 ? 's' : ''}</p>
        <div class="job-card-stats">
            ${job.strong_count ? `<span class="match-dot strong">${job.strong_count} strong match</span>` : ''}
            ${job.review_count ? `<span class="match-dot review">${job.review_count} review</span>` : ''}
            ${job.low_count    ? `<span class="match-dot low">${job.low_count} low match</span>` : ''}
            ${(!job.strong_count && !job.review_count && !job.low_count)
                ? `<span class="match-dot pending">${job.pending_count || 0} pending</span>` : ''}
        </div>
        <span class="view-link" onclick="event.stopPropagation();navigate('jobs/${job.id}')">View candidates ${icon('arrow', 14)}</span>
    </div>`;
}


/* ─── Empty / Upload / Panels ─── */

function emptyJobsHTML() {
    return `
    <div class="card empty-state">
        ${icon('briefcase', 48)}
        <h3>No job postings yet</h3>
        <p>Create your first job posting to start screening candidates.</p>
        <button class="btn btn-primary" onclick="navigate('jobs/new')">Create First Job</button>
    </div>`;
}

function uploadBarHTML() {
    return `
    <div class="card upload-bar" onclick="handleBulkUpload()" style="cursor:pointer">
        <div class="upload-bar-content">
            <div class="upload-bar-icon">${icon('upload', 24)}</div>
            <div>
                <p class="upload-bar-title">Upload resumes in bulk</p>
                <p class="upload-bar-subtitle">Drag and drop files here or click to upload</p>
            </div>
        </div>
        <button class="btn btn-outline" onclick="event.stopPropagation();handleBulkUpload()">Upload Files</button>
    </div>`;
}

function attentionPanelHTML(items) {
    return `
    <div class="card panel">
        <div class="panel-header">
            <h3 class="panel-title">Needs your attention</h3>
            ${icon('bell', 18)}
        </div>
        ${items && items.length ? `
        <div class="attention-list">
            ${items.map(c => `
            <div class="attention-item">
                <div class="attention-avatar">${icon('doc', 16)}</div>
                <div class="attention-info">
                    <p class="attention-name">${esc(c.name)}</p>
                    <p class="attention-desc">${esc((c.justification || 'Needs review').substring(0, 55))}...</p>
                </div>
                <button class="btn btn-sm btn-outline" onclick="navigate('jobs/${c.job_id}')">Review</button>
            </div>`).join('')}
            ${items.length >= 3 ? `<a class="view-all-link" href="#/candidates">View all (${items.length})</a>` : ''}
        </div>` : `<p class="panel-empty">No candidates need attention right now.</p>`}
    </div>`;
}

function activityPanelHTML(items) {
    return `
    <div class="card panel">
        <div class="panel-header">
            <h3 class="panel-title">Recent activity</h3>
            ${icon('pulse', 18)}
        </div>
        ${items && items.length ? `
        <div class="activity-list">
            ${items.map(a => `
            <div class="activity-item">
                <div class="activity-icon">${icon('clock', 14)}</div>
                <div class="activity-info">
                    <p class="activity-text">${esc(a.message)}</p>
                    <p class="activity-time">${timeAgo(a.created_at)}</p>
                </div>
            </div>`).join('')}
        </div>` : `<p class="panel-empty">No recent activity.</p>`}
    </div>`;
}


/* ═══════════════════════════════════════════════════════════════
   NEW JOB VIEW
   ═══════════════════════════════════════════════════════════════ */

function renderNewJob() {
    pendingJdFile = null;
    const main = document.getElementById('main-content');
    main.innerHTML = `
    <div class="page-narrow">
        <button class="btn-back" onclick="navigate('home')">${icon('back', 16)} Back to Dashboard</button>
        <h1 class="page-title">Create New Job</h1>
        <p class="page-subtitle">Add a job posting with its description to start screening candidates.</p>

        <div class="card form-card">
            <div class="form-group">
                <label class="form-label" for="job-title">Job Title</label>
                <input type="text" id="job-title" class="form-input" placeholder="e.g., Software Engineer" required>
            </div>

            <div class="form-group">
                <label class="form-label">Job Description</label>
                <div class="input-toggle">
                    <button type="button" class="toggle-btn active" onclick="switchJdMode('text',this)">Paste text</button>
                    <button type="button" class="toggle-btn" onclick="switchJdMode('pdf',this)">Upload PDF</button>
                </div>
                <div id="jd-text-input">
                    <textarea id="job-description" class="form-textarea" rows="10"
                        placeholder="Paste the full job description here..."></textarea>
                </div>
                <div id="jd-pdf-input" style="display:none">
                    <div class="upload-zone" id="jd-upload-zone">
                        ${icon('upload', 36)}
                        <p>Drag & drop JD PDF here</p>
                        <p class="upload-zone-hint">or click to browse</p>
                        <input type="file" id="jd-file-input" accept=".pdf" style="display:none">
                    </div>
                    <p id="jd-file-name" class="file-name-display"></p>
                </div>
            </div>

            <button class="btn btn-primary btn-full" id="create-job-btn" onclick="handleCreateJob()">Create Job</button>
        </div>
    </div>`;

    setupJdUploadZone();
}


function switchJdMode(mode, clickedBtn) {
    document.getElementById('jd-text-input').style.display = mode === 'text' ? '' : 'none';
    document.getElementById('jd-pdf-input').style.display  = mode === 'pdf'  ? '' : 'none';
    document.querySelectorAll('.input-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
    if (clickedBtn) clickedBtn.classList.add('active');
}


function setupJdUploadZone() {
    const zone = document.getElementById('jd-upload-zone');
    const inp  = document.getElementById('jd-file-input');
    if (!zone || !inp) return;

    zone.addEventListener('click', () => inp.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        if (e.dataTransfer.files.length) {
            pendingJdFile = e.dataTransfer.files[0];
            document.getElementById('jd-file-name').textContent = pendingJdFile.name;
        }
    });
    inp.addEventListener('change', () => {
        if (inp.files.length) {
            pendingJdFile = inp.files[0];
            document.getElementById('jd-file-name').textContent = pendingJdFile.name;
        }
    });
}


async function handleCreateJob() {
    const title = document.getElementById('job-title').value.trim();
    const btn = document.getElementById('create-job-btn');

    // Determine description source
    let description = '';
    const textArea = document.getElementById('job-description');
    const textVisible = document.getElementById('jd-text-input').style.display !== 'none';

    if (textVisible) {
        description = textArea ? textArea.value.trim() : '';
    }

    if (!title) { showToast('Please enter a job title', 'warning'); return; }

    // If PDF mode, we need to create the job first, then upload the PDF
    if (!textVisible && !pendingJdFile) {
        showToast('Please upload a JD PDF or switch to text mode', 'warning');
        return;
    }
    if (textVisible && !description) {
        showToast('Please enter the job description', 'warning');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
        // Create job with text description (or placeholder if PDF)
        const desc = description || 'Pending PDF upload...';
        const { id } = await apiFetch('/jobs', {
            method: 'POST',
            body: JSON.stringify({ title, description: desc }),
        });

        // If PDF mode, upload and overwrite description
        if (!textVisible && pendingJdFile) {
            const fd = new FormData();
            fd.append('file', pendingJdFile);
            await apiFetch(`/jobs/${id}/upload-jd`, { method: 'POST', body: fd });
        }

        showToast('Job created successfully', 'success');
        navigate(`jobs/${id}`);
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Create Job';
    }
}


/* ═══════════════════════════════════════════════════════════════
   JOB DETAIL VIEW
   ═══════════════════════════════════════════════════════════════ */

async function loadJobDetail(jobId) {
    state.currentJobId = jobId;
    pendingResumeFiles = [];
    const main = document.getElementById('main-content');
    main.innerHTML = loadingHTML('Loading job details...');

    try {
        const data = await apiFetch(`/jobs/${jobId}`);
        renderJobDetail(data.job, data.candidates);
    } catch (err) {
        main.innerHTML = errorHTML('Job not found', err.message);
    }
}


function renderJobDetail(job, candidates) {
    const main = document.getElementById('main-content');
    const screened = candidates.filter(c => c.screened);
    const unscreened = candidates.filter(c => !c.screened);
    const strong = screened.filter(c => c.category === 'strong').length;
    const review = screened.filter(c => c.category === 'review').length;
    const low    = screened.filter(c => c.category === 'low').length;

    main.innerHTML = `
    <div class="job-detail">
        <button class="btn-back" onclick="navigate('home')">${icon('back', 16)} Back to Dashboard</button>

        <div class="job-detail-header">
            <div>
                <h1 class="job-detail-title">${esc(job.title)}</h1>
                <p class="job-detail-date">Created ${timeAgo(job.created_at)}</p>
            </div>
            <button class="btn btn-outline btn-sm" style="color:var(--red)" onclick="confirmDeleteJob(${job.id},'${esc(job.title)}')">
                ${icon('trash', 14)} Delete
            </button>
        </div>

        <!-- JD section -->
        <div class="card jd-section">
            <div class="jd-toggle" onclick="toggleJd()">
                <h3>Job Description</h3>
                <span class="expand-icon" id="jd-chevron">${icon('chevDown', 16)}</span>
            </div>
            <div class="jd-text" id="jd-text-content">${esc(job.description)}</div>
        </div>

        <!-- Upload section -->
        <div class="card resume-upload-section">
            <h3>Upload Resumes</h3>
            <div class="input-toggle" style="margin:12px 0 8px">
                <button type="button" class="toggle-btn active" onclick="switchResumeMode('pdf',this)">Upload PDFs</button>
                <button type="button" class="toggle-btn" onclick="switchResumeMode('text',this)">Paste text</button>
            </div>

            <div id="resume-pdf-mode">
                <div class="upload-zone" id="resume-upload-zone">
                    ${icon('upload', 36)}
                    <p>Drag & drop resume PDFs here</p>
                    <p class="upload-zone-hint">or click to browse (multiple files supported)</p>
                    <input type="file" id="resume-file-input" accept=".pdf" multiple style="display:none">
                </div>
                <div class="file-list" id="resume-file-list"></div>
                <div style="margin-top:12px">
                    <button class="btn btn-primary" id="upload-resumes-btn" onclick="handleUploadResumes(${job.id})" style="display:none">
                        Upload Resumes
                    </button>
                </div>
            </div>

            <div id="resume-text-mode" style="display:none">
                <div class="text-resumes-list" id="text-resumes-list">
                    <div class="text-resume-entry">
                        <textarea class="form-textarea resume-text-input" rows="6" placeholder="Paste resume text here..."></textarea>
                    </div>
                </div>
                <span class="add-text-resume" onclick="addTextResumeEntry()">${icon('plus', 14)} Add another resume</span>
                <div style="margin-top:12px">
                    <button class="btn btn-primary" onclick="handleUploadTextResumes(${job.id})">Upload Text Resumes</button>
                </div>
            </div>
        </div>

        <!-- Screen button -->
        <div class="screen-btn-row">
            <button class="btn btn-success" id="screen-btn" onclick="handleScreen(${job.id})"
                ${unscreened.length === 0 ? 'disabled' : ''}>
                ${icon('search', 16)} Screen ${unscreened.length > 0 ? unscreened.length : 'All'} Candidate${unscreened.length !== 1 ? 's' : ''}
            </button>
            ${unscreened.length === 0 && candidates.length > 0
                ? '<span class="screen-progress">All candidates have been screened</span>'
                : unscreened.length > 0
                    ? `<span class="screen-progress">${unscreened.length} unscreened candidate(s)</span>`
                    : '<span class="screen-progress">Upload resumes first</span>'}
        </div>

        <!-- Candidates list -->
        ${candidates.length > 0 ? `
        <div class="candidates-header">
            <h2 class="candidates-title">Candidates (${candidates.length})</h2>
            <div class="candidates-summary">
                ${strong ? `<span class="summary-badge strong">${strong} Strong</span>` : ''}
                ${review ? `<span class="summary-badge review">${review} Review</span>` : ''}
                ${low    ? `<span class="summary-badge low">${low} Low</span>` : ''}
                ${unscreened.length ? `<span class="summary-badge pending">${unscreened.length} Pending</span>` : ''}
            </div>
        </div>
        <div class="candidates-list">
            ${candidates.map((c, i) => candidateCardHTML(c, i + 1)).join('')}
        </div>
        ` : ''}
    </div>`;

    setupResumeUploadZone();
}


/* ─── Resume upload zones ─── */

function switchResumeMode(mode, btn) {
    document.getElementById('resume-pdf-mode').style.display  = mode === 'pdf'  ? '' : 'none';
    document.getElementById('resume-text-mode').style.display = mode === 'text' ? '' : 'none';
    btn.parentElement.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}


function setupResumeUploadZone() {
    const zone = document.getElementById('resume-upload-zone');
    const inp  = document.getElementById('resume-file-input');
    if (!zone || !inp) return;

    zone.addEventListener('click', () => inp.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
        e.preventDefault();
        zone.classList.remove('dragover');
        addResumeFiles(e.dataTransfer.files);
    });
    inp.addEventListener('change', () => { addResumeFiles(inp.files); inp.value = ''; });
}


function addResumeFiles(fileList) {
    for (const f of fileList) {
        if (f.type === 'application/pdf' && !pendingResumeFiles.some(p => p.name === f.name)) {
            pendingResumeFiles.push(f);
        }
    }
    renderResumeFileList();
}


function removeResumeFile(idx) {
    pendingResumeFiles.splice(idx, 1);
    renderResumeFileList();
}


function renderResumeFileList() {
    const list = document.getElementById('resume-file-list');
    const btn  = document.getElementById('upload-resumes-btn');
    if (!list) return;

    list.innerHTML = pendingResumeFiles.map((f, i) => `
        <span class="file-tag">
            ${esc(f.name)}
            <span class="file-tag-remove" onclick="removeResumeFile(${i})">&times;</span>
        </span>
    `).join('');

    if (btn) btn.style.display = pendingResumeFiles.length ? '' : 'none';
}


async function handleUploadResumes(jobId) {
    if (!pendingResumeFiles.length) return;
    const btn = document.getElementById('upload-resumes-btn');
    btn.disabled = true;
    btn.textContent = 'Uploading...';

    try {
        const fd = new FormData();
        pendingResumeFiles.forEach(f => fd.append('files', f));
        const res = await apiFetch(`/jobs/${jobId}/resumes`, { method: 'POST', body: fd });
        showToast(`${res.added} resume(s) uploaded`, 'success');
        if (res.errors.length) showToast(`${res.errors.length} file(s) failed`, 'warning');
        pendingResumeFiles = [];
        loadJobDetail(jobId);
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Upload Resumes';
    }
}


function addTextResumeEntry() {
    const list = document.getElementById('text-resumes-list');
    const div = document.createElement('div');
    div.className = 'text-resume-entry';
    div.innerHTML = `
        <textarea class="form-textarea resume-text-input" rows="6" placeholder="Paste resume text here..."></textarea>
        <span class="remove-text-resume" onclick="this.parentElement.remove()">&times;</span>
    `;
    list.appendChild(div);
}


async function handleUploadTextResumes(jobId) {
    const areas = document.querySelectorAll('.resume-text-input');
    const texts = [];
    areas.forEach(a => { if (a.value.trim()) texts.push(a.value.trim()); });

    if (!texts.length) { showToast('Please paste at least one resume', 'warning'); return; }

    try {
        const res = await apiFetch(`/jobs/${jobId}/resumes-text`, {
            method: 'POST',
            body: JSON.stringify({ texts }),
        });
        showToast(`${res.added} resume(s) added`, 'success');
        loadJobDetail(jobId);
    } catch (err) {
        showToast(err.message, 'error');
    }
}


/* ─── Screening ─── */

async function handleScreen(jobId) {
    // Show screening overlay
    const overlay = document.createElement('div');
    overlay.className = 'screening-overlay';
    overlay.id = 'screening-overlay';
    overlay.innerHTML = `
    <div class="screening-modal">
        <div class="spinner"></div>
        <h3>Screening candidates...</h3>
        <p>Analyzing resumes and matching against the job description. This may take up to a minute for multiple resumes.</p>
    </div>`;
    document.body.appendChild(overlay);

    try {
        const data = await apiFetch(`/jobs/${jobId}/screen`, { method: 'POST' });
        document.getElementById('screening-overlay')?.remove();

        if (data.errors.length) {
            showToast(`Screened ${data.screened}, ${data.errors.length} error(s)`, 'warning');
        } else {
            showToast(`Successfully screened ${data.screened} candidate(s)`, 'success');
        }

        // Re-render job detail with results
        const jobData = await apiFetch(`/jobs/${jobId}`);
        renderJobDetail(jobData.job, jobData.candidates);
    } catch (err) {
        document.getElementById('screening-overlay')?.remove();
        showToast(err.message, 'error');
    }
}


/* ─── Candidate Card ─── */

function candidateCardHTML(c, rank) {
    const cat = c.screened ? c.category : 'pending';
    const score = c.screened ? c.match_score : '—';

    // Build detail sections
    let detail = '';
    if (c.screened) {
        detail = `
        <div class="candidate-detail">
            <div class="candidate-detail-inner">
                ${c.matched_skills && c.matched_skills.length ? `
                <div class="detail-section">
                    <div class="detail-label">Matched Skills</div>
                    <div class="chips">${c.matched_skills.map(s => `<span class="chip chip-matched">${esc(s)}</span>`).join('')}</div>
                </div>` : ''}

                ${c.missing_skills && c.missing_skills.length ? `
                <div class="detail-section">
                    <div class="detail-label">Missing Skills</div>
                    <div class="chips">${c.missing_skills.map(s => `<span class="chip chip-missing">${esc(s)}</span>`).join('')}</div>
                </div>` : ''}

                ${c.experience_relevance ? `
                <div class="detail-section">
                    <div class="detail-label">Experience Relevance</div>
                    <p class="detail-text">${esc(c.experience_relevance)}</p>
                </div>` : ''}

                ${c.justification ? `
                <div class="detail-section">
                    <div class="detail-label">Justification</div>
                    <p class="detail-text">${esc(c.justification)}</p>
                </div>` : ''}

                ${c.skills && c.skills.length ? `
                <div class="detail-section">
                    <div class="detail-label">All Skills</div>
                    <div class="chips">${c.skills.map(s => `<span class="chip chip-neutral">${esc(s)}</span>`).join('')}</div>
                </div>` : ''}

                ${c.experience && c.experience.length ? `
                <div class="detail-section">
                    <div class="detail-label">Experience</div>
                    <ul class="exp-list">
                        ${c.experience.map(e => `
                        <li class="exp-item">
                            <span class="exp-role">${esc(e.role)}</span>
                            <span class="exp-company"> at ${esc(e.company)}</span>
                            <span class="exp-duration"> &middot; ${esc(e.duration)}</span>
                            ${e.highlights && e.highlights.length ? `
                            <ul class="exp-highlights">
                                ${e.highlights.map(h => `<li>${esc(h)}</li>`).join('')}
                            </ul>` : ''}
                        </li>`).join('')}
                    </ul>
                </div>` : ''}

                ${c.education && c.education.length ? `
                <div class="detail-section">
                    <div class="detail-label">Education</div>
                    <ul class="edu-list">
                        ${c.education.map(e => `
                        <li class="edu-item">${esc(e.degree)} in ${esc(e.field)} — ${esc(e.institution)} (${esc(e.year)})</li>
                        `).join('')}
                    </ul>
                </div>` : ''}

                ${c.projects && c.projects.length ? `
                <div class="detail-section">
                    <div class="detail-label">Projects</div>
                    <ul class="proj-list">
                        ${c.projects.map(p => `
                        <li class="proj-item">
                            <strong>${esc(p.name)}</strong>: ${esc(p.description)}
                            ${p.technologies && p.technologies.length
                                ? `<div class="chips" style="margin-top:4px">${p.technologies.map(t => `<span class="chip chip-neutral">${esc(t)}</span>`).join('')}</div>`
                                : ''}
                        </li>`).join('')}
                    </ul>
                </div>` : ''}

                ${c.email || c.phone ? `
                <div class="detail-section">
                    <div class="detail-label">Contact</div>
                    <p class="detail-text">${c.email ? esc(c.email) : ''}${c.email && c.phone ? ' &middot; ' : ''}${c.phone ? esc(c.phone) : ''}</p>
                </div>` : ''}
            </div>
        </div>`;
    }

    return `
    <div class="card candidate-card" id="candidate-${c.id}">
        <div class="candidate-card-main" onclick="toggleCandidate(${c.id})">
            <span class="candidate-rank">${rank}</span>
            <div class="candidate-info">
                <p class="candidate-name">${esc(c.name)}</p>
                <p class="candidate-meta">${c.screened
                    ? (c.email ? esc(c.email) : 'No email')
                    : 'Not screened yet'}</p>
            </div>
            <div class="candidate-score">
                <span class="score-number ${cat}">${score}</span>
                <span class="category-badge ${cat}">${cat}</span>
                ${c.screened ? `
                <div class="score-bar">
                    <div class="score-bar-fill ${cat}" style="width:${c.match_score}%"></div>
                </div>` : ''}
            </div>
            <span class="expand-icon">${icon('chevDown', 16)}</span>
        </div>
        ${detail}
    </div>`;
}


function toggleCandidate(id) {
    const el = document.getElementById(`candidate-${id}`);
    if (el) el.classList.toggle('expanded');
}


function toggleJd() {
    const el = document.getElementById('jd-text-content');
    if (el) el.classList.toggle('collapsed');
}


/* ═══════════════════════════════════════════════════════════════
   ALL CANDIDATES VIEW
   ═══════════════════════════════════════════════════════════════ */

async function loadAllCandidates() {
    const main = document.getElementById('main-content');
    main.innerHTML = loadingHTML('Loading candidates...');

    try {
        const data = await apiFetch('/candidates');
        renderAllCandidates(data.candidates);
    } catch (err) {
        main.innerHTML = errorHTML('Failed to load candidates', err.message);
    }
}


function renderAllCandidates(candidates) {
    const main = document.getElementById('main-content');

    if (!candidates.length) {
        main.innerHTML = `
        <div class="page-narrow">
            <h1 class="page-title">Candidates</h1>
            <div class="card empty-state">
                ${icon('people', 48)}
                <h3>No candidates yet</h3>
                <p>Upload resumes to a job posting to see candidates here.</p>
                <button class="btn btn-primary" onclick="navigate('home')">Go to Dashboard</button>
            </div>
        </div>`;
        return;
    }

    main.innerHTML = `
    <div style="max-width:960px">
        <div class="page-header" style="margin-bottom:20px">
            <h1 class="page-title">All Candidates (${candidates.length})</h1>
        </div>
        <div class="card" style="padding:0;overflow:hidden">
            <table class="candidates-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Applied For</th>
                        <th>Score</th>
                        <th>Status</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${candidates.map(c => {
                        const cat = c.screened ? c.category : 'pending';
                        return `
                        <tr>
                            <td class="name-cell">${esc(c.name)}</td>
                            <td>${esc(c.job_title || '—')}</td>
                            <td>
                                <span class="score-number ${cat}" style="font-size:16px">
                                    ${c.screened ? c.match_score : '—'}
                                </span>
                            </td>
                            <td><span class="category-badge ${cat}">${cat}</span></td>
                            <td>
                                <button class="btn btn-sm btn-ghost" onclick="navigate('jobs/${c.job_id}')">View</button>
                            </td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    </div>`;
}


/* ═══════════════════════════════════════════════════════════════
   SETTINGS VIEW
   ═══════════════════════════════════════════════════════════════ */

function renderSettings() {
    const main = document.getElementById('main-content');
    main.innerHTML = `
    <div class="page-narrow">
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Configure your API key for resume screening.</p>

        <div class="card form-card settings-card">
            <div class="form-group">
                <label class="form-label" for="api-key-input">Gemini API Key</label>
                <input type="password" id="api-key-input" class="form-input"
                    placeholder="Enter your Google AI Studio API key">
                <p class="api-help">
                    Get your free API key from
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">Google AI Studio</a>.
                    The key is stored in memory only and never written to disk.
                </p>
            </div>

            <button class="btn btn-primary" id="save-key-btn" onclick="handleSaveApiKey()">Save API Key</button>

            <div id="api-status-display">
                ${state.hasApiKey
                    ? '<div class="api-status connected"><span class="status-dot connected"></span> Connected — API key is set</div>'
                    : '<div class="api-status disconnected"><span class="status-dot disconnected"></span> Not configured</div>'}
            </div>
        </div>
    </div>`;
}


async function handleSaveApiKey() {
    const input = document.getElementById('api-key-input');
    const btn   = document.getElementById('save-key-btn');
    const key   = input.value.trim();

    if (!key) { showToast('Please enter an API key', 'warning'); return; }

    btn.disabled = true;
    btn.textContent = 'Verifying...';

    try {
        await apiFetch('/set-api-key', {
            method: 'POST',
            body: JSON.stringify({ api_key: key }),
        });
        state.hasApiKey = true;
        document.getElementById('api-status-display').innerHTML =
            '<div class="api-status connected"><span class="status-dot connected"></span> Connected — API key is set</div>';
        input.value = '';
        showToast('API key verified and saved', 'success');
    } catch (err) {
        showToast(err.message, 'error');
    }
    btn.disabled = false;
    btn.textContent = 'Save API Key';
}


/* ═══════════════════════════════════════════════════════════════
   DELETE JOB
   ═══════════════════════════════════════════════════════════════ */

async function confirmDeleteJob(jobId, title) {
    if (!confirm(`Delete "${title}" and all its candidates?`)) return;
    try {
        await apiFetch(`/jobs/${jobId}`, { method: 'DELETE' });
        showToast('Job deleted', 'success');
        navigate('home');
    } catch (err) {
        showToast(err.message, 'error');
    }
}


/* ═══════════════════════════════════════════════════════════════
   BULK UPLOAD (Dashboard)
   ═══════════════════════════════════════════════════════════════ */

async function handleBulkUpload() {
    // If only one job exists, go directly to it
    try {
        const { jobs } = await apiFetch('/jobs');
        if (jobs.length === 0) {
            showToast('Create a job posting first', 'warning');
            navigate('jobs/new');
        } else if (jobs.length === 1) {
            navigate(`jobs/${jobs[0].id}`);
        } else {
            // Show a quick selection
            const picked = prompt(
                'Enter the job number to upload resumes to:\n\n' +
                jobs.map((j, i) => `${i + 1}. ${j.title}`).join('\n')
            );
            const idx = parseInt(picked) - 1;
            if (idx >= 0 && idx < jobs.length) {
                navigate(`jobs/${jobs[idx].id}`);
            }
        }
    } catch {
        navigate('home');
    }
}


/* ═══════════════════════════════════════════════════════════════
   SHARED HTML HELPERS
   ═══════════════════════════════════════════════════════════════ */

function loadingHTML(msg) {
    return `<div class="loading-container"><div class="spinner"></div><p>${esc(msg)}</p></div>`;
}

function errorHTML(title, msg) {
    return `
    <div class="empty-state">
        ${icon('info', 48)}
        <h3>${esc(title)}</h3>
        <p>${esc(msg)}</p>
        <button class="btn btn-primary" onclick="navigate('home')">Go Home</button>
    </div>`;
}
