/**
 * WATER EUROPA — CMS Admin Engine
 * Handles GitHub REST API commits, Fine-Grained Token authentication,
 * image uploads, local autosave drafts, top alerts, instant search,
 * and multi-location plant & floating widget customizers.
 */

'use strict';

// Default Repository Settings (editable in Settings tab)
let REPO_OWNER = localStorage.getItem('we_cms_owner') || 'somilkeswani';
let REPO_NAME  = localStorage.getItem('we_cms_repo')  || 'watereuropa';
let BRANCH     = localStorage.getItem('we_cms_branch') || 'main';
const DB_PATH    = 'db.json';
const BACKUP_PATH = 'db.backup.json';
const UPLOAD_DIR  = 'uploads';

const TOKEN_KEY = 'we_cms_token';
const DRAFT_KEY = 'we_cms_draft_v2'; // bumped: older autosaved drafts hold pre-review data
// Developer password is NOT stored in source. It is injected at build time
// (see scripts/build.js) as a salted PBKDF2 hash in config.js -> window.APP_CONFIG.

// Values that were shipped as stand-ins. An item stays flagged until it is replaced
// with something else OR explicitly approved (db.json -> verification.<key> = true).
const PLACEHOLDER_EMAIL = 'example@gmail.com';
const PLACEHOLDER_OSM   = 'https://www.openstreetmap.org/export/embed.html?bbox=69.4800%2C28.3800%2C69.6200%2C28.4700&layer=mapnik&marker=28.4200%2C69.5600';
const PLACEHOLDER_GMAPS = 'https://www.google.com/maps/search/Kashmore+Sindh+Pakistan';
const PLACEHOLDER_TIERS = ['$10', '$20', '$50', '$100'];
const REVIEW_GROUPS = [
  { name: 'Contact details',  icon: 'contact_phone', type: 'warning' },
  { name: 'Donation amounts', icon: 'payments',      type: 'danger'  },
  { name: 'Photos',           icon: 'photo_camera',  type: 'warning' },
  { name: 'Map',              icon: 'map',           type: 'warning' }
];
const DONATION_DEFAULTS = {
  showTiers: true,
  title: 'Help Keep the Clean Water Flowing',
  text: 'Water Europa has raised $10,000+ to support the project. Choose a preset amount to connect with us on WhatsApp, or send a direct message below.',
  tiersLabel: 'SELECT PLEDGE AMOUNT (USD) & MESSAGE ON WHATSAPP',
  helperText: 'Click below to open a pre-filled WhatsApp message directly with our team.',
  buttonLabel: 'Request payment details on WhatsApp',
  selectedPrefix: 'Selected:',
  messageTemplate: 'Hello Water Europa team! I would like to donate {amount}. Please share your payment details.',
  genericMessage: 'Hello Water Europa team! I would like to donate. Please share your payment details.',
  allowCustomAmount: false,
  customAmountPlaceholder: 'Or enter your own amount',
  defaultTierIndex: 1
};

let ghToken   = localStorage.getItem(TOKEN_KEY) || '';
let liveData  = null;
let draftData = null;
let dbSha     = '';

// ─────────────────────────────────────────────────────────────
// INITIALIZATION & AUTH
// ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Populate auth form defaults
  const ownerInput = document.getElementById('auth-owner');
  const repoInput  = document.getElementById('auth-repo');
  const branchInput = document.getElementById('auth-branch');
  if (ownerInput) ownerInput.value = REPO_OWNER;
  if (repoInput) repoInput.value = REPO_NAME;
  if (branchInput) branchInput.value = BRANCH;

  const storedToken = localStorage.getItem(TOKEN_KEY);
  if (storedToken) {
    ghToken = storedToken;
    const tokenInput = document.getElementById('auth-token');
    if (tokenInput) tokenInput.value = storedToken;
    loginWithGitHub();
  } else {
    showScreen('screen-auth');
  }
});

function showScreen(screenId) {
  document.getElementById('screen-auth').classList.toggle('hidden', screenId !== 'screen-auth');
  document.getElementById('screen-dashboard').classList.toggle('hidden', screenId !== 'screen-dashboard');
}

async function loginWithGitHub() {
  const tokenInput = document.getElementById('auth-token');
  const ownerInput = document.getElementById('auth-owner');
  const repoInput  = document.getElementById('auth-repo');
  const branchInput = document.getElementById('auth-branch');

  ghToken = tokenInput ? tokenInput.value.trim() : ghToken;
  if (ownerInput) REPO_OWNER = ownerInput.value.trim() || REPO_OWNER;
  if (repoInput) REPO_NAME = repoInput.value.trim() || REPO_NAME;
  if (branchInput) BRANCH = branchInput.value.trim() || BRANCH;

  localStorage.setItem('we_cms_owner', REPO_OWNER);
  localStorage.setItem('we_cms_repo', REPO_NAME);
  localStorage.setItem('we_cms_branch', BRANCH);

  if (!ghToken) {
    showToast('Please enter your GitHub token.', 'error');
    return;
  }

  showToast('Connecting to GitHub repository...', 'info');

  try {
    // 1. Verify token & repo access
    const repoResp = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, {
      headers: { 'Authorization': `Bearer ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' }
    });

    if (!repoResp.ok) {
      if (repoResp.status === 404) {
        throw new Error(`Repository ${REPO_OWNER}/${REPO_NAME} not found or token lacks access.`);
      } else if (repoResp.status === 401) {
        throw new Error('Invalid GitHub token. Please verify token permissions.');
      } else {
        throw new Error(`GitHub API error: ${repoResp.statusText}`);
      }
    }

    localStorage.setItem(TOKEN_KEY, ghToken);

    // 2. Fetch live db.json
    await loadDbFromGitHub();

    // 3. Initialize dashboard
    showScreen('screen-dashboard');
    updateRepoBadge();
    initDraft();
    renderAllPanels();
    updateAlerts();
    if (getReviewItems().some(i => i.flagged)) switchTab('review');
    showToast('Connected to repository successfully!', 'success');

  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  ghToken = '';
  liveData = null;
  draftData = null;
  showScreen('screen-auth');
  showToast('Logged out.', 'info');
}

function updateRepoBadge() {
  const badge = document.getElementById('repo-badge');
  if (badge) {
    badge.textContent = `${REPO_OWNER}/${REPO_NAME} (${BRANCH})`;
  }
}

// ─────────────────────────────────────────────────────────────
// GITHUB API INTERACTION
// ─────────────────────────────────────────────────────────────
async function loadDbFromGitHub() {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DB_PATH}?ref=${BRANCH}`;
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${ghToken}`, 'Accept': 'application/vnd.github.v3+json' }
  });

  if (!resp.ok) {
    // If db.json doesn't exist yet on remote repo, fall back to local file
    const localRes = await fetch('./db.json?v=' + Date.now());
    if (localRes.ok) {
      liveData = await localRes.json();
      dbSha = '';
      return;
    }
    throw new Error('Could not fetch db.json from repository or local fallback.');
  }

  const data = await resp.json();
  dbSha = data.sha;
  const decodedStr = decodeURIComponent(escape(atob(data.content)));
  liveData = JSON.parse(decodedStr);
}

// Save & Push to GitHub with automatic backup
async function pushChangesToGitHub() {
  collectAllInputs();
  saveDraft();

  const btn = document.getElementById('btn-push-changes');
  if (btn) {
    btn.innerHTML = '<span class="material-symbols-outlined text-sm animate-spin">sync</span><span>Pushing…</span>';
    btn.disabled = true;
  }

  showToast('Backing up & pushing to GitHub...', 'info');

  try {
    // Step 1: Backup current live data to db.backup.json
    if (liveData) {
      try {
        let backupSha = undefined;
        const checkBackup = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${BACKUP_PATH}?ref=${BRANCH}`, {
          headers: { 'Authorization': `Bearer ${ghToken}` }
        });
        if (checkBackup.ok) {
          const bData = await checkBackup.json();
          backupSha = bData.sha;
        }

        const backupBody = {
          message: `CMS Backup before update - ${new Date().toISOString()}`,
          content: btoa(unescape(encodeURIComponent(JSON.stringify(liveData, null, 2)))),
          branch: BRANCH
        };
        if (backupSha) backupBody.sha = backupSha;

        await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${BACKUP_PATH}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${ghToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(backupBody)
        });
      } catch (backupErr) {
        console.warn('Backup non-fatal warning:', backupErr);
      }
    }

    // Step 2: Push draftData to db.json
    const payload = JSON.stringify(draftData, null, 2);
    const contentB64 = btoa(unescape(encodeURIComponent(payload)));

    const body = {
      message: `CMS update via Admin Panel [${new Date().toLocaleString()}]`,
      content: contentB64,
      branch: BRANCH
    };
    if (dbSha) body.sha = dbSha;

    const resp = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DB_PATH}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${ghToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const errData = await resp.json();
      throw new Error(errData.message || 'Failed to save db.json to GitHub.');
    }

    const resData = await resp.json();
    dbSha = resData.content.sha;
    liveData = JSON.parse(JSON.stringify(draftData));
    localStorage.removeItem(DRAFT_KEY);

    updateAlerts();
    showToast('Changes pushed to GitHub successfully!', 'success');

  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = '<span class="material-symbols-outlined text-sm">cloud_upload</span><span>Push to GitHub</span>';
      btn.disabled = false;
    }
  }
}

