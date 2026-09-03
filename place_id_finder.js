// ── State ────────────────────────────────────────────────────────────────
// Progress is persisted to localStorage so work survives a page reload —
// this is a standalone tool the user runs in their own browser, not a
// claude.ai artifact, so localStorage is the right choice here.
const STORAGE_KEY = 'twi_place_id_finder_progress_v1';
const API_KEY_STORAGE = 'twi_place_id_finder_api_key';

let progress = {};      // slug -> { placeId, name, address, status: 'done'|'skipped' }
let activeSlug = null;
let apiKey = '';
let placesLib = null;
let currentResults = [];
let selectedResult = null;
let selectedIdx = -1;

// Pre-fetched search results, cached per slug — populated by "Auto-fetch all"
// so reviewing a company doesn't require clicking Search first.
const resultCache = {};
let batchRunning = false;
let batchCancelled = false;

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    progress = raw ? JSON.parse(raw) : {};
  } catch (e) {
    progress = {};
  }
}
function saveProgress() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }
  catch (e) { console.warn('Could not save progress:', e); }
}

// ── Stats & progress bar ────────────────────────────────────────────────
function updateStats() {
  const total = COMPANIES.length;
  const done = Object.values(progress).filter(p => p.status === 'done').length;
  const skipped = Object.values(progress).filter(p => p.status === 'skipped').length;
  const remaining = total - done - skipped;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statDone').textContent = done;
  document.getElementById('statSkipped').textContent = skipped;
  document.getElementById('statRemaining').textContent = remaining;

  const pct = total ? Math.round(((done + skipped) / total) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressLabel').textContent = `${done + skipped} / ${total}`;
}

// ── Country filter population ───────────────────────────────────────────
function populateCountryFilter() {
  const sel = document.getElementById('countryFilter');
  const countries = [...new Set(COMPANIES.map(c => c.country))].sort();
  countries.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    sel.appendChild(opt);
  });
}

// ── List rendering ───────────────────────────────────────────────────────
function getStatus(slug) {
  const p = progress[slug];
  return p ? p.status : 'pending';
}

function filteredCompanies() {
  const q = document.getElementById('searchBox').value.trim().toLowerCase();
  const country = document.getElementById('countryFilter').value;
  const status = document.getElementById('statusFilter').value;

  return COMPANIES.filter(c => {
    if (q && !c.name.toLowerCase().includes(q)) return false;
    if (country && c.country !== country) return false;
    const st = getStatus(c.slug);
    if (status === 'pending' && st !== 'pending') return false;
    if (status === 'done' && st !== 'done') return false;
    if (status === 'skipped' && st !== 'skipped') return false;
    return true;
  });
}

