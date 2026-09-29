/**
 * renderer/renderer.js
 * Logika UI jendela AdrStation. Semua akses ke sistem (printer, file,
 * jaringan) lewat window.adrstation, yang diekspos dari preload.js —
 * renderer sendiri tidak punya akses Node langsung (contextIsolation).
 */

let currentSettings = null;
let currentProfiles = [];

// ---------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
async function init() {
  currentSettings = await window.adrstation.getSettings();
  currentProfiles = await window.adrstation.listPaperProfiles();

  await renderNetworkInfo();
  await renderPrinterList();
  renderPaperGrid();
  renderPrintOptions();
  renderStatusCard();
  await renderJobHistory();

  setServerPill(true, 'Server running');

  window.adrstation.onJobUpdate((job) => {
    prependJob(job);
  });
  window.adrstation.onServerError((message) => {
    setServerPill(false, 'Server error: ' + message);
  });
}

function setServerPill(ok, text) {
  const pill = document.getElementById('server-pill');
  pill.classList.toggle('ok', ok);
  pill.classList.toggle('err', !ok);
  document.getElementById('server-pill-text').textContent = text;
  document.getElementById('status-server').textContent = text;
}

// ---------------------------------------------------------------------
// Dashboard — pairing QR + network info
// ---------------------------------------------------------------------
async function renderNetworkInfo() {
  const info = await window.adrstation.getNetworkInfo();
  document.getElementById('lan-ip').textContent = info.primary || 'Not connected to Wi-Fi/LAN';
  document.getElementById('lan-port').textContent = info.port;
  document.getElementById('pairing-code').textContent = info.pairingCode || '—';
  const img = document.getElementById('qr-image');
  if (info.qrDataUrl) {
    img.src = info.qrDataUrl;
    img.style.display = 'block';
  } else {
    img.style.display = 'none';
  }
}

document.getElementById('btn-regen-code').addEventListener('click', async () => {
  currentSettings = await window.adrstation.regeneratePairingCode();
  await renderNetworkInfo();
});

// ---------------------------------------------------------------------
// Printer Settings — system printer dropdown
// ---------------------------------------------------------------------
async function renderPrinterList() {
  const select = document.getElementById('select-printer');
  const printers = await window.adrstation.listSystemPrinters();
  select.innerHTML = '';

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = '(System default printer)';
  select.appendChild(defaultOpt);

  printers.forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  select.value = currentSettings.systemPrinterName || '';
  select.addEventListener('change', async () => {
    currentSettings = await window.adrstation.saveSettings({ systemPrinterName: select.value || null });
    renderStatusCard();
  });

  if (printers.length === 0) {
    const opt = document.createElement('option');
    opt.disabled = true;
    opt.textContent = 'No printers found — check that Epson L8050 drivers are installed';
    select.appendChild(opt);
  }
}

// ---------------------------------------------------------------------
// Printer Settings — paper size grid
// ---------------------------------------------------------------------
function renderPaperGrid() {
  const grid = document.getElementById('paper-grid');
  grid.innerHTML = '';
  currentProfiles.forEach((profile) => {
    const card = document.createElement('div');
    card.className = 'paper-card' + (profile.id === currentSettings.paperProfileId ? ' selected' : '');
    card.innerHTML = `<b>${profile.label}</b><span class="dims">${profile.widthMm} × ${profile.heightMm} mm${profile.borderlessSupported ? ' · borderless ok' : ''}</span>`;
    card.addEventListener('click', async () => {
      currentSettings = await window.adrstation.saveSettings({ paperProfileId: profile.id });
      renderPaperGrid();
      renderStatusCard();
    });
    grid.appendChild(card);
  });
}