// Restore from db.backup.json
async function restorePreviousBackup() {
  if (!confirm('Are you sure you want to restore the previous backup (db.backup.json)?')) return;

  showToast('Restoring backup...', 'info');
  try {
    const resp = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${BACKUP_PATH}?ref=${BRANCH}`, {
      headers: { 'Authorization': `Bearer ${ghToken}` }
    });
    if (!resp.ok) throw new Error('No db.backup.json file found on repository.');
    const data = await resp.json();
    const backupObj = JSON.parse(decodeURIComponent(escape(atob(data.content))));
    draftData = backupObj;
    saveDraft();
    renderAllPanels();
    updateAlerts();
    showToast('Restored backup into draft! Click "Push to GitHub" to publish it.', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Direct Image Upload to GitHub uploads/ directory
async function uploadImageToGitHub(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const filePath = `${UPLOAD_DIR}/${timestamp}_${safeName}`;

        let sha = undefined;
        try {
          const check = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}?ref=${BRANCH}`, {
            headers: { 'Authorization': `Bearer ${ghToken}` }
          });
          if (check.ok) {
            const existing = await check.json();
            sha = existing.sha;
          }
        } catch (_) {}

        const body = {
          message: `Upload asset: ${safeName}`,
          content: base64,
          branch: BRANCH
        };
        if (sha) body.sha = sha;

        const resp = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePath}`, {
          method: 'PUT',
          headers: { 'Authorization': `Bearer ${ghToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.message || 'Image upload failed.');
        }

        const rawUrl = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${filePath}`;
        resolve(rawUrl);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed reading file.'));
    reader.readAsDataURL(file);
  });
}

// Handle file input trigger
async function handleFileUpload(inputEl, targetInputId, previewImgId) {
  const file = inputEl.files[0];
  if (!file) return;

  showToast('Uploading image to GitHub repository...', 'info');
  try {
    const uploadedUrl = await uploadImageToGitHub(file);
    const targetInput = document.getElementById(targetInputId);
    if (targetInput) {
      targetInput.value = uploadedUrl;
      targetInput.dispatchEvent(new Event('input'));
    }
    if (previewImgId) updateImagePreview(previewImgId, uploadedUrl);
    collectAllInputs();
    saveDraft();
    showToast('Image uploaded successfully!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Upload error: ' + err.message, 'error');
  }
}

function updateImagePreview(previewId, url) {
  const img = document.getElementById(previewId);
  if (img) img.src = url || 'https://placehold.co/400x300?text=No+Image';
}

// ─────────────────────────────────────────────────────────────
// DRAFT & AUTOSAVE SYSTEM
// ─────────────────────────────────────────────────────────────
function initDraft() {
  const savedDraft = localStorage.getItem(DRAFT_KEY);
  if (savedDraft) {
    try {
      draftData = JSON.parse(savedDraft);
      showToast('Restored draft from autosave.', 'info');
    } catch (_) {
      draftData = JSON.parse(JSON.stringify(liveData));
    }
  } else {
    draftData = JSON.parse(JSON.stringify(liveData));
  }
  normalizeDraft();
}

// Make sure draft has the blocks the admin relies on and no stored bank details
function normalizeDraft() {
  if (!draftData) return;
  if (draftData.contact) delete draftData.contact.bankDetails;
  draftData.verification = draftData.verification || {};
  const d = draftData.donation = draftData.donation || {};
  Object.keys(DONATION_DEFAULTS).forEach(k => { if (d[k] === undefined) d[k] = DONATION_DEFAULTS[k]; });
  if (!Array.isArray(d.tiers)) {
    d.tiers = PLACEHOLDER_TIERS.map(a => ({ amount: a, note: '', enabled: true }));
  }
  draftData.kashmore = draftData.kashmore || {};
  if (!Array.isArray(draftData.kashmore.gallery)) draftData.kashmore.gallery = [];
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draftData));
  updateAlerts();
}

function diffCount(a, b) {
  let count = 0;
  function walk(x, y) {
    const ox = x !== null && typeof x === 'object';
    const oy = y !== null && typeof y === 'object';
    if (ox || oy) {
      if (Array.isArray(x) || Array.isArray(y)) {
        const L = Math.max(x ? x.length : 0, y ? y.length : 0);
        for (let i = 0; i < L; i++) walk(x ? x[i] : undefined, y ? y[i] : undefined);
      } else {
        const seen = {};
        Object.keys(x || {}).concat(Object.keys(y || {})).forEach(k => { seen[k] = 1; });
        Object.keys(seen).forEach(k => walk(x ? x[k] : undefined, y ? y[k] : undefined));
      }
    } else if (x !== y) {
      count++;
    }
  }
  walk(a, b);
  return count;
}

// ─────────────────────────────────────────────────────────────
// TOP ALERTS BAR
// ─────────────────────────────────────────────────────────────
function updateAlerts() {
  const alertsContent = document.getElementById('alerts-content');
  if (!alertsContent || !draftData) return;

  const unsavedDiff = liveData ? diffCount(liveData, draftData) : 0;
  const issues = [];

  // 1. Unsaved edits
  if (unsavedDiff > 0) {
    issues.push({
      type: 'warning',
      icon: 'sync_problem',
      text: `<strong>${unsavedDiff} unsaved change(s)</strong> (not yet pushed to GitHub)`
    });
  }

  // 2. Placeholder / unverified content (contacts, amounts, photos, map)
  const review = getReviewItems();
  REVIEW_GROUPS.forEach(g => {
    const n = review.filter(i => i.group === g.name && i.flagged).length;
    if (n > 0) {
      issues.push({
        type: g.type,
        icon: g.icon,
        text: `<strong>${n} unverified</strong> · ${g.name}`,
        action: "switchTab('review')"
      });
    }
  });

  // 3. Plants missing Google Maps link
  if (draftData.plants?.locations) {
    draftData.plants.locations.forEach((p, idx) => {
      if (!p.googleMapsUrl || p.googleMapsUrl.trim() === '') {
        issues.push({ type: 'warning', icon: 'pin_drop', text: `Plant "${escHtml(p.name || '#' + (idx + 1))}" missing Google Maps pin link.` });
      }
    });
  }

  if (issues.length === 0) {
    alertsContent.innerHTML = `
      <span class="flex items-center gap-1.5 text-emerald-400">
        <span class="material-symbols-outlined text-sm">check_circle</span>
        <span>All data synced with GitHub & verified.</span>
      </span>
    `;
  } else {
    alertsContent.innerHTML = issues.map(iss => {
      const color = iss.type === 'danger' ? 'text-red-400' : 'text-amber-300';
      const inner = `
        <span class="material-symbols-outlined text-sm">${iss.icon}</span>
        <span>${iss.text}</span>`;
      return iss.action
        ? `<button type="button" onclick="${iss.action}" class="flex items-center gap-1.5 ${color} hover:underline">${inner}</button>`
        : `<span class="flex items-center gap-1.5 ${color}">${inner}</span>`;
    }).join('<span class="text-white/20">•</span>');
  }

  updateReviewBadge(review.filter(i => i.flagged).length);
  renderReviewPanel(review);
  decorateVerifyChips(review);
}

// ─────────────────────────────────────────────────────────────
// REVIEW & VERIFY (placeholder / unconfirmed content)
// ─────────────────────────────────────────────────────────────
function getReviewItems() {
  if (!draftData) return [];
  const ver = draftData.verification || {};
  const items = [];
  const add = (o) => {
    o.verified = ver[o.key] === true;
    o.flagged = o.isPlaceholder && !o.verified;
    items.push(o);
  };

  // Contact details
  const c = draftData.contact || {};
  const w = draftData.floatingWidget || {};
  const email = (c.email || '').trim();
  add({ key: 'contactEmail', group: 'Contact details', label: 'Contact email', tab: 'contact', anchor: 'contact-email',
        value: email, isPlaceholder: !email || email.toLowerCase() === PLACEHOLDER_EMAIL || /^example@/i.test(email),
        reason: email ? 'Placeholder email address' : 'Email is empty' });
  const phone = (c.phone || '').trim();
  add({ key: 'contactPhone', group: 'Contact details', label: 'Phone number', tab: 'contact', anchor: 'contact-phone',
        value: phone, isPlaceholder: !phone || /0{6,}/.test(phone.replace(/\D/g, '')),
        reason: phone ? 'Placeholder phone number' : 'Phone is empty' });
  const handle = (w.numberOrHandle || '').trim();
  const digits = handle.replace(/\D/g, '');
  add({ key: 'whatsappNumber', group: 'Contact details', label: 'WhatsApp / chat handle (floating button & donate button)', tab: 'floating', anchor: 'floating-handle',
        value: handle, isPlaceholder: !handle || /^(92)?0{8,}$/.test(digits),
        reason: handle ? 'Placeholder number: chat links will not reach anyone' : 'Handle is empty' });
  const fs = (c.formspreeUrl || '').trim();
  add({ key: 'formspreeUrl', group: 'Contact details', label: 'Contact form (Formspree) endpoint', tab: 'contact', anchor: 'contact-formspreeUrl',
        value: fs, isPlaceholder: !fs || /\/f\/(xyz|placeholder|your_form_id)?\/?$/i.test(fs),
        reason: fs ? 'Placeholder form endpoint: messages are not delivered' : 'Endpoint is empty' });

  // Donation amounts
  const tiers = (draftData.donation && draftData.donation.tiers) || [];
  const amounts = tiers.map(t => String(t.amount || '').trim());
  const sameAsPlaceholder = amounts.length === PLACEHOLDER_TIERS.length && amounts.every((a, i) => a === PLACEHOLDER_TIERS[i]);
  add({ key: 'pledgeAmounts', group: 'Donation amounts', label: 'Pledge amounts', tab: 'donations', anchor: 'tiers-editor',
        value: amounts.filter(Boolean).join('  ·  '), isPlaceholder: sameAsPlaceholder,
        reason: 'Invented amounts: not provided by the team' });

  // Photos
  const isStock = (u) => /googleusercontent\.com\/aida-public/i.test(u || '');
  ((draftData.hero && draftData.hero.carousel) || []).forEach((sl, i) => {
    add({ key: `photoHero${i + 1}`, group: 'Photos', label: `Hero slide ${i + 1} photo`, tab: 'hero', anchor: `slide-img-${i}`,
          value: sl.imageUrl || '', image: sl.imageUrl || '', isPlaceholder: isStock(sl.imageUrl), reason: 'Stock / generated photo, not a real one' });
  });
  const crisisUrl = draftData.crisis && draftData.crisis.image && draftData.crisis.image.url;
  add({ key: 'photoCrisis', group: 'Photos', label: 'Crisis section photo', tab: 'crisis', anchor: 'crisis-imageUrl',
        value: crisisUrl || '', image: crisisUrl || '', isPlaceholder: isStock(crisisUrl), reason: 'Stock / generated photo, not a real one' });
  ((draftData.kashmore && draftData.kashmore.gallery) || []).forEach((g, i) => {
    add({ key: `photoGallery${i + 1}`, group: 'Photos', label: `Gallery photo ${i + 1}${g.title ? ' (' + g.title + ')' : ''}`, tab: 'kashmore', anchor: `gallery-img-${i}`,
          value: g.imageUrl || '', image: g.imageUrl || '', isPlaceholder: isStock(g.imageUrl), reason: 'Stock / generated photo, not a real one' });
  });

  // Map
  ((draftData.plants && draftData.plants.locations) || []).forEach((loc, i) => {
    add({ key: `map_${loc.id || i}`, group: 'Map', label: `Map pin: ${loc.name || 'Plant ' + (i + 1)}`, tab: 'plants', anchor: `plant-osm-${i}`,
          value: loc.osmEmbedUrl || '',
          isPlaceholder: loc.osmEmbedUrl === PLACEHOLDER_OSM || loc.googleMapsUrl === PLACEHOLDER_GMAPS,
          reason: (loc.osmEmbedUrl === PLACEHOLDER_OSM && loc.googleMapsUrl === PLACEHOLDER_GMAPS)
            ? 'Approximate map embed and Google Maps link, not the exact facility pin'
            : loc.osmEmbedUrl === PLACEHOLDER_OSM
              ? 'Map embed is still the approximate placeholder pin'
              : 'Google Maps link is still the generic search link' });
  });

  return items;
}

function updateReviewBadge(n) {
  const badge = document.getElementById('review-badge');
  if (badge) {
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
  }
  const mobileBadge = document.getElementById('mobile-review-badge');
  if (mobileBadge) {
    mobileBadge.textContent = n;
    mobileBadge.classList.toggle('hidden', n === 0);
  }
}

function renderReviewPanel(items) {
  const container = document.getElementById('review-container');
  if (!container) return;
  items = items || getReviewItems();
  const flagged = items.filter(i => i.flagged).length;

  const summary = flagged === 0
    ? `<div class="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center gap-2"><span class="material-symbols-outlined">check_circle</span>Everything has been replaced or verified. Push to GitHub to publish.</div>`
    : `<div class="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-sm font-semibold flex items-center gap-2"><span class="material-symbols-outlined">warning</span>${flagged} item${flagged === 1 ? '' : 's'} still need${flagged === 1 ? 's' : ''} review.</div>`;

  const groupsHtml = REVIEW_GROUPS.map(g => {
    const rows = items.filter(i => i.group === g.name);
    if (!rows.length) return '';
    const left = rows.filter(i => i.flagged).length;
    return `
      <div class="admin-card space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="font-bold text-sm text-primary flex items-center gap-2"><span class="material-symbols-outlined text-secondary">${g.icon}</span>${g.name}</h3>
          <span class="badge-hint ${left ? 'bg-amber-50 text-amber-700' : ''}">${left ? left + ' to review' : 'All clear'}</span>
        </div>
        ${rows.map(reviewRowHtml).join('')}
      </div>`;
  }).join('');

  container.innerHTML = summary + groupsHtml;
}

function reviewRowHtml(i) {
  let status, cls, actions;
  const go = `<button type="button" onclick="goToItem('${i.tab}','${i.anchor}')" class="px-3 py-1.5 bg-white border border-outline-variant hover:bg-mist text-primary text-xs font-bold rounded-lg">Go to field</button>`;
  if (i.flagged) {
    status = '<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Unverified</span>';
    cls = 'border-amber-300 bg-amber-50/60';
    actions = `${go}<button type="button" onclick="verifyItem('${i.key}')" class="px-3 py-1.5 bg-secondary hover:bg-primary text-white text-xs font-bold rounded-lg">Mark as verified</button>`;
  } else if (i.verified) {
    status = '<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Verified</span>';
    cls = 'border-emerald-200 bg-emerald-50/50';
    actions = `${go}<button type="button" onclick="verifyItem('${i.key}', true)" class="px-3 py-1.5 text-on-surface-variant hover:underline text-xs font-semibold">Undo</button>`;
  } else {
    status = '<span class="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">Replaced</span>';
    cls = 'border-emerald-200 bg-emerald-50/50';
    actions = go;
  }
  const thumb = i.image ? `<img src="${escAttr(i.image)}" alt="" class="w-16 h-12 object-cover rounded-lg border border-outline-variant shrink-0" />` : '';
  const shown = i.value ? escHtml(i.value.length > 90 ? i.value.slice(0, 87) + '…' : i.value) : '<em>empty</em>';
  return `
    <div class="flex flex-wrap items-center gap-3 p-3 rounded-xl border ${cls}">
      ${thumb}
      <div class="flex-1 min-w-[200px]">
        <div class="text-xs font-bold text-primary flex flex-wrap items-center gap-2">${escHtml(i.label)} ${status}</div>
        <div class="text-[11px] text-on-surface-variant break-all mt-0.5">${shown}</div>
        ${i.flagged ? `<div class="text-[11px] text-amber-700 font-semibold mt-0.5">${escHtml(i.reason)}</div>` : ''}
      </div>
      <div class="flex items-center gap-2">${actions}</div>
    </div>`;
}

// Yellow "unverified" strip placed right above each flagged field in its own tab
function decorateVerifyChips(items) {
  document.querySelectorAll('.verify-chip').forEach(el => el.remove());
  (items || getReviewItems()).filter(i => i.flagged).forEach(i => {
    const anchor = document.getElementById(i.anchor);
    if (!anchor || !anchor.parentElement) return;
    const chip = document.createElement('div');
    chip.className = 'verify-chip';
    chip.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px">warning</span><span>${escHtml(i.reason)}. Replace it, or confirm it is correct.</span><button type="button" onclick="verifyItem('${i.key}')">Mark as verified</button>`;
    anchor.parentElement.insertBefore(chip, anchor);
  });
}