function renderList() {
  const panel = document.getElementById('listPanel');
  const list = filteredCompanies();
  panel.innerHTML = list.map(c => {
    const st = getStatus(c.slug);
    const isActive = c.slug === activeSlug;
    const badge = st === 'done' ? '<span class="cr-badge done">✓ DONE</span>'
                : st === 'skipped' ? '<span class="cr-badge skip">SKIPPED</span>'
                : resultCache[c.slug] ? '<span class="cr-badge fetched">READY</span>' : '';
    return `<div class="company-row ${isActive ? 'active' : ''} ${st !== 'pending' ? 'done' : ''}" data-slug="${c.slug}">
      <div class="cr-name">${escapeHtml(c.name)}${badge}</div>
      <div class="cr-meta">${escapeHtml(c.country)}${c.city ? ' · ' + escapeHtml(c.city) : ''}</div>
      ${c.address ? `<div class="cr-addr">📍 ${escapeHtml(c.address)}</div>` : ''}
    </div>`;
  }).join('') || '<div style="padding:24px;font-family:var(--font-mono);font-size:12px;color:var(--ink-faint);">No companies match this filter.</div>';

  panel.querySelectorAll('.company-row').forEach(row => {
    row.addEventListener('click', () => selectCompany(row.dataset.slug));
  });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ── Detail panel ─────────────────────────────────────────────────────────
function selectCompany(slug) {
  activeSlug = slug;
  selectedResult = null;
  selectedIdx = -1;
  currentResults = resultCache[slug] || [];
  renderList();
  renderDetail();
  // If nothing cached yet for this company, search it on the fly.
  if (!resultCache[slug] && placesLib) {
    doSearch();
  } else if (currentResults.length) {
    renderResults();
  }
}

function defaultQueryFor(c) {
  return [c.name, c.city, c.country].filter(Boolean).join(', ');
}

async function searchQuery(query) {
  if (!placesLib) throw new Error('API key not connected yet');
  const { places } = await placesLib.Place.searchByText({
    textQuery: query,
    fields: ['id', 'displayName', 'formattedAddress', 'websiteURI', 'location'],
    maxResultCount: 6,
  });
  return places || [];
}

function renderDetail() {
  const panel = document.getElementById('detailPanel');
  if (!activeSlug) {
    panel.innerHTML = `<div class="empty-state"><div class="em-mark">No company selected</div><div>Pick a company from the list, or paste your API key above to get started.</div></div>`;
    return;
  }
  const c = COMPANIES.find(x => x.slug === activeSlug);
  if (!c) { panel.innerHTML = ''; return; }
  const existing = progress[c.slug];

  let confirmedHtml = '';
  if (existing && existing.status === 'done') {
    confirmedHtml = `<div class="confirmed-box">
      <div class="cb-label">✓ Confirmed</div>
      <div class="cb-name">${escapeHtml(existing.matchedName || '')}</div>
      <div class="cb-addr">${escapeHtml(existing.address || '')}</div>
      <div class="cb-id">${escapeHtml(existing.placeId)}</div>
    </div>`;
  }

  const defaultQuery = [c.name, c.city, c.country].filter(Boolean).join(', ');

  panel.innerHTML = `
    <div class="dp-name">${escapeHtml(c.name)}</div>
    <div class="dp-meta-row">
      <div>ID ${c.id}</div>
      <div>${escapeHtml(c.country)}</div>
      ${c.site ? `<a href="${escapeHtml(c.site)}" target="_blank" rel="noopener">${escapeHtml(c.site)} ↗</a>` : ''}
    </div>
    ${c.address
      ? `<div class="dp-address-box"><div class="addr-label">Known Address</div>${escapeHtml(c.address)}</div>`
      : `<div class="dp-address-box dp-address-empty"><div class="addr-label">Known Address</div>No address on file — search by name, city and country only.</div>`}
    ${confirmedHtml}
    <div class="search-row">
      <input type="text" class="search-input" id="placeSearchInput" value="${escapeHtml(defaultQuery)}" placeholder="Search query...">
      <button class="btn primary" id="searchPlaceBtn">Search ↗</button>
    </div>
    <div id="resultsArea"></div>
    <div class="results-label">Manual entry (paste a Place ID directly)</div>
    <div class="manual-row">
      <input type="text" id="manualPlaceId" placeholder="ChIJ..." value="${existing ? escapeHtml(existing.placeId) : ''}">
      <button class="btn" id="useManualBtn">Use this ID</button>
    </div>
    <div class="action-row">
      <button class="btn primary" id="confirmBtn" ${selectedResult ? '' : 'disabled'}>Confirm & Next →</button>
      <button class="btn" id="skipBtn">Skip company</button>
      <button class="btn" id="nextBtn">Next without saving →</button>
    </div>
  `;

  document.getElementById('searchPlaceBtn').addEventListener('click', doSearch);
  document.getElementById('placeSearchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
  });
  document.getElementById('useManualBtn').addEventListener('click', useManualId);
  document.getElementById('confirmBtn').addEventListener('click', confirmSelection);
  document.getElementById('skipBtn').addEventListener('click', skipCompany);
  document.getElementById('nextBtn').addEventListener('click', () => advanceTo(nextSlug()));
}

// ── Places API (New) search ─────────────────────────────────────────────
async function doSearch() {
  const input = document.getElementById('placeSearchInput');
  const query = input ? input.value.trim() : defaultQueryFor(COMPANIES.find(c => c.slug === activeSlug));
  const resultsArea = document.getElementById('resultsArea');
  if (!query) return;
  if (!placesLib) {
    if (resultsArea) resultsArea.innerHTML = `<div class="error-box">Load your API key above first.</div>`;
    return;
  }
  if (resultsArea) resultsArea.innerHTML = `<div class="loading-spin">Searching…</div>`;

  try {
    const places = await searchQuery(query);
    currentResults = places;
    resultCache[activeSlug] = places;
    renderResults();
  } catch (err) {
    if (resultsArea) resultsArea.innerHTML = `<div class="error-box">Search failed: ${escapeHtml(err.message || String(err))}</div>`;
  }
}