document.getElementById('btn-add-custom-paper').addEventListener('click', () => {
  const form = document.getElementById('custom-paper-form');
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('btn-save-custom-paper').addEventListener('click', async () => {
  const label = document.getElementById('cp-label').value.trim();
  const widthMm = parseFloat(document.getElementById('cp-width').value);
  const heightMm = parseFloat(document.getElementById('cp-height').value);
  const borderlessSupported = document.getElementById('cp-borderless').checked;

  if (!widthMm || !heightMm) {
    alert('Please fill in width and height (mm).');
    return;
  }

  const profile = await window.adrstation.addCustomPaperProfile({ label, widthMm, heightMm, borderlessSupported });
  currentProfiles.push(profile);
  document.getElementById('custom-paper-form').style.display = 'none';
  document.getElementById('cp-label').value = '';
  document.getElementById('cp-width').value = '';
  document.getElementById('cp-height').value = '';
  renderPaperGrid();
});

// ---------------------------------------------------------------------
// Printer Settings — borderless / margin / copies / auto-print
// ---------------------------------------------------------------------
function renderPrintOptions() {
  const borderlessToggle = document.getElementById('toggle-borderless');
  const marginToggle = document.getElementById('toggle-custom-margin');
  const marginFields = document.getElementById('margin-fields');
  const copiesInput = document.getElementById('copies');
  const autoPrintToggle = document.getElementById('toggle-auto-print');

  borderlessToggle.checked = !!currentSettings.borderless;
  marginToggle.checked = !!currentSettings.customMarginMm;
  marginFields.style.display = marginToggle.checked ? 'grid' : 'none';
  copiesInput.value = currentSettings.copies || 1;
  autoPrintToggle.checked = currentSettings.autoPrintOnReceive !== false;

  const m = currentSettings.customMarginMm || { top: 0, right: 0, bottom: 0, left: 0 };
  document.getElementById('margin-top').value = m.top;
  document.getElementById('margin-right').value = m.right;
  document.getElementById('margin-bottom').value = m.bottom;
  document.getElementById('margin-left').value = m.left;

  borderlessToggle.onchange = async () => {
    currentSettings = await window.adrstation.saveSettings({ borderless: borderlessToggle.checked });
    renderStatusCard();
  };

  marginToggle.onchange = async () => {
    marginFields.style.display = marginToggle.checked ? 'grid' : 'none';
    const value = marginToggle.checked ? readMarginFields() : null;
    currentSettings = await window.adrstation.saveSettings({ customMarginMm: value });
  };

  ['margin-top', 'margin-right', 'margin-bottom', 'margin-left'].forEach((id) => {
    document.getElementById(id).addEventListener('change', async () => {
      if (!marginToggle.checked) return;
      currentSettings = await window.adrstation.saveSettings({ customMarginMm: readMarginFields() });
    });
  });

  copiesInput.addEventListener('change', async () => {
    currentSettings = await window.adrstation.saveSettings({ copies: Math.max(1, parseInt(copiesInput.value, 10) || 1) });
  });

  autoPrintToggle.onchange = async () => {
    currentSettings = await window.adrstation.saveSettings({ autoPrintOnReceive: autoPrintToggle.checked });
  };
}

function readMarginFields() {
  return {
    top: parseFloat(document.getElementById('margin-top').value) || 0,
    right: parseFloat(document.getElementById('margin-right').value) || 0,
    bottom: parseFloat(document.getElementById('margin-bottom').value) || 0,
    left: parseFloat(document.getElementById('margin-left').value) || 0,
  };
}

// ---------------------------------------------------------------------
// Dashboard status card
// ---------------------------------------------------------------------
function renderStatusCard() {
  document.getElementById('status-printer').textContent = currentSettings.systemPrinterName || '(system default)';
  const profile = currentProfiles.find((p) => p.id === currentSettings.paperProfileId);
  document.getElementById('status-paper').textContent = profile ? profile.label : '—';
  document.getElementById('status-borderless').textContent = currentSettings.borderless ? 'On' : 'Off';
}

// ---------------------------------------------------------------------
// Print log
// ---------------------------------------------------------------------
async function renderJobHistory() {
  const jobs = await window.adrstation.getJobHistory();
  const list = document.getElementById('job-list');
  list.innerHTML = '';
  if (jobs.length === 0) {
    list.innerHTML = '<div class="job-empty">No print jobs yet. They will show up here as soon as the tablet sends a photo.</div>';
    return;
  }
  jobs.forEach((job) => list.appendChild(jobRow(job)));
}

function prependJob(job) {
  const list = document.getElementById('job-list');
  const empty = list.querySelector('.job-empty');
  if (empty) empty.remove();
  list.insertBefore(jobRow(job), list.firstChild);
}

function jobRow(job) {
  const el = document.createElement('div');
  el.className = 'job-item';
  const time = new Date(job.at).toLocaleTimeString();
  el.innerHTML = `<div class="job-top"><span class="job-status ${job.status}">${job.status}</span><span class="job-time">${time}</span></div><div>${job.message}</div>`;
  return el;
}

init();