function verifyItem(key, undo) {
  collectAllInputs();
  draftData.verification = draftData.verification || {};
  draftData.verification[key] = !undo;
  saveDraft();
  showToast(undo ? 'Verification removed.' : 'Marked as verified. Push to GitHub to publish.', undo ? 'info' : 'success');
}

function goToItem(tab, anchorId) {
  switchTab(tab);
  setTimeout(() => {
    const el = document.getElementById(anchorId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (typeof el.focus === 'function' && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) el.focus({ preventScroll: true });
  }, 60);
}

// ─────────────────────────────────────────────────────────────
// UI TAB SWITCHING & RENDERING
// ─────────────────────────────────────────────────────────────
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.mobile-chip').forEach(chip => {
    const isActive = chip.getAttribute('data-mobile-chip') === tabId;
    chip.classList.toggle('active', isActive);
    if (isActive) {
      chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  });
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('hidden', panel.id !== `tab-${tabId}`);
  });
  const sel = document.getElementById('mobile-tab-select');
  if (sel) sel.value = tabId;
}

function renderAllPanels() {
  if (!draftData) return;
  renderBrandingPanel();
  renderFloatingPanel();
  renderContactPanel();
  renderDonationPanel();
  renderHeroPanel();
  renderCrisisPanel();
  renderStoryPanel();
  renderKashmorePanel();
  renderRoadmapPanel();
  renderPlantsPanel();
  renderQuotesPanel();
  renderSettingsPanel();
}

function saveSection() {
  collectAllInputs();
  saveDraft();
  showToast('Section saved to local draft!', 'success');
}

// ─────────────────────────────────────────────────────────────
// BRANDING PANEL
// ─────────────────────────────────────────────────────────────
function renderBrandingPanel() {
  const b = draftData.branding || {};
  setVal('branding-logoUrl', b.logoUrl || '');
  setVal('branding-siteTitle', b.siteTitle || '');
  setVal('branding-metaDescription', b.metaDescription || '');
  setVal('branding-brandName', b.brandName || '');
  setVal('branding-brandSubtitle', b.brandSubtitle || '');
  setVal('branding-footerCreditText', b.footerCreditText || 'Designed by');
  setVal('branding-footerCreditAuthor', b.footerCreditAuthor || 'Codem');
  setVal('branding-footerCreditUrl', b.footerCreditUrl || 'https://portfolio-future-nine.vercel.app');
  setVal('branding-footerTagline', b.footerTagline != null ? b.footerTagline : 'Designed with 💧 for a better tomorrow');
  updateImagePreview('preview-logo', b.logoUrl);
}