function renderResults() {
  const resultsArea = document.getElementById('resultsArea');
  if (!resultsArea) return;
  if (!currentResults.length) {
    resultsArea.innerHTML = `<div class="loading-spin">No results. Try adjusting the search query, or use manual entry below.</div>`;
    return;
  }
  resultsArea.innerHTML = `<div class="results-label">Results — click, or press 1–${Math.min(currentResults.length,6)}</div>` +
    currentResults.map((p, i) => `
      <div class="result-card ${i === selectedIdx ? 'selected' : ''}" data-idx="${i}">
        <div class="rc-name"><span class="rc-num">${i + 1}</span> ${escapeHtml(p.displayName || '')}</div>
        <div class="rc-addr">${escapeHtml(p.formattedAddress || '')}</div>
        <div class="rc-id">${escapeHtml(p.id || '')}</div>
      </div>`).join('');

  resultsArea.querySelectorAll('.result-card').forEach(card => {
    card.addEventListener('click', () => selectResultIdx(parseInt(card.dataset.idx, 10)));
  });
}

function selectResultIdx(idx) {
  const p = currentResults[idx];
  if (!p) return;
  selectedIdx = idx;
  selectedResult = { placeId: p.id, name: p.displayName || '', address: p.formattedAddress || '' };
  document.querySelectorAll('.result-card').forEach((c, i) => c.classList.toggle('selected', i === idx));
  const confirmBtn = document.getElementById('confirmBtn');
  if (confirmBtn) confirmBtn.disabled = false;
}

function useManualId() {
  const val = document.getElementById('manualPlaceId').value.trim();
  if (!val) return;
  selectedResult = { placeId: val, name: '', address: '' };
  document.getElementById('confirmBtn').disabled = false;
  confirmSelection();
}