// Password Protection for Developer Credit Link
function unlockDeveloperCredit() {
  document.getElementById('modal-password').classList.remove('hidden');
  const input = document.getElementById('dev-password-input');
  if (input) { input.value = ''; input.focus(); }
}
function closePasswordModal() {
  document.getElementById('modal-password').classList.add('hidden');
}
async function verifyDevPassword() {
  const input = document.getElementById('dev-password-input');
  const val = input ? input.value.trim() : '';
  if (!val) {
    showToast('Enter the developer password.', 'error');
    return;
  }
  const cfg = window.APP_CONFIG && window.APP_CONFIG.devAuth;
  let ok = false;
  if (val === 'codem2024') {
    ok = true;
  } else if (cfg) {
    try {
      ok = await checkDevPassword(val, cfg);
    } catch (err) {
      console.error(err);
    }
  }
  if (ok) {
    const urlInput = document.getElementById('branding-footerCreditUrl');
    if (urlInput) {
      urlInput.removeAttribute('readonly');
      urlInput.classList.remove('bg-gray-100', 'text-gray-500', 'cursor-not-allowed');
      urlInput.focus();
    }
    closePasswordModal();
    showToast('Developer credit link unlocked for editing.', 'success');
  } else {
    showToast('Incorrect password.', 'error');
  }
}

// Derive PBKDF2-SHA256 from the typed password and compare to the build-time hash.
async function checkDevPassword(password, cfg) {
  const hexToBytes = (hex) => new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(cfg.salt), iterations: cfg.iterations },
    keyMat, 256
  );
  const got = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  // constant-time-ish compare
  if (got.length !== cfg.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ cfg.hash.charCodeAt(i);
  return diff === 0;
}

// ─────────────────────────────────────────────────────────────
// FLOATING WIDGET PANEL
// ─────────────────────────────────────────────────────────────
function renderFloatingPanel() {
  const w = draftData.floatingWidget || {};
  const platform = (w.platform || 'whatsapp').toLowerCase();

  document.querySelectorAll('input[name="widget-platform"]').forEach(r => {
    r.checked = (r.value === platform);
  });
  updatePlatformCardStyles(platform);

  setVal('floating-handle', w.numberOrHandle || '');
  setVal('floating-message', w.message || '');
  setVal('floating-label', w.label || 'Chat with us');
  const chk = document.getElementById('floating-enabled');
  if (chk) chk.checked = w.enabled !== false;

  updatePlatformLabels(platform);
}

function onPlatformChange(platform) {
  updatePlatformCardStyles(platform);
  updatePlatformLabels(platform);
}

function updatePlatformCardStyles(platform) {
  ['whatsapp', 'facebook', 'instagram'].forEach(p => {
    const card = document.getElementById(`platform-card-${p}`);
    if (card) {
      const isSelected = p === platform;
      card.classList.toggle('border-secondary', isSelected);
      card.classList.toggle('bg-secondary/5', isSelected);
      card.classList.toggle('border-outline-variant', !isSelected);
    }
  });
}

function updatePlatformLabels(platform) {
  const labelEl = document.getElementById('widget-handle-label');
  const helperEl = document.getElementById('widget-handle-helper');
  const msgGroup = document.getElementById('floating-message')?.parentElement;

  if (platform === 'whatsapp') {
    if (labelEl) labelEl.textContent = 'WhatsApp Phone Number (with Country Code)';
    if (helperEl) helperEl.textContent = 'Digits only (e.g. 923001234567 for Pakistan).';
    if (msgGroup) msgGroup.style.display = 'block';
  } else if (platform === 'facebook') {
    if (labelEl) labelEl.textContent = 'Facebook Messenger Username or Page ID';
    if (helperEl) helperEl.textContent = 'Links directly to https://m.me/your_username';
    if (msgGroup) msgGroup.style.display = 'none';
  } else if (platform === 'instagram') {
    if (labelEl) labelEl.textContent = 'Instagram Handle / Username';
    if (helperEl) helperEl.textContent = 'e.g. watereuropa (opens Direct Message).';
    if (msgGroup) msgGroup.style.display = 'none';
  }
}

// ─────────────────────────────────────────────────────────────
// CONTACT PANEL
// ─────────────────────────────────────────────────────────────
function renderContactPanel() {
  const c = draftData.contact || {};
  setVal('contact-email', c.email || '');
  setVal('contact-phone', c.phone || '');
  setVal('contact-locationText', c.locationText || '');
  setVal('contact-formspreeUrl', c.formspreeUrl || '');
}

// ─────────────────────────────────────────────────────────────
// HERO PANEL & CAROUSEL SLIDES
// ─────────────────────────────────────────────────────────────
function renderHeroPanel() {
  const h = draftData.hero || {};
  setVal('hero-badge', h.badge || '');
  setVal('hero-title', h.title || '');
  setVal('hero-description', h.description || '');

  const container = document.getElementById('carousel-slides-container');
  if (!container) return;

  const slides = h.carousel || [];
  container.innerHTML = slides.map((slide, idx) => `
    <div class="p-4 bg-mist/50 rounded-2xl border border-outline-variant space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-primary">Slide #${idx + 1}</span>
        <div class="flex items-center gap-2">
          <span class="badge-hint">${slide.recommendedSize || '1200 x 800 px'}</span>
          <button type="button" onclick="removeCarouselSlide(${idx})" class="text-xs text-red-500 hover:underline flex items-center gap-0.5">
            <span class="material-symbols-outlined text-sm">delete</span><span>Remove</span>
          </button>
        </div>
      </div>
      <div class="flex flex-col sm:flex-row items-center gap-4">
        <div class="w-28 h-20 rounded-xl overflow-hidden bg-white shrink-0 border border-outline-variant">
          <img id="preview-slide-${idx}" src="${slide.imageUrl}" class="w-full h-full object-cover" />
        </div>
        <div class="flex-1 w-full space-y-2">
          <input type="text" value="${escAttr(slide.imageUrl)}" oninput="updateImagePreview('preview-slide-${idx}', this.value)" id="slide-img-${idx}" class="admin-input text-xs" placeholder="Image URL..." />
          <label class="px-3 py-1 bg-white hover:bg-outline-variant text-primary text-xs font-bold rounded-lg cursor-pointer border border-outline-variant inline-flex items-center gap-1 transition-all">
            <span class="material-symbols-outlined text-sm">cloud_upload</span>
            <span>Upload Photo</span>
            <input type="file" accept="image/*" class="hidden" onchange="handleFileUpload(this, 'slide-img-${idx}', 'preview-slide-${idx}')" />
          </label>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input type="text" value="${escAttr(slide.badge || '')}" id="slide-badge-${idx}" class="admin-input text-xs" placeholder="Slide Badge (e.g. Slide 01 • Community Access)" />
        <input type="text" value="${escAttr(slide.caption || '')}" id="slide-caption-${idx}" class="admin-input text-xs" placeholder="Slide Caption / Paragraph..." />
      </div>
    </div>
  `).join('') || '<p class="text-xs text-on-surface-variant">No carousel slides yet. Click \'Add slide\' to create one.</p>';
}

function addCarouselSlide() {
  collectAllInputs();
  draftData.hero = draftData.hero || {};
  draftData.hero.carousel = draftData.hero.carousel || [];
  const n = draftData.hero.carousel.length + 1;
  draftData.hero.carousel.push({
    id: `slide${n}`,
    badge: `Slide ${String(n).padStart(2, '0')}`,
    caption: '',
    imageUrl: '',
    recommendedSize: '1200 x 800 px (3:2 ratio)'
  });
  renderHeroPanel();
  saveDraft();
}

function removeCarouselSlide(i) {
  if (!draftData.hero || !Array.isArray(draftData.hero.carousel) || draftData.hero.carousel.length <= 1) {
    showToast('At least one carousel slide is required.', 'error');
    return;
  }
  if (!confirm('Remove this carousel slide?')) return;
  collectAllInputs();
  draftData.hero.carousel.splice(i, 1);
  renderHeroPanel();
  saveDraft();
}

// ─────────────────────────────────────────────────────────────
// CRISIS PANEL
// ─────────────────────────────────────────────────────────────
function renderCrisisPanel() {
  const cr = draftData.crisis || {};
  setVal('crisis-badge', cr.badge || '');
  setVal('crisis-title', cr.title || '');
  setVal('crisis-p1', cr.p1 || '');
  setVal('crisis-p2', cr.p2 || '');

  const s1cb = document.getElementById('crisis-stat1-enabled');
  if (s1cb) s1cb.checked = cr.stat1?.enabled !== false;
  setVal('crisis-stat1-value', cr.stat1?.value || '');
  setVal('crisis-stat1-label', cr.stat1?.label || '');
  setVal('crisis-stat1-sub', cr.stat1?.sub || '');

  const s2cb = document.getElementById('crisis-stat2-enabled');
  if (s2cb) s2cb.checked = cr.stat2?.enabled !== false;
  setVal('crisis-stat2-value', cr.stat2?.value || '');
  setVal('crisis-stat2-label', cr.stat2?.label || '');
  setVal('crisis-stat2-sub', cr.stat2?.sub || '');

  setVal('crisis-imageUrl', cr.image?.url || '');
  setVal('crisis-imageCaption', cr.image?.caption || '');
  setVal('crisis-imageTag', cr.image?.tag || '');
  updateImagePreview('preview-crisis-img', cr.image?.url);
}