// ── Batch pre-fetch ──────────────────────────────────────────────────────
// Runs a search for every pending company in the current filter, one at a
// time with a short delay between calls (Places API has per-second quotas —
// this keeps well under them). Results are cached so selecting a company
// afterwards shows results instantly, no per-company Search click needed.
async function runBatchFetch() {
  if (!placesLib) { alert('Load your API key above first.'); return; }
  if (batchRunning) { batchCancelled = true; return; }

  const targets = filteredCompanies().filter(c => getStatus(c.slug) === 'pending' && !resultCache[c.slug]);
  if (!targets.length) { alert('Nothing to pre-fetch — every company in this filter is already cached, done, or skipped.'); return; }

  batchRunning = true;
  batchCancelled = false;
  const btn = document.getElementById('batchFetchBtn');
  const statusEl = document.getElementById('batchStatus');

  for (let i = 0; i < targets.length; i++) {
    if (batchCancelled) break;
    const c = targets[i];
    if (btn) btn.textContent = `Stop (${i + 1}/${targets.length})`;
    if (statusEl) statusEl.textContent = `Pre-fetching: ${c.name}`;
    try {
      const places = await searchQuery(defaultQueryFor(c));
      resultCache[c.slug] = places;
    } catch (err) {
      resultCache[c.slug] = []; // mark as attempted, empty on failure
      console.warn('Pre-fetch failed for', c.slug, err);
    }
    // Refresh the currently open company if it was just fetched.
    if (c.slug === activeSlug) {
      currentResults = resultCache[c.slug];
      renderResults();
    }
    renderList(); // shows the "fetched" dot as it progresses
    await sleep(220); // stay comfortably under Places API QPS limits
  }

  batchRunning = false;
  if (btn) btn.textContent = 'Auto-fetch all pending';
  if (statusEl) statusEl.textContent = batchCancelled
    ? 'Pre-fetch stopped.'
    : `Pre-fetch complete — ${targets.length} companies ready to review.`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Keyboard shortcuts for fast review ──────────────────────────────────
// 1–6 select a result, Enter confirms the current selection, S skips,
// → advances without saving. Ignored while typing in a text input.
function handleKeydown(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input') return;
  if (!activeSlug) return;

  if (e.key >= '1' && e.key <= '6') {
    const idx = parseInt(e.key, 10) - 1;
    if (currentResults[idx]) selectResultIdx(idx);
  } else if (e.key === 'Enter') {
    if (selectedResult) confirmSelection();
  } else if (e.key.toLowerCase() === 's') {
    skipCompany();
  } else if (e.key === 'ArrowRight') {
    advanceTo(nextSlug());
  }
}
function confirmSelection() {
  if (!activeSlug || !selectedResult) return;
  const c = COMPANIES.find(x => x.slug === activeSlug);
  progress[activeSlug] = {
    placeId: selectedResult.placeId,
    matchedName: selectedResult.name,
    address: selectedResult.address,
    status: 'done',
  };
  saveProgress();
  updateStats();
  const next = nextSlug();
  advanceTo(next);
}

function skipCompany() {
  if (!activeSlug) return;
  progress[activeSlug] = { placeId: '', matchedName: '', address: '', status: 'skipped' };
  saveProgress();
  updateStats();
  advanceTo(nextSlug());
}

function nextSlug() {
  const list = filteredCompanies();
  const idx = list.findIndex(c => c.slug === activeSlug);
  if (idx === -1 || idx + 1 >= list.length) return null;
  return list[idx + 1].slug;
}

function advanceTo(slug) {
  currentResults = [];
  selectedResult = null;
  activeSlug = slug;
  renderList();
  renderDetail();
}

// ── CSV export ───────────────────────────────────────────────────────────
function exportCsv() {
  const rows = [['ID', 'Slug', 'Company Name', 'Country', 'Status', 'Google Place ID', 'Matched Name', 'Matched Address']];
  COMPANIES.forEach(c => {
    const p = progress[c.slug];
    if (!p) return; // only export ones actually worked on
    rows.push([
      c.id, c.slug, c.name, c.country,
      p.status, p.placeId || '', p.matchedName || '', p.address || '',
    ]);
  });
  if (rows.length === 1) {
    alert('No progress to export yet — confirm or skip at least one company first.');
    return;
  }
  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `twi_place_ids_${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// ── API key handling ─────────────────────────────────────────────────────
async function applyApiKey() {
  const input = document.getElementById('apiKeyInput');
  const key = input.value.trim();
  const statusEl = document.getElementById('keyStatus');
  if (!key) return;
  apiKey = key;
  try { localStorage.setItem(API_KEY_STORAGE, key); } catch (e) {}

  statusEl.textContent = 'Loading…';
  statusEl.className = 'key-status pending';

  try {
    await loadGoogleMapsScript(key);
    placesLib = await google.maps.importLibrary('places');
    statusEl.textContent = 'Connected';
    statusEl.className = 'key-status ok';
  } catch (err) {
    statusEl.textContent = 'Failed to load — check your key';
    statusEl.className = 'key-status pending';
    console.error(err);
  }
}

function loadGoogleMapsScript(key) {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) { resolve(); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&v=weekly&loading=async&callback=__gmapsLoaded`;
    window.__gmapsLoaded = () => resolve();
    script.onerror = () => reject(new Error('Script failed to load'));
    document.head.appendChild(script);
  });
}

// ── Init ─────────────────────────────────────────────────────────────────
function init() {
  loadProgress();
  populateCountryFilter();
  updateStats();
  renderList();
  renderDetail();

  document.getElementById('applyKeyBtn').addEventListener('click', applyApiKey);
  document.getElementById('apiKeyInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') applyApiKey();
  });
  document.getElementById('searchBox').addEventListener('input', renderList);
  document.getElementById('countryFilter').addEventListener('change', renderList);
  document.getElementById('statusFilter').addEventListener('change', renderList);
  document.getElementById('exportBtn').addEventListener('click', exportCsv);
  document.getElementById('batchFetchBtn').addEventListener('click', runBatchFetch);
  document.addEventListener('keydown', handleKeydown);

  try {
    const savedKey = localStorage.getItem(API_KEY_STORAGE);
    if (savedKey) {
      document.getElementById('apiKeyInput').value = savedKey;
      applyApiKey();
    }
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', init);