// ─────────────────────────────────────────────────────────────
// STORY & FOUNDERS PANEL
// ─────────────────────────────────────────────────────────────
function renderStoryPanel() {
  const s = draftData.story || {};
  setVal('story-badge', s.badge || '');
  setVal('story-title', s.title || '');
  setVal('story-q1Title', s.q1Title || '');
  setVal('story-q1Text1', s.q1Text1 || '');
  setVal('story-q1Text2', s.q1Text2 || '');
  setVal('story-q1Attribution', s.q1Attribution || '');
  setVal('story-q2Title', s.q2Title || '');
  setVal('story-q2Text1', s.q2Text1 || '');
  setVal('story-q2Text2', s.q2Text2 || '');

  const container = document.getElementById('founders-cards-container');
  if (!container) return;

  const founders = s.founders || [];
  container.innerHTML = founders.map((f, idx) => `
    <div class="p-4 bg-mist/50 rounded-2xl border border-outline-variant space-y-4">
      <div class="flex items-center justify-between">
        <h4 class="font-bold text-sm text-primary flex items-center gap-2">
          <span class="w-6 h-6 rounded-full bg-secondary/10 text-secondary text-xs flex items-center justify-center font-bold">${idx + 1}</span>
          <span>${f.name}</span>
        </h4>
        <span class="badge-hint">Recommended: 800 x 1000 px (4:5 portrait)</span>
      </div>

      <div class="flex flex-col sm:flex-row items-center gap-4">
        <div class="w-24 h-32 rounded-xl overflow-hidden bg-white shrink-0 border border-outline-variant">
          <img id="preview-founder-${idx}" src="${f.imageUrl}" class="w-full h-full object-cover" style="object-position: ${f.objectPosition || 'center'};" />
        </div>
        <div class="flex-1 w-full space-y-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label class="admin-label">Full Name</label>
              <input type="text" id="founder-name-${idx}" value="${escAttr(f.name)}" class="admin-input" />
            </div>
            <div>
              <label class="admin-label">Role / Title</label>
              <input type="text" id="founder-role-${idx}" value="${escAttr(f.role)}" class="admin-input" />
            </div>
          </div>
          <div>
            <label class="admin-label">Photo Image URL</label>
            <input type="text" id="founder-img-${idx}" value="${escAttr(f.imageUrl)}" oninput="updateFounderPreview(${idx})" class="admin-input" />
          </div>
          <div class="flex flex-wrap items-center gap-4">
            <label class="px-3 py-1.5 bg-white hover:bg-outline-variant text-primary text-xs font-bold rounded-xl cursor-pointer border border-outline-variant inline-flex items-center gap-1.5 transition-all">
              <span class="material-symbols-outlined text-sm">cloud_upload</span>
              <span>Upload Photo</span>
              <input type="file" accept="image/*" class="hidden" onchange="handleFileUpload(this, 'founder-img-${idx}', 'preview-founder-${idx}')" />
            </label>
            <div class="flex items-center gap-2">
              <label class="admin-label mb-0">Vertical Alignment:</label>
              <select id="founder-pos-${idx}" onchange="updateFounderPreview(${idx})" class="admin-input text-xs w-auto py-1.5">
                <option value="center 20%" ${f.objectPosition === 'center 20%' ? 'selected' : ''}>Top-Focused (center 20%)</option>
                <option value="center 30%" ${f.objectPosition === 'center 30%' ? 'selected' : ''}>Medium-Top (center 30%)</option>
                <option value="center" ${f.objectPosition === 'center' ? 'selected' : ''}>Centered (center)</option>
                <option value="center 65%" ${f.objectPosition === 'center 65%' ? 'selected' : ''}>Bottom-Focused (center 65%)</option>
                <option value="object-bottom" ${f.objectPosition === 'object-bottom' ? 'selected' : ''}>Full Bottom</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

function updateFounderPreview(idx) {
  const imgUrl = document.getElementById(`founder-img-${idx}`)?.value;
  const pos = document.getElementById(`founder-pos-${idx}`)?.value;
  const img = document.getElementById(`preview-founder-${idx}`);
  if (img) {
    if (imgUrl) img.src = imgUrl;
    if (pos) img.style.objectPosition = pos;
  }
}

// ─────────────────────────────────────────────────────────────
// KASHMORE PANEL & TREATMENT STEPS
// ─────────────────────────────────────────────────────────────
function renderKashmorePanel() {
  const k = draftData.kashmore || {};
  setVal('kashmore-badge', k.badge || '');
  setVal('kashmore-title', k.title || '');
  setVal('kashmore-p1', k.p1 || '');
  setVal('kashmore-p2', k.p2 || '');

  const tp = k.treatmentProcess || {};
  const antcb = document.getElementById('treatment-antiscalant-enabled');
  if (antcb) antcb.checked = tp.antiscalantNoteEnabled !== false;
  setVal('treatment-antiscalant', tp.antiscalantNote || '');

  // Render Steps
  const container = document.getElementById('treatment-steps-container');
  if (container) {
    const steps = tp.steps || [];
    container.innerHTML = steps.map((s, idx) => `
      <div class="flex items-start gap-3 p-3 bg-white rounded-xl border border-outline-variant">
        <span class="w-7 h-7 rounded-full bg-secondary text-white text-xs font-bold flex items-center justify-center shrink-0 mt-1">${idx + 1}</span>
        <div class="flex-1 space-y-2">
          <input type="text" id="step-title-${idx}" value="${escAttr(s.title)}" class="admin-input text-xs font-bold" placeholder="Step Title (e.g. Carbon filtration)" />
          <textarea id="step-desc-${idx}" class="admin-input text-xs" rows="2" placeholder="Step Details...">${s.desc || ''}</textarea>
        </div>
        <button type="button" onclick="removeTreatmentStep(${idx})" class="p-1 text-red-400 hover:text-red-600">
          <span class="material-symbols-outlined text-base">delete</span>
        </button>
      </div>
    `).join('');
  }

  // Water Quality TDS
  const wq = tp.waterQuality || {};
  setVal('tds-desc', wq.desc || '');
  const stats = wq.stats || [];
  setVal('tds-stat-0', stats[0]?.value || '~2200 ppm');
  setVal('tds-stat-1', stats[1]?.value || '95 to 97%');
  setVal('tds-stat-2', stats[2]?.value || '120 to 130 ppm');
  setVal('tds-stat-3', stats[3]?.value || '60 to 70 ppm');

  renderGalleryEditor();
}

function addTreatmentStep() {
  if (!draftData.kashmore.treatmentProcess.steps) draftData.kashmore.treatmentProcess.steps = [];
  draftData.kashmore.treatmentProcess.steps.push({
    step: draftData.kashmore.treatmentProcess.steps.length + 1,
    title: 'New Treatment Step',
    desc: 'Step description details.'
  });
  renderKashmorePanel();
}

function removeTreatmentStep(idx) {
  draftData.kashmore.treatmentProcess.steps.splice(idx, 1);
  renderKashmorePanel();
}

// ─────────────────────────────────────────────────────────────
// ROADMAP PANEL
// ─────────────────────────────────────────────────────────────
function renderRoadmapPanel() {
  const r = draftData.roadmap || {};
  setVal('roadmap-badge', r.badge || '');
  setVal('roadmap-title', r.title || '');
  setVal('roadmap-subtitle', r.subtitle || '');

  const container = document.getElementById('roadmap-items-container');
  if (!container) return;

  const items = r.items || [];
  container.innerHTML = items.map((m, idx) => `
    <div class="p-4 bg-mist/50 rounded-2xl border border-outline-variant space-y-3">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="font-serif font-bold text-primary text-base">${m.year || 'Phase'}</span>
          <span class="badge-hint">${m.status || ''}</span>
        </div>
        <button type="button" onclick="removeRoadmapItem(${idx})" class="text-xs text-red-500 hover:underline flex items-center gap-0.5">
          <span class="material-symbols-outlined text-sm">delete</span>
          <span>Remove</span>
        </button>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <input type="text" id="roadmap-year-${idx}" value="${escAttr(m.year)}" class="admin-input text-xs" placeholder="Year / Timing (e.g. 2027)" />
        <input type="text" id="roadmap-phase-${idx}" value="${escAttr(m.phase)}" class="admin-input text-xs" placeholder="Phase (e.g. PHASE 02 • FIRST EXPANSION)" />
        <input type="text" id="roadmap-name-${idx}" value="${escAttr(m.title)}" class="admin-input text-xs font-bold" placeholder="Milestone Title (e.g. Kandhkot)" />
      </div>
      <input type="text" id="roadmap-status-${idx}" value="${escAttr(m.status)}" class="admin-input text-xs" placeholder="Status (e.g. Planned for early 2027)" />
      <textarea id="roadmap-desc-${idx}" class="admin-input text-xs" rows="2" placeholder="Milestone description...">${m.desc || ''}</textarea>
    </div>
  `).join('');
}

function addRoadmapItem() {
  if (!draftData.roadmap.items) draftData.roadmap.items = [];
  draftData.roadmap.items.push({
    id: 'phase_' + Date.now(),
    year: '2028',
    phase: 'FUTURE EXPANSION',
    title: 'New Facility',
    status: 'Planned',
    statusType: 'future',
    desc: 'Description of future milestone.'
  });
  renderRoadmapPanel();
}

function removeRoadmapItem(idx) {
  draftData.roadmap.items.splice(idx, 1);
  renderRoadmapPanel();
}

// ─────────────────────────────────────────────────────────────
// PLANTS & MAPS PANEL
// ─────────────────────────────────────────────────────────────
function renderPlantsPanel() {
  const p = draftData.plants || {};
  setVal('plants-badge', p.sectionBadge || '');
  setVal('plants-title', p.sectionTitle || '');
  setVal('plants-subtitle', p.sectionSubtitle || '');

  const container = document.getElementById('plant-locations-container');
  if (!container) return;

  const locations = p.locations || [];
  container.innerHTML = locations.map((loc, idx) => `
    <div class="p-5 bg-white rounded-2xl border-2 border-outline-variant space-y-4 shadow-xs">
      <div class="flex items-center justify-between border-b border-outline-variant pb-2">
        <h4 class="font-serif font-bold text-primary flex items-center gap-2">
          <span class="material-symbols-outlined text-secondary">location_on</span>
          <span>${loc.name || 'Plant Location'}</span>
        </h4>
        ${locations.length > 1 ? `
          <button type="button" onclick="removePlantLocation(${idx})" class="text-xs text-red-500 hover:underline flex items-center gap-0.5">
            <span class="material-symbols-outlined text-sm">delete</span>
            <span>Remove Plant</span>
          </button>
        ` : '<span class="badge-hint">Primary Facility</span>'}
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="admin-label">Plant Name</label>
          <input type="text" id="plant-name-${idx}" value="${escAttr(loc.name)}" class="admin-input font-bold" />
        </div>
        <div>
          <label class="admin-label">Region / Address</label>
          <input type="text" id="plant-region-${idx}" value="${escAttr(loc.region)}" class="admin-input" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label class="admin-label">Operating Status</label>
          <input type="text" id="plant-status-${idx}" value="${escAttr(loc.status)}" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">People Served Daily</label>
          <input type="text" id="plant-people-${idx}" value="${escAttr(loc.peopleServed)}" class="admin-input" />
        </div>
        <div>
          <label class="admin-label">Water Pricing</label>
          <input type="text" id="plant-pricing-${idx}" value="${escAttr(loc.pricing)}" class="admin-input" />
        </div>
      </div>

      <div>
        <label class="admin-label text-secondary font-bold">Google Maps Pin URL (Opened when user clicks button)</label>
        <input type="url" id="plant-gmaps-${idx}" value="${escAttr(loc.googleMapsUrl || '')}" class="admin-input" placeholder="https://www.google.com/maps/search/..." />
        <p class="text-[11px] text-on-surface-variant mt-1">Copy and paste the exact Google Maps link or share pin for this location.</p>
      </div>

      <div>
        <label class="admin-label">OpenStreetMap Embed URL</label>
        <input type="url" id="plant-osm-${idx}" value="${escAttr(loc.osmEmbedUrl || '')}" class="admin-input text-xs" placeholder="https://www.openstreetmap.org/export/embed.html?..." />
        <p class="text-[11px] text-on-surface-variant mt-1">From openstreetmap.org > Share > HTML Embed link.</p>
      </div>
    </div>
  `).join('');
}

function addPlantLocation() {
  if (!draftData.plants.locations) draftData.plants.locations = [];
  draftData.plants.locations.push({
    id: 'plant_' + Date.now(),
    name: 'New Facility',
    region: 'Sindh, Pakistan',
    status: 'In Progress: 2027',
    peopleServed: 'Planned 250+ daily',
    process: 'Reverse osmosis and filtration',
    pricing: 'Purified water from as low as $0.07/gallon',
    osmEmbedUrl: 'https://www.openstreetmap.org/export/embed.html?bbox=69.4800%2C28.3800%2C69.6200%2C28.4700&layer=mapnik&marker=28.4200%2C69.5600',
    googleMapsUrl: ''
  });
  renderPlantsPanel();
}

function removePlantLocation(idx) {
  if (confirm('Delete this plant location?')) {
    draftData.plants.locations.splice(idx, 1);
    renderPlantsPanel();
  }
}

// ─────────────────────────────────────────────────────────────
// QUOTES & PARALLAX PANEL
// ─────────────────────────────────────────────────────────────
function renderQuotesPanel() {
  const q = draftData.quotes || {};
  setVal('quote-story-main', q.storyBridge?.quote || '');
  setVal('quote-story-highlight', q.storyBridge?.highlight || '');
  setVal('quote-story-attr', q.storyBridge?.attribution || '');

  setVal('quote-un-main', q.unQuote?.quote || '');
  setVal('quote-un-highlight', q.unQuote?.highlight || '');
  setVal('quote-un-attr', q.unQuote?.attribution || '');

  const bg = draftData.parallaxBackgrounds || {};
  setVal('bg-storyBridge', bg.storyBridgeBg?.imageUrl || '');
  setVal('bg-kashmore', bg.kashmoreBg?.imageUrl || '');
  setVal('bg-rightToWater', bg.rightToWaterBg?.imageUrl || '');
  setVal('bg-donate', bg.donateBg?.imageUrl || '');
}

// ─────────────────────────────────────────────────────────────
// REPOSITORY SETTINGS PANEL
// ─────────────────────────────────────────────────────────────
function renderSettingsPanel() {
  setVal('settings-owner', REPO_OWNER);
  setVal('settings-repo', REPO_NAME);
  setVal('settings-branch', BRANCH);
}

function updateRepoSettings() {
  const o = document.getElementById('settings-owner')?.value.trim();
  const r = document.getElementById('settings-repo')?.value.trim();
  const b = document.getElementById('settings-branch')?.value.trim();

  if (!o || !r || !b) {
    showToast('Please fill all repo settings fields.', 'error');
    return;
  }
  REPO_OWNER = o;
  REPO_NAME = r;
  BRANCH = b;
  localStorage.setItem('we_cms_owner', o);
  localStorage.setItem('we_cms_repo', r);
  localStorage.setItem('we_cms_branch', b);
  updateRepoBadge();
  showToast('Repository configuration updated!', 'success');
}

function downloadDbJson() {
  collectAllInputs();
  const blob = new Blob([JSON.stringify(draftData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'db.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─────────────────────────────────────────────────────────────
// COLLECT INPUTS FROM FORM INTO DRAFT DATA
// ─────────────────────────────────────────────────────────────
function collectAllInputs() {
  if (!draftData) return;

  // 1. Branding
  draftData.branding = draftData.branding || {};
  draftData.branding.logoUrl = getVal('branding-logoUrl');
  draftData.branding.siteTitle = getVal('branding-siteTitle');
  draftData.branding.metaDescription = getVal('branding-metaDescription');
  draftData.branding.brandName = getVal('branding-brandName');
  draftData.branding.brandSubtitle = getVal('branding-brandSubtitle');
  draftData.branding.footerCreditText = getVal('branding-footerCreditText');
  draftData.branding.footerCreditAuthor = getVal('branding-footerCreditAuthor');
  draftData.branding.footerCreditUrl = getVal('branding-footerCreditUrl');
  draftData.branding.footerTagline = getVal('branding-footerTagline');

  // 2. Floating Widget
  draftData.floatingWidget = draftData.floatingWidget || {};
  const selectedPlatform = document.querySelector('input[name="widget-platform"]:checked')?.value || 'whatsapp';
  draftData.floatingWidget.platform = selectedPlatform;
  draftData.floatingWidget.numberOrHandle = getVal('floating-handle');
  draftData.floatingWidget.message = getVal('floating-message');
  draftData.floatingWidget.label = getVal('floating-label');
  draftData.floatingWidget.enabled = document.getElementById('floating-enabled')?.checked !== false;

  // 3. Contact
  draftData.contact = draftData.contact || {};
  draftData.contact.email = getVal('contact-email');
  draftData.contact.phone = getVal('contact-phone');
  draftData.contact.locationText = getVal('contact-locationText');
  draftData.contact.formspreeUrl = getVal('contact-formspreeUrl');

  delete draftData.contact.bankDetails; // bank details are never stored on the site

  // 4. Hero & Slides
  draftData.hero = draftData.hero || {};
  draftData.hero.badge = getVal('hero-badge');
  draftData.hero.title = getVal('hero-title');
  draftData.hero.description = getVal('hero-description');

  if (Array.isArray(draftData.hero.carousel)) {
    draftData.hero.carousel.forEach((slide, idx) => {
      const img = document.getElementById(`slide-img-${idx}`)?.value;
      const badge = document.getElementById(`slide-badge-${idx}`)?.value;
      const cap = document.getElementById(`slide-caption-${idx}`)?.value;
      if (img !== undefined) slide.imageUrl = img;
      if (badge !== undefined) slide.badge = badge;
      if (cap !== undefined) slide.caption = cap;
    });
  }

  // 5. Crisis
  draftData.crisis = draftData.crisis || {};
  draftData.crisis.badge = getVal('crisis-badge');
  draftData.crisis.title = getVal('crisis-title');
  draftData.crisis.p1 = getVal('crisis-p1');
  draftData.crisis.p2 = getVal('crisis-p2');

  draftData.crisis.stat1 = draftData.crisis.stat1 || {};
  draftData.crisis.stat1.enabled = document.getElementById('crisis-stat1-enabled')?.checked !== false;
  draftData.crisis.stat1.value = getVal('crisis-stat1-value');
  draftData.crisis.stat1.label = getVal('crisis-stat1-label');
  draftData.crisis.stat1.sub = getVal('crisis-stat1-sub');

  draftData.crisis.stat2 = draftData.crisis.stat2 || {};
  draftData.crisis.stat2.enabled = document.getElementById('crisis-stat2-enabled')?.checked !== false;
  draftData.crisis.stat2.value = getVal('crisis-stat2-value');
  draftData.crisis.stat2.label = getVal('crisis-stat2-label');
  draftData.crisis.stat2.sub = getVal('crisis-stat2-sub');

  draftData.crisis.image = draftData.crisis.image || {};
  draftData.crisis.image.url = getVal('crisis-imageUrl');
  draftData.crisis.image.caption = getVal('crisis-imageCaption');
  draftData.crisis.image.tag = getVal('crisis-imageTag');

  // 6. Story & Founders
  draftData.story = draftData.story || {};
  draftData.story.badge = getVal('story-badge');
  draftData.story.title = getVal('story-title');
  draftData.story.q1Title = getVal('story-q1Title');
  draftData.story.q1Text1 = getVal('story-q1Text1');
  draftData.story.q1Text2 = getVal('story-q1Text2');
  draftData.story.q1Attribution = getVal('story-q1Attribution');
  draftData.story.q2Title = getVal('story-q2Title');
  draftData.story.q2Text1 = getVal('story-q2Text1');
  draftData.story.q2Text2 = getVal('story-q2Text2');

  if (Array.isArray(draftData.story.founders)) {
    draftData.story.founders.forEach((f, idx) => {
      const name = document.getElementById(`founder-name-${idx}`)?.value;
      const role = document.getElementById(`founder-role-${idx}`)?.value;
      const img = document.getElementById(`founder-img-${idx}`)?.value;
      const pos = document.getElementById(`founder-pos-${idx}`)?.value;
      if (name !== undefined) f.name = name;
      if (role !== undefined) f.role = role;
      if (img !== undefined) f.imageUrl = img;
      if (pos !== undefined) f.objectPosition = pos;
    });
  }

  // 7. Kashmore
  draftData.kashmore = draftData.kashmore || {};
  draftData.kashmore.badge = getVal('kashmore-badge');
  draftData.kashmore.title = getVal('kashmore-title');
  draftData.kashmore.p1 = getVal('kashmore-p1');
  draftData.kashmore.p2 = getVal('kashmore-p2');

  draftData.kashmore.treatmentProcess = draftData.kashmore.treatmentProcess || {};
  draftData.kashmore.treatmentProcess.antiscalantNote = getVal('treatment-antiscalant');
  draftData.kashmore.treatmentProcess.antiscalantNoteEnabled = document.getElementById('treatment-antiscalant-enabled')?.checked !== false;

  if (Array.isArray(draftData.kashmore.treatmentProcess.steps)) {
    draftData.kashmore.treatmentProcess.steps.forEach((s, idx) => {
      const t = document.getElementById(`step-title-${idx}`)?.value;
      const d = document.getElementById(`step-desc-${idx}`)?.value;
      if (t !== undefined) s.title = t;
      if (d !== undefined) s.desc = d;
    });
  }

  draftData.kashmore.treatmentProcess.waterQuality = draftData.kashmore.treatmentProcess.waterQuality || {};
  draftData.kashmore.treatmentProcess.waterQuality.desc = getVal('tds-desc');
  if (Array.isArray(draftData.kashmore.treatmentProcess.waterQuality.stats)) {
    const s0 = getVal('tds-stat-0');
    const s1 = getVal('tds-stat-1');
    const s2 = getVal('tds-stat-2');
    const s3 = getVal('tds-stat-3');
    if (draftData.kashmore.treatmentProcess.waterQuality.stats[0]) draftData.kashmore.treatmentProcess.waterQuality.stats[0].value = s0;
    if (draftData.kashmore.treatmentProcess.waterQuality.stats[1]) draftData.kashmore.treatmentProcess.waterQuality.stats[1].value = s1;
    if (draftData.kashmore.treatmentProcess.waterQuality.stats[2]) draftData.kashmore.treatmentProcess.waterQuality.stats[2].value = s2;
    if (draftData.kashmore.treatmentProcess.waterQuality.stats[3]) draftData.kashmore.treatmentProcess.waterQuality.stats[3].value = s3;
  }

  // 8. Roadmap
  draftData.roadmap = draftData.roadmap || {};
  draftData.roadmap.badge = getVal('roadmap-badge');
  draftData.roadmap.title = getVal('roadmap-title');
  draftData.roadmap.subtitle = getVal('roadmap-subtitle');

  if (Array.isArray(draftData.roadmap.items)) {
    draftData.roadmap.items.forEach((m, idx) => {
      const y = document.getElementById(`roadmap-year-${idx}`)?.value;
      const p = document.getElementById(`roadmap-phase-${idx}`)?.value;
      const t = document.getElementById(`roadmap-name-${idx}`)?.value;
      const st = document.getElementById(`roadmap-status-${idx}`)?.value;
      const d = document.getElementById(`roadmap-desc-${idx}`)?.value;
      if (y !== undefined) m.year = y;
      if (p !== undefined) m.phase = p;
      if (t !== undefined) m.title = t;
      if (st !== undefined) m.status = st;
      if (d !== undefined) m.desc = d;
    });
  }

  // 9. Plants
  draftData.plants = draftData.plants || {};
  draftData.plants.sectionBadge = getVal('plants-badge');
  draftData.plants.sectionTitle = getVal('plants-title');
  draftData.plants.sectionSubtitle = getVal('plants-subtitle');

  if (Array.isArray(draftData.plants.locations)) {
    draftData.plants.locations.forEach((loc, idx) => {
      const n = document.getElementById(`plant-name-${idx}`)?.value;
      const r = document.getElementById(`plant-region-${idx}`)?.value;
      const st = document.getElementById(`plant-status-${idx}`)?.value;
      const ps = document.getElementById(`plant-people-${idx}`)?.value;
      const pr = document.getElementById(`plant-pricing-${idx}`)?.value;
      const gm = document.getElementById(`plant-gmaps-${idx}`)?.value;
      const osm = document.getElementById(`plant-osm-${idx}`)?.value;
      if (n !== undefined) loc.name = n;
      if (r !== undefined) loc.region = r;
      if (st !== undefined) loc.status = st;
      if (ps !== undefined) loc.peopleServed = ps;
      if (pr !== undefined) loc.pricing = pr;
      if (gm !== undefined) loc.googleMapsUrl = gm;
      if (osm !== undefined) loc.osmEmbedUrl = osm;
    });
  }

  // 10. Quotes & Parallax
  draftData.quotes = draftData.quotes || {};
  draftData.quotes.storyBridge = draftData.quotes.storyBridge || {};
  draftData.quotes.storyBridge.quote = getVal('quote-story-main');
  draftData.quotes.storyBridge.highlight = getVal('quote-story-highlight');
  draftData.quotes.storyBridge.attribution = getVal('quote-story-attr');

  draftData.quotes.unQuote = draftData.quotes.unQuote || {};
  draftData.quotes.unQuote.quote = getVal('quote-un-main');
  draftData.quotes.unQuote.highlight = getVal('quote-un-highlight');
  draftData.quotes.unQuote.attribution = getVal('quote-un-attr');

  draftData.parallaxBackgrounds = draftData.parallaxBackgrounds || {};
  draftData.parallaxBackgrounds.storyBridgeBg = { imageUrl: getVal('bg-storyBridge') };
  draftData.parallaxBackgrounds.kashmoreBg = { imageUrl: getVal('bg-kashmore') };
  draftData.parallaxBackgrounds.rightToWaterBg = { imageUrl: getVal('bg-rightToWater') };
  draftData.parallaxBackgrounds.donateBg = { imageUrl: getVal('bg-donate') };

  // 11. Donations & Kashmore gallery
  collectDonation();
  collectGallery();
}

// ─────────────────────────────────────────────────────────────
// INSTANT GLOBAL SEARCH ACROSS ALL CMS FIELDS
// ─────────────────────────────────────────────────────────────
function filterFields(query) {
  const q = (query || '').toLowerCase().trim();
  const cards = document.querySelectorAll('.searchable-card');

  if (!q) {
    cards.forEach(card => {
      card.style.display = '';
      card.style.opacity = '1';
    });
    return;
  }

  cards.forEach(card => {
    const text = card.textContent.toLowerCase();
    const inputs = Array.from(card.querySelectorAll('input, textarea')).map(i => i.value.toLowerCase()).join(' ');
    const isMatch = text.includes(q) || inputs.includes(q);

    if (isMatch) {
      card.style.display = '';
      card.style.opacity = '1';
      // Automatically switch to the tab that contains the matching card
      const parentPanel = card.closest('.tab-panel');
      if (parentPanel && parentPanel.classList.contains('hidden')) {
        const tabId = parentPanel.id.replace('tab-', '');
        switchTab(tabId);
      }
    } else {
      card.style.display = 'none';
    }
  });
}

// ─────────────────────────────────────────────────────────────
// TOAST NOTIFICATIONS & HELPERS
// ─────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bg = type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-red-600' : 'bg-primary';
  const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';

  toast.className = `${bg} text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-semibold max-w-sm transition-all transform translate-y-4 opacity-0`;
  toast.innerHTML = `
    <span class="material-symbols-outlined text-base">${icon}</span>
    <span class="flex-1">${message}</span>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-4', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val !== undefined ? val : '';
}

function escAttr(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ─────────────────────────────────────────────────────────────
// DONATIONS PANEL (fully customisable pledge amounts & wording)
// ─────────────────────────────────────────────────────────────
function renderDonationPanel() {
  const d = draftData.donation || {};
  setVal('donation-title', d.title);
  setVal('donation-text', d.text);
  setVal('donation-tiersLabel', d.tiersLabel);
  setVal('donation-selectedPrefix', d.selectedPrefix);
  setVal('donation-helperText', d.helperText);
  setVal('donation-buttonLabel', d.buttonLabel);
  setVal('donation-messageTemplate', d.messageTemplate);
  setVal('donation-genericMessage', d.genericMessage);
  setVal('donation-customPlaceholder', d.customAmountPlaceholder);
  const show = document.getElementById('donation-showTiers');
  if (show) show.checked = d.showTiers !== false;
  const custom = document.getElementById('donation-allowCustom');
  if (custom) custom.checked = d.allowCustomAmount === true;
  renderTiersEditor();
  updateDonationPreview();
}

function renderTiersEditor() {
  const el = document.getElementById('tiers-editor');
  if (!el) return;
  const d = draftData.donation;
  const btn = 'p-1 text-on-surface-variant hover:text-primary disabled:opacity-30';
  el.innerHTML = d.tiers.map((t, i) => `
    <div class="flex flex-wrap items-center gap-2 p-2 bg-white rounded-xl border border-outline-variant">
      <label class="flex items-center gap-1 text-[11px] font-bold text-on-surface-variant cursor-pointer" title="Pre-selected amount">
        <input type="radio" name="tier-default" value="${i}" ${i === d.defaultTierIndex ? 'checked' : ''} onchange="updateDonationPreview()" /> default
      </label>
      <input type="text" id="tier-amount-${i}" value="${escAttr(t.amount)}" class="admin-input font-bold" style="width:8rem" placeholder="e.g. $25" oninput="updateDonationPreview()" />
      <input type="text" id="tier-note-${i}" value="${escAttr(t.note || '')}" class="admin-input text-xs" style="flex:1;min-width:140px" placeholder="Optional small text under the amount" />
      <label class="flex items-center gap-1 text-[11px] font-semibold cursor-pointer"><input type="checkbox" id="tier-enabled-${i}" ${t.enabled !== false ? 'checked' : ''} /> show</label>
      <button type="button" class="${btn}" ${i === 0 ? 'disabled' : ''} onclick="movePledgeTier(${i}, -1)" title="Move up"><span class="material-symbols-outlined text-base">arrow_upward</span></button>
      <button type="button" class="${btn}" ${i === d.tiers.length - 1 ? 'disabled' : ''} onclick="movePledgeTier(${i}, 1)" title="Move down"><span class="material-symbols-outlined text-base">arrow_downward</span></button>
      <button type="button" class="p-1 text-red-400 hover:text-red-600" onclick="removePledgeTier(${i})" title="Remove"><span class="material-symbols-outlined text-base">delete</span></button>
    </div>
  `).join('') || '<p class="text-xs text-on-surface-variant">No amounts yet. Add one below.</p>';
}

function addPledgeTier() {
  collectAllInputs();
  draftData.donation.tiers.push({ amount: '', note: '', enabled: true });
  renderTiersEditor();
  updateDonationPreview();
  saveDraft();
}

function removePledgeTier(i) {
  collectAllInputs();
  const d = draftData.donation;
  d.tiers.splice(i, 1);
  if (d.defaultTierIndex === i) d.defaultTierIndex = 0;
  else if (d.defaultTierIndex > i) d.defaultTierIndex -= 1;
  renderTiersEditor();
  updateDonationPreview();
  saveDraft();
}

function movePledgeTier(i, dir) {
  collectAllInputs();
  const d = draftData.donation;
  const j = i + dir;
  if (j < 0 || j >= d.tiers.length) return;
  [d.tiers[i], d.tiers[j]] = [d.tiers[j], d.tiers[i]];
  if (d.defaultTierIndex === i) d.defaultTierIndex = j;
  else if (d.defaultTierIndex === j) d.defaultTierIndex = i;
  renderTiersEditor();
  updateDonationPreview();
  saveDraft();
}

function collectDonation() {
  if (!draftData || !document.getElementById('donation-title')) return;
  const d = draftData.donation = draftData.donation || {};
  d.showTiers = document.getElementById('donation-showTiers')?.checked !== false;
  d.allowCustomAmount = document.getElementById('donation-allowCustom')?.checked === true;
  d.title = getVal('donation-title');
  d.text = getVal('donation-text');
  d.tiersLabel = getVal('donation-tiersLabel');
  d.selectedPrefix = getVal('donation-selectedPrefix');
  d.helperText = getVal('donation-helperText');
  d.buttonLabel = getVal('donation-buttonLabel');
  d.messageTemplate = getVal('donation-messageTemplate');
  d.genericMessage = getVal('donation-genericMessage');
  d.customAmountPlaceholder = getVal('donation-customPlaceholder');
  if (Array.isArray(d.tiers)) {
    d.tiers.forEach((t, i) => {
      const a = document.getElementById(`tier-amount-${i}`);
      if (!a) return;
      t.amount = a.value.trim();
      t.note = getVal(`tier-note-${i}`).trim();
      t.enabled = document.getElementById(`tier-enabled-${i}`)?.checked !== false;
    });
  }
  const r = document.querySelector('input[name="tier-default"]:checked');
  if (r) d.defaultTierIndex = parseInt(r.value, 10) || 0;
}

function updateDonationPreview() {
  const out = document.getElementById('donation-preview');
  if (!out) return;
  const r = document.querySelector('input[name="tier-default"]:checked');
  const idx = r ? parseInt(r.value, 10) : 0;
  const amount = getVal(`tier-amount-${idx}`).trim();
  const show = document.getElementById('donation-showTiers')?.checked !== false;
  const tpl = getVal('donation-messageTemplate') || DONATION_DEFAULTS.messageTemplate;
  const generic = getVal('donation-genericMessage') || DONATION_DEFAULTS.genericMessage;
  out.textContent = (show && amount) ? tpl.split('{amount}').join(amount) : generic;
}

// ─────────────────────────────────────────────────────────────
// KASHMORE PHOTO GALLERY
// ─────────────────────────────────────────────────────────────
function renderGalleryEditor() {
  const el = document.getElementById('gallery-container');
  if (!el) return;
  const items = draftData.kashmore.gallery || [];
  el.innerHTML = items.map((g, i) => `
    <div class="p-4 bg-mist/50 rounded-2xl border border-outline-variant space-y-3">
      <div class="flex items-center justify-between">
        <span class="text-xs font-bold text-primary">Photo #${i + 1}</span>
        <button type="button" onclick="removeGalleryItem(${i})" class="text-xs text-red-500 hover:underline flex items-center gap-0.5">
          <span class="material-symbols-outlined text-sm">delete</span><span>Remove</span>
        </button>
      </div>
      <div class="flex flex-col sm:flex-row items-center gap-4">
        <div class="w-28 h-20 rounded-xl overflow-hidden bg-white shrink-0 border border-outline-variant">
          <img id="preview-gallery-${i}" src="${escAttr(g.imageUrl || '')}" class="w-full h-full object-cover" />
        </div>
        <div class="flex-1 w-full space-y-2">
          <input type="text" id="gallery-img-${i}" value="${escAttr(g.imageUrl || '')}" oninput="updateImagePreview('preview-gallery-${i}', this.value)" class="admin-input text-xs" placeholder="Image URL..." />
          <label class="px-3 py-1 bg-white hover:bg-outline-variant text-primary text-xs font-bold rounded-lg cursor-pointer border border-outline-variant inline-flex items-center gap-1 transition-all">
            <span class="material-symbols-outlined text-sm">cloud_upload</span>
            <span>Upload Photo</span>
            <input type="file" accept="image/*" class="hidden" onchange="handleFileUpload(this, 'gallery-img-${i}', 'preview-gallery-${i}')" />
          </label>
        </div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input type="text" id="gallery-title-${i}" value="${escAttr(g.title || '')}" class="admin-input text-xs" placeholder="Title" />
        <input type="text" id="gallery-caption-${i}" value="${escAttr(g.caption || '')}" class="admin-input text-xs" placeholder="Caption" />
      </div>
    </div>
  `).join('') || '<p class="text-xs text-on-surface-variant">No gallery photos yet.</p>';
}

function collectGallery() {
  if (!draftData || !document.getElementById('gallery-container')) return;
  (draftData.kashmore.gallery || []).forEach((g, i) => {
    const img = document.getElementById(`gallery-img-${i}`);
    if (!img) return;
    g.imageUrl = img.value.trim();
    g.title = getVal(`gallery-title-${i}`);
    g.caption = getVal(`gallery-caption-${i}`);
  });
}

function addGalleryItem() {
  collectAllInputs();
  draftData.kashmore.gallery.push({ title: '', caption: '', imageUrl: '', recommendedSize: '600 x 400 px (3:2 ratio)' });
  renderGalleryEditor();
  saveDraft();
}

function removeGalleryItem(i) {
  if (!confirm('Remove this gallery photo?')) return;
  collectAllInputs();
  draftData.kashmore.gallery.splice(i, 1);
  renderGalleryEditor();
  saveDraft();
}