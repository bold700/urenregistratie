/**
 * Urenregistratie – projectmanagement en facturatie
 * Vanilla JS + Material Web. Storage: localStorage / Firebase.
 */

const STORAGE_KEYS = {
  projects: 'bold700:projects',
  entries: 'bold700:timeentries',
  invoices: 'bold700:invoices',
  settings: 'bold700:settings',
  clients: 'bold700:clients',
  labels: 'bold700:labels',
  timer: 'bold700:timer',
  // Legacy keys voor migratie
  legacy: 'urenregistratie-data',
  legacyCapacity: 'urenregistratie-capacity',
};

const DEFAULT_LABELS = [
  { id: 'lbl-1', name: 'Design' },
  { id: 'lbl-2', name: 'Call' },
  { id: 'lbl-3', name: 'Research' },
  { id: 'lbl-4', name: 'Development' },
  { id: 'lbl-5', name: 'Overleg' },
];

const formatEur = (n) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n || 0);

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const formatEntryDateTime = (e) => (e?.createdAt ? formatDateTime(e.createdAt) : formatDate(e?.date));

const today = () => new Date().toISOString().split('T')[0];
const uid = () => Math.random().toString(36).slice(2, 9);
const isMobile = () => window.matchMedia('(max-width: 960px)').matches;
const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};
const typeLabel = (t) => ({ hourly: 'Per uur', fixed: 'Vaste prijs', retainer: 'Retainer (vast bedrag)', retainer_hours: 'Retainer (uren per periode)' })[t] || t;
const periodLabel = (p) => ({ week: 'p/week', '4weeks': 'p/4wk', month: 'p/maand', quarter: 'p/kwartaal' })[p] || 'p/maand';
const retainerHoursAmount = (p) => (p.hoursPerPeriod || 0) * (p.rate || 0);
const retainerAmountPerMonth = (p) => {
  const amt = p.type === 'retainer' ? (p.rate || 0) : retainerHoursAmount(p);
  if (!amt) return 0;
  const mult = { week: 4.33, '4weeks': 1, month: 1, quarter: 1 / 3 }[p.period || 'month'] ?? 1;
  return amt * mult;
};
const retainerHoursPerWeek = (p) => {
  if (p.type !== 'retainer_hours' || !p.hoursPerPeriod) return 0;
  const mult = { week: 1, '4weeks': 0.25, month: 1 / 4.33, quarter: 1 / 13 }[p.period || 'month'] ?? 1 / 4.33;
  return (p.hoursPerPeriod || 0) * mult;
};
const retainerHoursPerMonth = (p) => {
  if (p.type !== 'retainer_hours' || !p.hoursPerPeriod) return 0;
  const mult = { week: 4.33, '4weeks': 1, month: 1, quarter: 1 / 3 }[p.period || 'month'] ?? 1;
  return (p.hoursPerPeriod || 0) * mult;
};

/** ISO weeknummer (week 1 = week met eerste donderdag van het jaar) */
function getISOWeek(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

/** Aggregeert uren en omzet per week (maandag–zondag) voor de laatste N weken */
function getWeeklyHoursData(entries, numWeeks = 12, projects = []) {
  const weeks = [];
  const now = new Date();
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const fmt = (iso) => {
    const d = new Date(iso);
    return `${d.getDate()} ${months[d.getMonth()]}`;
  };
  for (let i = numWeeks - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - (i * 7));
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    const weekStart = d.toISOString().split('T')[0];
    const weekEnd = addDays(weekStart, 6);
    const weekEntries = entries.filter((e) => e.date >= weekStart && e.date <= weekEnd);
    const hours = weekEntries.reduce((s, e) => s + (e.hours || 0), 0);
    const revenue = weekEntries.reduce((s, e) => {
      const p = projects.find((pr) => pr.id === e.projectId);
      if (!p || e.notBillable) return s;
      if (p.type === 'hourly' || p.type === 'retainer_hours') return s + (e.hours || 0) * (p.rate || 0);
      return s;
    }, 0);
    const weekNr = getISOWeek(d);
    const dateRange = `${fmt(weekStart)} – ${fmt(weekEnd)}`;
    weeks.push({ label: `WK ${weekNr}`, hours, revenue, weekStart, weekEnd, weekNr, dateRange });
  }
  return weeks;
}

let _hoursChartInstance = null;
let _hoursPerProjectChartInstance = null;
let _hoursPerLabelChartInstance = null;

function getComputedChartColor(cssVar) {
  const val = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  return val || '#4C662B';
}

function renderHoursChart(canvasId, entries, weekCapacity = 40, projects = []) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  if (_hoursChartInstance) {
    _hoursChartInstance.destroy();
    _hoursChartInstance = null;
  }
  const data = getWeeklyHoursData(entries, 12, projects);
  const isDark = document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-color-scheme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
  const primaryColor = getComputedChartColor('--md-sys-color-primary');
  const errorColor = getComputedChartColor('--md-sys-color-error');

  _hoursChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map((w) => w.label),
      datasets: [
        {
          label: 'Uren',
          data: data.map((w) => w.hours),
          backgroundColor: data.map((w) => w.hours >= weekCapacity ? errorColor : primaryColor),
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: { color: textColor, boxWidth: 12, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const w = data[items[0]?.dataIndex];
              return w ? `${w.label} · ${w.dateRange}` : items[0]?.label;
            },
            label: (ctx) => `${ctx.raw.toFixed(1)} uur`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: gridColor },
          ticks: { color: textColor, maxRotation: 45, font: { size: 10 } },
        },
        y: {
          type: 'linear',
          position: 'left',
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor, callback: (v) => v + 'u' },
        },
      },
    },
  });
}

/** Uren per project voor horizontaal staafdiagram. activeOnly=true: alleen actieve projecten (hoofddashboard). */
function getHoursPerProjectData(entries, projects, activeOnly = true) {
  const list = activeOnly ? projects.filter((p) => p.status === 'active') : projects;
  return list
    .map((p) => ({
      name: p.name,
      client: p.client,
      hours: entries.filter((e) => e.projectId === p.id).reduce((s, e) => s + (e.hours || 0), 0),
    }))
    .filter((x) => x.hours > 0)
    .sort((a, b) => b.hours - a.hours);
}

function renderHoursPerProjectChart(canvasId, entries, projects = [], activeOnly = true, hideClientInLabel = false) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  if (_hoursPerProjectChartInstance) {
    _hoursPerProjectChartInstance.destroy();
    _hoursPerProjectChartInstance = null;
  }
  const data = getHoursPerProjectData(entries, projects, activeOnly);
  if (data.length === 0) return;
  const isDark = document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-color-scheme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
  const colors = [
    getComputedChartColor('--md-sys-color-primary'),
    getComputedChartColor('--md-sys-color-secondary'),
    getComputedChartColor('--md-sys-color-tertiary'),
    getComputedChartColor('--md-sys-color-primary-container'),
    getComputedChartColor('--md-sys-color-secondary-container'),
    getComputedChartColor('--md-sys-color-tertiary-container'),
  ];
  const labelFn = (d) => (hideClientInLabel || !d.client ? d.name : `${d.name} · ${d.client}`);
  _hoursPerProjectChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(labelFn),
      datasets: [{
        label: 'Uren',
        data: data.map((d) => d.hours),
        backgroundColor: data.map((_, i) => colors[i % colors.length]),
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.raw.toFixed(1)} uur`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor, callback: (v) => v + 'u', font: { size: 10 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: textColor, font: { size: 11 }, maxRotation: 0 },
        },
      },
    },
  });
}

/** Uren die al X weken open staan (nog te factureren) */
function getOldUnbilledEntries(entries, draftInvoiceIds, projects, weeks = 4) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - weeks * 7);
  const cutoffStr = cutoff.toISOString().split('T')[0];
  return entries
    .filter((e) => !e.notBillable && (!e.invoiceId || draftInvoiceIds.has(e.invoiceId)) && e.date < cutoffStr)
    .map((e) => {
      const p = projects.find((pr) => pr.id === e.projectId);
      const value = (p?.type === 'hourly' || p?.type === 'retainer_hours') ? (e.hours || 0) * (p?.rate || 0) : 0;
      return { ...e, project: p, value };
    })
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/** Budgetverbruik voor projecten met uren- of €-budget */
function getBudgetUsageData(entries, projects) {
  return projects
    .filter((p) => p.budget > 0 && (p.type === 'hourly' || p.type === 'fixed'))
    .map((p) => {
      const pEntries = entries.filter((e) => e.projectId === p.id);
      const usedHours = pEntries.reduce((s, e) => s + (e.hours || 0), 0);
      const usedEur = pEntries.filter((e) => !e.notBillable).reduce((s, e) => s + (e.hours || 0) * (p.rate || 0), 0);
      if (p.type === 'hourly') {
        const budget = p.budget;
        const pct = budget > 0 ? Math.min(150, (usedHours / budget) * 100) : 0;
        return { project: p, used: usedHours, budget, pct, unit: 'u', usedLabel: `${usedHours.toFixed(1)}u`, budgetLabel: `${budget}u` };
      }
      const budget = p.budget;
      const pct = budget > 0 ? Math.min(150, (usedEur / budget) * 100) : 0;
      return { project: p, used: usedEur, budget, pct, unit: 'eur', usedLabel: formatEur(usedEur), budgetLabel: formatEur(budget) };
    })
    .filter((x) => x.budget > 0);
}

/** Facturatie-efficiëntie: factureerbare vs niet-factureerbare uren */
function getBillingEfficiency(entries) {
  const total = entries.reduce((s, e) => s + (e.hours || 0), 0);
  const billable = entries.filter((e) => !e.notBillable).reduce((s, e) => s + (e.hours || 0), 0);
  const nonBillable = total - billable;
  const pct = total > 0 ? (billable / total * 100) : 0;
  return { total, billable, nonBillable, pct };
}

/** Top 5 klanten op uren of omzet */
function getTopClientsData(entries, projects, limit = 5) {
  const byClient = new Map();
  entries.forEach((e) => {
    const p = projects.find((pr) => pr.id === e.projectId);
    const clientName = p?.client?.trim() || 'Geen klant';
    if (!byClient.has(clientName)) byClient.set(clientName, { name: clientName, hours: 0, revenue: 0 });
    const item = byClient.get(clientName);
    item.hours += e.hours || 0;
    if (p && !e.notBillable && (p.type === 'hourly' || p.type === 'retainer_hours')) {
      item.revenue += (e.hours || 0) * (p.rate || 0);
    }
  });
  return [...byClient.values()]
    .filter((x) => x.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .slice(0, limit);
}

/** Uren per label voor horizontaal staafdiagram */
function getHoursPerLabelData(entries, labels = []) {
  const byLabel = new Map();
  const getName = (id) => (id ? (labels.find((l) => l.id === id)?.name || 'Onbekend') : 'Geen label');
  entries.forEach((e) => {
    const key = e.labelId || '';
    if (!byLabel.has(key)) byLabel.set(key, { name: getName(key), hours: 0 });
    byLabel.get(key).hours += e.hours || 0;
  });
  return [...byLabel.values()]
    .filter((x) => x.hours > 0)
    .sort((a, b) => b.hours - a.hours);
}

function renderHoursPerLabelChart(canvasId, entries, labels = []) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  if (_hoursPerLabelChartInstance) {
    _hoursPerLabelChartInstance.destroy();
    _hoursPerLabelChartInstance = null;
  }
  const data = getHoursPerLabelData(entries, labels);
  if (data.length === 0) return;
  const isDark = document.documentElement.classList.contains('dark') || document.documentElement.getAttribute('data-color-scheme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)';
  const colors = [
    getComputedChartColor('--md-sys-color-primary'),
    getComputedChartColor('--md-sys-color-secondary'),
    getComputedChartColor('--md-sys-color-tertiary'),
    getComputedChartColor('--md-sys-color-primary-container'),
    getComputedChartColor('--md-sys-color-secondary-container'),
    getComputedChartColor('--md-sys-color-tertiary-container'),
  ];
  _hoursPerLabelChartInstance = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map((d) => d.name),
      datasets: [{
        label: 'Uren',
        data: data.map((d) => d.hours),
        backgroundColor: data.map((_, i) => colors[i % colors.length]),
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.raw.toFixed(1)} uur`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor, callback: (v) => v + 'u', font: { size: 10 } },
        },
        y: {
          grid: { display: false },
          ticks: { color: textColor, font: { size: 11 }, maxRotation: 0 },
        },
      },
    },
  });
}

function storageLoad(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : (key === STORAGE_KEYS.settings ? null : []);
  } catch {
    return key === STORAGE_KEYS.settings ? null : [];
  }
}

function storageSave(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

function migrateLegacyData() {
  const legacy = localStorage.getItem(STORAGE_KEYS.legacy);
  if (!legacy) return;
  try {
    const d = JSON.parse(legacy);
    const projects = (d.projects || []).map((p) => {
      const type = p.billingType === 'vaste_prijs' ? 'fixed' : p.billingType === 'retainer' ? 'retainer' : p.billingType === 'retainer_hours' ? 'retainer_hours' : 'hourly';
      const rate = type === 'hourly' ? (p.hourlyRate || 0) : (type === 'retainer' || type === 'retainer_hours') ? (p.retainerRate || p.hourlyRate || 0) : 0;
      const budget = type === 'fixed' ? (p.fixedPrice || 0) : (p.hoursBudget || p.retainerHours) || 0;
      const hoursPerPeriod = type === 'retainer_hours' ? (p.retainerHours || p.hoursPerPeriod || 0) : 0;
      const period = p.retainerPeriod === 'week' ? 'week' : p.retainerPeriod === '4weken' ? '4weeks' : p.retainerPeriod === 'kwartaal' ? 'quarter' : 'month';
      const status = p.status === 'afgerond' ? 'inactive' : 'active';
      return {
        id: p.id || uid(),
        name: p.name || '',
        client: p.client || '',
        type,
        rate: Number(rate) || 0,
        budget: Number(budget) || 0,
        period,
        status,
        notes: p.notes || '',
        hoursPerPeriod: type === 'retainer_hours' ? Number(hoursPerPeriod) || 0 : undefined,
        createdAt: p.createdAt || today(),
      };
    });
    const entries = (d.timeEntries || []).map((e) => ({
      id: e.id || uid(),
      projectId: e.projectId,
      date: e.date,
      hours: Number(e.hours) || 0,
      description: e.description || '',
      invoiceId: e.invoiceId || null,
      notBillable: e.notBillable ?? false,
      createdAt: e.createdAt || new Date().toISOString(),
    }));
    const invoices = (d.invoices || []).map((i) => ({
      id: i.id || uid(),
      number: i.number || `INV-${uid().toUpperCase()}`,
      client: (d.projects || []).find((p) => p.id === i.projectId)?.client || '?',
      projectId: i.projectId,
      projectIds: [i.projectId],
      projectName: (d.projects || []).find((p) => p.id === i.projectId)?.name || '?',
      timeEntryIds: i.timeEntryIds || [],
      entryIds: i.timeEntryIds || [],
      date: i.date || today(),
      dueDate: i.dueDate || addDays(i.date || today(), 30),
      notes: i.notes || '',
      total: 0,
      status: i.status === 'concept' ? 'draft' : i.status === 'verzonden' ? 'sent' : i.status === 'betaald' ? 'paid' : 'draft',
      createdAt: i.createdAt || new Date().toISOString(),
    }));
    invoices.forEach((inv) => {
      const invEntries = entries.filter((e) => inv.entryIds.includes(e.id));
      const proj = projects.find((p) => p.id === inv.projectId);
      inv.total = invEntries.reduce((s, e) => s + (e.hours || 0) * (proj?.rate || 0), 0);
    });
    const clients = [];
    const seen = new Set();
    projects.forEach((p) => {
      const c = (p.client || '').trim();
      if (c && !seen.has(c.toLowerCase())) {
        seen.add(c.toLowerCase());
        clients.push({
          id: uid(),
          name: c,
          contactPerson: '',
          address: '',
          city: '',
          email: '',
          phone: '',
          debiteurNr: '',
          createdAt: today(),
        });
      }
    });
    const cap = (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEYS.legacyCapacity);
        if (!raw) return { weekCapacity: 40, paymentDays: 14 };
        const c = JSON.parse(raw);
        return { weekCapacity: c.maxHoursPerWeek || 40, paymentDays: 14 };
      } catch {
        return { weekCapacity: 40, paymentDays: 14 };
      }
    })();
    const settings = {
      weekCapacity: cap.weekCapacity,
      company: {
        name: 'BOLD700 B.V.',
        address: 'Zilveren Florijnlaan 7',
        city: '3541HA Utrecht',
        iban: 'NL04 ABNA 0140 5874 38',
        kvk: '95956840',
        phone: '0614802802',
        email: 'support@bold700.com',
        website: 'bold700.com',
        btw: '',
        paymentDays: cap.paymentDays,
      },
    };
    storageSave(STORAGE_KEYS.projects, projects);
    storageSave(STORAGE_KEYS.entries, entries);
    storageSave(STORAGE_KEYS.invoices, invoices);
    storageSave(STORAGE_KEYS.clients, clients);
    storageSave(STORAGE_KEYS.settings, settings);
    localStorage.removeItem(STORAGE_KEYS.legacy);
  } catch (e) {
    console.warn('Migratie mislukt:', e);
  }
}

function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/** Lege staat met titel, uitleg en CTA */
function emptyState(opts) {
  const { icon = 'folder_open', title, subtitle, cta } = opts;
  const ctaHtml = !cta ? '' : cta.nav
    ? `<a href="#" data-nav="${cta.nav}" class="empty-state-cta-link"><md-icon style="font-size:18px;">arrow_forward</md-icon>${escapeHtml(cta.text)}</a>`
    : `<md-filled-button id="${cta.action}" class="empty-state-cta-btn"><md-icon slot="icon">add</md-icon>${escapeHtml(cta.text)}</md-filled-button>`;
  return `
    <div class="card">
      <div class="empty-state">
        <div class="empty-state-icon"><md-icon style="font-size:48px;width:48px;height:48px;">${icon}</md-icon></div>
        <div class="empty-state-title">${escapeHtml(title)}</div>
        ${subtitle ? `<div class="empty-state-sub">${escapeHtml(subtitle)}</div>` : ''}
        ${ctaHtml ? `<div class="empty-state-cta-wrap">${ctaHtml}</div>` : ''}
      </div>
    </div>
  `;
}

let snackbarTimeout = null;
let pendingUndo = null;

function showSnackbar(message, options = {}) {
  const el = document.getElementById('snackbar');
  const msgEl = el?.querySelector('.snackbar-message');
  const undoBtn = document.getElementById('snackbar-undo');
  if (!el || !msgEl) return;
  if (snackbarTimeout) clearTimeout(snackbarTimeout);
  pendingUndo = options.undo || null;
  msgEl.textContent = message;
  if (undoBtn) {
    undoBtn.style.display = pendingUndo ? 'block' : 'none';
    undoBtn.textContent = options.undoLabel || 'Ongedaan maken';
  }
  el.classList.add('visible');
  snackbarTimeout = setTimeout(() => {
    hideSnackbar();
  }, 4000);
}

function hideSnackbar() {
  const el = document.getElementById('snackbar');
  if (el) el.classList.remove('visible');
  if (snackbarTimeout) clearTimeout(snackbarTimeout);
  snackbarTimeout = null;
  pendingUndo = null;
}

function onSnackbarUndo() {
  if (typeof pendingUndo === 'function') {
    pendingUndo();
    hideSnackbar();
    showSnackbar('Ongedaan gemaakt');
  }
}

function getSystemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getEffectiveDarkMode() {
  if (typeof state.settings.darkMode === 'boolean') return state.settings.darkMode;
  return getSystemPrefersDark();
}

function applyDarkMode(enabled) {
  const root = document.documentElement;
  if (enabled) {
    root.setAttribute('data-color-scheme', 'dark');
    root.classList.add('dark');
  } else {
    root.removeAttribute('data-color-scheme');
    root.classList.remove('dark');
  }
}

// ─── State ─────────────────────────────────────────────────────────────────
let state = {
  tab: 'dash',
  menuOpen: false,
  projects: [],
  entries: [],
  invoices: [],
  clients: [],
  labels: [...DEFAULT_LABELS],
  settings: {
    weekCapacity: 40,
    company: {},
    members: [], // [{ id, name }] – medewerkers voor capaciteitsbreakdown
  },
  statusFilter: 'active',
  entryFilter: 'all',
  quickLogForm: { projectId: '', date: today(), hours: '', description: '', notBillable: false, personId: '' },
  timers: [],
  timerTickInterval: null,
  projectForm: {},
  clientForm: {},
  invoiceForm: { client: '', date: today(), dueDate: addDays(today(), 30), notes: '' },
  selectedProjects: [],
  selectedEntries: [],
  pdfInvoice: null,
  pendingDelete: null,
  viewingClientId: null,
};

function loadState() {
  const initial = window.__initialData;
  const hasFirebaseUser = !!window.__firebaseUser;
  if (initial) {
    state.projects = initial.projects || [];
    state.entries = initial.entries || [];
    state.invoices = initial.invoices || [];
    state.clients = initial.clients || [];
    state.labels = initial.labels && initial.labels.length > 0 ? initial.labels : DEFAULT_LABELS;
    const t = initial.timers;
    state.timers = Array.isArray(t) ? t.filter((x) => x?.startTime && x?.projectId) : [];
    if (initial.settings) {
      state.settings = { ...state.settings, ...initial.settings };
      if (initial.settings.company) state.settings.company = { ...state.settings.company, ...initial.settings.company };
    }
    return;
  }
  if (hasFirebaseUser) {
    return;
  }
  migrateLegacyData();
  state.projects = storageLoad(STORAGE_KEYS.projects) || [];
  state.entries = storageLoad(STORAGE_KEYS.entries) || [];
  state.invoices = storageLoad(STORAGE_KEYS.invoices) || [];
  state.clients = storageLoad(STORAGE_KEYS.clients) || [];
  const storedLabels = storageLoad(STORAGE_KEYS.labels);
  state.labels = Array.isArray(storedLabels) && storedLabels.length > 0 ? storedLabels : DEFAULT_LABELS;
  const t = storageLoad(STORAGE_KEYS.timer);
  if (Array.isArray(t)) {
    state.timers = t.filter((x) => x?.startTime && x?.projectId);
  } else if (t && t.startTime) {
    state.timers = [{ id: t.id || uid(), ...t }];
  } else {
    state.timers = [];
  }
  const s = storageLoad(STORAGE_KEYS.settings);
  if (s) {
    state.settings = { ...state.settings, ...s };
    if (s.company) state.settings.company = { ...state.settings.company, ...s.company };
  }
}

function saveState() {
  const user = window.__firebaseUser;
  if (!user) {
    storageSave(STORAGE_KEYS.projects, state.projects);
    storageSave(STORAGE_KEYS.entries, state.entries);
    storageSave(STORAGE_KEYS.invoices, state.invoices);
    storageSave(STORAGE_KEYS.clients, state.clients);
    storageSave(STORAGE_KEYS.labels, state.labels);
    storageSave(STORAGE_KEYS.settings, state.settings);
    storageSave(STORAGE_KEYS.timer, state.timers);
  }
  const fb = window.__firebase;
  if (user && fb?.firebaseSaveUserData) {
    fb.firebaseSaveUserData(user.uid, {
      projects: state.projects,
      entries: state.entries,
      invoices: state.invoices,
      clients: state.clients,
      labels: state.labels,
      settings: state.settings,
      timers: state.timers,
    }).catch(() => {});
  }
}

function formatTimerElapsed(ms) {
  const s = Math.floor(ms / 1000) % 60;
  const m = Math.floor(ms / 60000) % 60;
  const h = Math.floor(ms / 3600000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getTimerElapsedMs(timer) {
  if (!timer?.startTime) return 0;
  return Date.now() - new Date(timer.startTime).getTime();
}

function startTimer(projectId, description = '', notBillable = false, personId = '') {
  if (!projectId) return;
  const timer = {
    id: uid(),
    startTime: new Date().toISOString(),
    projectId,
    description,
    notBillable,
    personId: personId || undefined,
  };
  state.timers.push(timer);
  saveState();
  startTimerTick();
  renderUren();
  renderDashboard();
  updateTimerHeader();
}

function stopTimer(timerId) {
  const idx = state.timers.findIndex((t) => t.id === timerId);
  if (idx < 0) return;
  const timer = state.timers[idx];
  const ms = getTimerElapsedMs(timer);
  const hours = Math.ceil(ms / 3600000);
  if (hours < 1) {
    state.timers.splice(idx, 1);
    saveState();
    stopTimerTick();
    renderUren();
    updateTimerHeader();
    showSnackbar('Te kort om op te slaan (min. 1u)');
    return;
  }
  const entryId = uid();
  state.entries.push({
    id: entryId,
    projectId: timer.projectId,
    date: today(),
    hours,
    description: timer.description || '',
    notBillable: timer.notBillable ?? false,
    personId: timer.personId || undefined,
    createdAt: new Date().toISOString(),
  });
  state.timers.splice(idx, 1);
  saveState();
  if (state.timers.length > 0) startTimerTick();
  else stopTimerTick();
  renderUren();
  renderDashboard();
  updateTimerHeader();
  showSnackbar(`${hours}u opgeslagen`, {
    undo: () => {
      state.entries = state.entries.filter((e) => e.id !== entryId);
      saveState();
      renderUren();
      renderDashboard();
    },
  });
}

function startTimerTick() {
  stopTimerTick();
  state.timerTickInterval = setInterval(() => {
    state.timers.forEach((t) => {
      const el = document.getElementById(`timer-display-${t.id}`);
      if (el) el.textContent = formatTimerElapsed(getTimerElapsedMs(t));
    });
    updateTimerHeader();
  }, 1000);
}

function stopTimerTick() {
  if (state.timerTickInterval) {
    clearInterval(state.timerTickInterval);
    state.timerTickInterval = null;
  }
}

function updateTimerHeader() {
  const el = document.getElementById('header-timer');
  if (!el) return;
  if (state.timers.length === 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  const totalMs = state.timers.reduce((s, t) => s + getTimerElapsedMs(t), 0);
  const timeEl = el.querySelector('.header-timer-time');
  if (timeEl) timeEl.textContent = formatTimerElapsed(totalMs);
  const count = state.timers.length;
  const nameEl = el.querySelector('.header-timer-project');
  if (nameEl) nameEl.textContent = count === 1
    ? (state.projects.find((p) => p.id === state.timers[0].projectId)?.name || '?')
    : `${count} timers`;
}

// ─── Dashboard ─────────────────────────────────────────────────────────────
function renderDashboard() {
  const el = document.getElementById('panel-dash');
  if (!el) return;
  const { projects, entries, invoices, settings, clients } = state;
  const now = new Date();
  const thisMonth = entries.filter((e) =>
    e.date?.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  );
  const draftInvoiceIds = new Set(invoices.filter((i) => i.status === 'draft').map((i) => i.id));
  const unbilledEntries = entries.filter((e) => !e.notBillable && (!e.invoiceId || draftInvoiceIds.has(e.invoiceId)));
  const unbilledHourlyValue = unbilledEntries.reduce((sum, e) => {
    const p = projects.find((pr) => pr.id === e.projectId);
    if (!p || p.type !== 'hourly') return sum;
    return sum + (e.hours || 0) * (p.rate || 0);
  }, 0);
  const openInvoices = invoices.filter((i) => i.status === 'sent' || i.status === 'overdue');
  const openValue = openInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const paidValue = invoices.filter((i) => i.status === 'paid').reduce((s, i) => s + (i.total || 0), 0);
  const monthHours = thisMonth.reduce((s, e) => s + (e.hours || 0), 0);
  const activeProjects = projects.filter((p) => p.status === 'active');
  const vasteRetainers = activeProjects.filter((p) => p.type === 'retainer' || p.type === 'retainer_hours');
  const retainerTeFactureren = vasteRetainers.reduce((s, p) => s + retainerAmountPerMonth(p), 0);
  const unbilledValue = unbilledHourlyValue + retainerTeFactureren;
  const retainerHoursThisWeek = vasteRetainers.reduce((s, p) => s + retainerHoursPerWeek(p), 0);
  const retainerHoursThisMonth = vasteRetainers.reduce((s, p) => s + retainerHoursPerMonth(p), 0);
  const totalMonthHours = monthHours + retainerHoursThisMonth;
  const weekStart = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  })();
  const weekEnd = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 0 : 7 - day;
    d.setDate(d.getDate() + diff);
    return d.toISOString().split('T')[0];
  })();
  const weekEntries = entries.filter((e) => e.date >= weekStart && e.date <= weekEnd);
  const hoursThisWeek = weekEntries.reduce((s, e) => s + (e.hours || 0), 0);
  const totalUsedThisWeek = hoursThisWeek + retainerHoursThisWeek;
  const weekCapacity = settings.weekCapacity || 40;
  const pct = Math.min(100, (totalUsedThisWeek / weekCapacity) * 100);
  const hoursLeft = Math.max(0, weekCapacity - totalUsedThisWeek);
  const overbooked = totalUsedThisWeek > weekCapacity;
  const members = settings.members || [];
  const hoursPerPerson = {};
  weekEntries.forEach((e) => {
    const pid = e.personId || '_overig';
    hoursPerPerson[pid] = (hoursPerPerson[pid] || 0) + (e.hours || 0);
  });
  const personBreakdown = members
    .filter((m) => (hoursPerPerson[m.id] || 0) > 0)
    .map((m) => ({ id: m.id, name: m.name, hours: hoursPerPerson[m.id] || 0 }))
    .sort((a, b) => b.hours - a.hours);
  const overigHours = hoursPerPerson['_overig'] || 0;
  if (overigHours > 0) personBreakdown.push({ id: '_overig', name: 'Overig', hours: overigHours });
  if (retainerHoursThisWeek > 0) personBreakdown.push({ id: '_retainer', name: 'Retainer (vast)', hours: retainerHoursThisWeek });
  const monthSub = retainerHoursThisMonth > 0 ? `${thisMonth.length} regels + ${retainerHoursThisMonth.toFixed(0)}u retainer` : `${thisMonth.length} regels`;
  const teFactSub = vasteRetainers.length > 0
    ? `${unbilledEntries.length} urenregels + ${vasteRetainers.length} retainer${vasteRetainers.length > 1 ? 's' : ''}`
    : `${unbilledEntries.length} urenregels`;
  const stats = [
    { label: 'Te factureren', value: formatEur(unbilledValue), sub: teFactSub, color: 'var(--md-sys-color-primary)' },
    { label: 'Openstaand', value: formatEur(openValue), sub: `${openInvoices.length} facturen`, color: 'var(--md-sys-color-tertiary)' },
    { label: 'Ontvangen', value: formatEur(paidValue), sub: 'alle tijden', color: 'var(--md-sys-color-primary)' },
    { label: 'Uren deze maand', value: `${totalMonthHours.toFixed(1)}u`, sub: monthSub, color: 'var(--md-sys-color-secondary)' },
  ];
  const oldUnbilled = getOldUnbilledEntries(entries, draftInvoiceIds, projects, 4);
  const oldUnbilledHours = oldUnbilled.reduce((s, e) => s + (e.hours || 0), 0);
  const oldUnbilledValue = oldUnbilled.reduce((s, e) => s + (e.value || 0), 0);
  const retainerTotalPerMonth = vasteRetainers.reduce((s, p) => s + retainerAmountPerMonth(p), 0);
  const lastEntries = [...entries].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  el.innerHTML = `
    <div class="dashboard-cards">
      ${stats.map((s) => `
        <div class="card">
          <span class="card-label">${s.label}</span>
          <span class="card-value" style="color:${s.color}">${s.value}</span>
          <span class="card-sub">${s.sub}</span>
        </div>
      `).join('')}
    </div>
    ${oldUnbilled.length > 0 ? `
    <div class="dashboard-section">
      <div class="card" style="padding:16px;border-left:4px solid var(--md-sys-color-error);background:var(--md-sys-color-error-container);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <md-icon style="color:var(--md-sys-color-error);font-size:20px;">warning</md-icon>
          <span style="font-weight:700;font-size:14px;color:var(--md-sys-color-on-error-container);">Lang niet gefactureerd</span>
        </div>
        <p style="margin:0 0 10px;font-size:13px;color:var(--md-sys-color-on-error-container);">
          ${oldUnbilled.length} urenregel(s) ouder dan 4 weken staan nog open: ${oldUnbilledHours.toFixed(1)}u (${formatEur(oldUnbilledValue)}).
        </p>
        <md-text-button data-nav="uren">Naar uren →</md-text-button>
      </div>
    </div>
    ` : ''}
    <div class="dashboard-section">
      <div class="section-title">Uren per week</div>
      <div class="card" style="padding:16px;">
        <div style="height:220px;position:relative;">
          <canvas id="chart-dash-hours"></canvas>
        </div>
      </div>
    </div>
    ${(() => {
      const projectHoursData = getHoursPerProjectData(entries, projects);
      return projectHoursData.length > 0 ? `
    <div class="dashboard-section">
      <div class="section-title">Uren per project</div>
      <div class="card" style="padding:16px;">
        <div style="height:${Math.min(260, Math.max(140, projectHoursData.length * 32))}px;position:relative;">
          <canvas id="chart-dash-hours-per-project"></canvas>
        </div>
      </div>
    </div>
    ` : '';
    })()}
    ${(() => {
      const labelHoursData = getHoursPerLabelData(entries, state.labels);
      return labelHoursData.length > 0 ? `
    <div class="dashboard-section">
      <div class="section-title">Uren per label</div>
      <div class="card" style="padding:16px;">
        <div style="height:${Math.min(220, Math.max(120, labelHoursData.length * 32))}px;position:relative;">
          <canvas id="chart-dash-hours-per-label"></canvas>
        </div>
      </div>
    </div>
    ` : '';
    })()}
    <div class="capacity-bar-wrap">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
        <span class="card-label">Capaciteit deze week</span>
        <span style="font-size:11px;font-weight:700;color:${overbooked ? 'var(--md-sys-color-error)' : hoursLeft === 0 ? 'var(--md-sys-color-tertiary)' : 'var(--md-sys-color-on-surface-variant)'}">
          ${totalUsedThisWeek.toFixed(1)}u / ${weekCapacity}u ${overbooked ? '⚠ overbezet' : hoursLeft === 0 ? 'vol' : `· ${hoursLeft.toFixed(1)}u over`}
        </span>
      </div>
      <div class="capacity-bar">
        ${personBreakdown.length > 0 ? personBreakdown.map((pb, i) => {
          const segPct = totalUsedThisWeek > 0 ? (pb.hours / totalUsedThisWeek) * Math.min(100, pct) : 0;
          const colors = ['var(--md-sys-color-primary)', 'var(--md-sys-color-secondary)', 'var(--md-sys-color-tertiary)', 'var(--md-sys-color-primary-container)', 'var(--md-sys-color-secondary-container)'];
          const color = pb.id === '_overig' ? 'var(--md-sys-color-inverse-primary)' : pb.id === '_retainer' ? 'var(--md-sys-color-tertiary)' : colors[i % colors.length];
          return segPct > 0 ? `<div class="capacity-bar-fill capacity-bar-segment" style="width:${segPct}%;background:${color};" title="${escapeHtml(pb.name)}: ${pb.hours.toFixed(1)}u"></div>` : '';
        }).join('') : `
        <div class="capacity-bar-fill" style="width:${pct}%;background:${overbooked ? 'var(--md-sys-color-error)' : pct > 80 ? 'var(--md-sys-color-tertiary)' : 'var(--md-sys-color-primary)'}"></div>
        `}
      </div>
      ${personBreakdown.length > 0 ? `
      <div class="capacity-breakdown" style="display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:10px;font-size:11px;color:var(--md-sys-color-on-surface-variant);">
        ${personBreakdown.map((pb, i) => {
          const colors = ['var(--md-sys-color-primary)', 'var(--md-sys-color-secondary)', 'var(--md-sys-color-tertiary)', 'var(--md-sys-color-primary-container)', 'var(--md-sys-color-secondary-container)'];
          const color = pb.id === '_overig' ? 'var(--md-sys-color-inverse-primary)' : pb.id === '_retainer' ? 'var(--md-sys-color-tertiary)' : colors[i % colors.length];
          return `<span style="display:flex;align-items:center;gap:4px;"><span style="width:8px;height:8px;border-radius:2px;background:${color};flex-shrink:0;"></span>${escapeHtml(pb.name)}: ${pb.hours.toFixed(1)}u</span>`;
        }).join('')}
      </div>
      ` : ''}
    </div>
    ${(() => {
      const topClients = getTopClientsData(entries, projects, 5);
      return topClients.length > 0 ? `
    <div class="dashboard-section">
      <div class="section-title">Top 5 klanten</div>
      <div class="card" style="padding:16px;">
        <div style="display:flex;flex-direction:column;gap:10px;">
          ${topClients.map((c, i) => `
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;font-size:13px;">${i + 1}. ${escapeHtml(c.name)}</span>
            <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant);">${c.hours.toFixed(1)}u · ${formatEur(c.revenue)}</span>
          </div>
          `).join('')}
        </div>
      </div>
    </div>
    ` : '';
    })()}
    ${(() => {
      const eff = getBillingEfficiency(entries);
      return eff.total > 0 ? `
    <div class="dashboard-section">
      <div class="section-title">Facturatie-efficiëntie</div>
      <div class="card" style="padding:16px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <span class="card-label">Factureerbare uren</span>
          <span style="font-weight:700;font-size:14px;color:var(--md-sys-color-primary);">${eff.pct.toFixed(0)}%</span>
        </div>
        <div class="capacity-bar">
          <div class="capacity-bar-fill" style="width:${eff.pct}%;background:var(--md-sys-color-primary);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:11px;color:var(--md-sys-color-on-surface-variant);">
          <span>${eff.billable.toFixed(1)}u factureerbaar</span>
          <span>${eff.nonBillable.toFixed(1)}u intern</span>
        </div>
      </div>
    </div>
    ` : '';
    })()}
    ${(() => {
      const budgetData = getBudgetUsageData(entries, projects);
      return budgetData.length > 0 ? `
    <div class="dashboard-section">
      <div class="section-title">Budgetverbruik</div>
      <div class="card" style="padding:16px;">
        <div style="display:flex;flex-direction:column;gap:14px;">
          ${budgetData.map((b) => {
            const over = b.pct > 100;
            const color = over ? 'var(--md-sys-color-error)' : b.pct > 80 ? 'var(--md-sys-color-tertiary)' : 'var(--md-sys-color-primary)';
            return `
          <div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
              <span style="font-weight:600;font-size:13px;">${escapeHtml(b.project.name)}</span>
              <span style="font-size:11px;font-weight:700;color:${color}">${b.usedLabel} / ${b.budgetLabel}${over ? ' ⚠ over' : ''}</span>
            </div>
            <div class="capacity-bar">
              <div class="capacity-bar-fill" style="width:${Math.min(100, b.pct)}%;background:${color};"></div>
            </div>
          </div>
          `;
          }).join('')}
        </div>
      </div>
    </div>
    ` : '';
    })()}
    ${vasteRetainers.length > 0 ? `
    <div class="dashboard-section">
      <div class="section-title">Vaste retainers</div>
      <div class="card" style="padding:16px;">
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${vasteRetainers.map((p) => {
            const amt = p.type === 'retainer' ? p.rate : retainerHoursAmount(p);
            const label = p.type === 'retainer' ? `${formatEur(amt)} ${periodLabel(p.period)}` : `${p.hoursPerPeriod || 0}u ${periodLabel(p.period)} × ${formatEur(p.rate)}/uur`;
            const nameWithClient = p.client ? `${escapeHtml(p.name)} · ${escapeHtml(p.client)}` : escapeHtml(p.name);
            return `
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:600;font-size:13px;">${nameWithClient}</span>
                <span style="font-size:12px;color:var(--md-sys-color-on-surface-variant);">${label}</span>
              </div>
            `;
          }).join('')}
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid var(--md-sys-color-outline-variant);margin-top:4px;">
            <span style="font-weight:700;font-size:12px;">Totaal per maand</span>
            <span style="font-weight:700;font-size:14px;color:var(--md-sys-color-primary);">${formatEur(retainerTotalPerMonth)}</span>
          </div>
        </div>
      </div>
    </div>
    ` : ''}
    <div class="dashboard-section">
      <div class="section-title">Actieve projecten</div>
      <div class="card-list">
      ${activeProjects.length === 0 ? emptyState(clients.length === 0 ? {
        icon: 'business',
        title: 'Begin met een klant',
        subtitle: 'Voeg eerst een klant toe. Daarna kun je projecten aanmaken en uren loggen.',
        cta: { nav: 'clients', text: 'Voeg een klant toe' }
      } : {
        icon: 'work',
        title: 'Nog geen actieve projecten',
        subtitle: 'Maak een project aan om uren te loggen en te factureren.',
        cta: { nav: 'projects', text: 'Maak een project aan' }
      }) : activeProjects.map((p) => {
        const pEntries = entries.filter((e) => e.projectId === p.id);
        const totalHours = pEntries.reduce((s, e) => s + (e.hours || 0), 0);
        const hoursThisWeek = pEntries.filter((e) => e.date >= weekStart && e.date <= weekEnd).reduce((s, e) => s + (e.hours || 0), 0);
        const retainerWeek = (p.type === 'retainer' || p.type === 'retainer_hours') ? retainerHoursPerWeek(p) : 0;
        const weekDisplay = hoursThisWeek + retainerWeek;
        const unbilledHours = pEntries.filter((e) => !e.notBillable && (!e.invoiceId || draftInvoiceIds.has(e.invoiceId))).reduce((s, e) => s + (e.hours || 0), 0);
        const openAmount = p.type === 'hourly' ? formatEur(unbilledHours * p.rate) + ' open' : (p.type === 'retainer' || p.type === 'retainer_hours') ? (p.type === 'retainer' ? `${formatEur(p.rate)} ${periodLabel(p.period)}` : `${p.hoursPerPeriod || 0}u × ${formatEur(p.rate)}/uur`) : '—';
        const showOpenLabel = p.type === 'hourly';
        const subtitle = [p.client, typeLabel(p.type)].filter(Boolean).join(' · ') || '—';
        return `
          <div class="card list-item dashboard-project-card">
            <div class="dashboard-project-left">
              <div class="dashboard-project-name">${escapeHtml(p.name)}</div>
              <div class="dashboard-project-sub">${escapeHtml(subtitle)}</div>
            </div>
            <div class="dashboard-project-right">
              <div class="dashboard-project-hours">${totalHours.toFixed(1)}u totaal</div>
              <div class="dashboard-project-week" style="font-size:11px;color:var(--md-sys-color-on-surface-variant);">${weekDisplay.toFixed(1)}u deze week</div>
              <div class="dashboard-project-open">${openAmount}${showOpenLabel ? '' : ''}</div>
            </div>
          </div>
        `;
      }).join('')}
      </div>
    </div>
    ${entries.length > 0 ? `
      <div class="dashboard-section" style="margin-top:24px;">
        <div class="section-title">Laatste uren</div>
        <div class="card-list">
        ${lastEntries.map((e) => {
          const p = projects.find((x) => x.id === e.projectId);
          const sub = e.description ? escapeHtml(e.description) : formatDate(e.date);
          const showDateRight = !!e.description;
          return `
            <div class="card list-item dashboard-project-card">
              <div class="dashboard-project-left" style="flex:1;min-width:0;">
                <div class="dashboard-project-name">${escapeHtml(p?.name || '?')}</div>
                <div class="dashboard-project-sub">${sub}</div>
              </div>
              <div class="dashboard-project-right" style="display:flex;align-items:center;gap:10px;">
                ${e.invoiceId && !draftInvoiceIds.has(e.invoiceId) ? '<span class="badge" style="background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container);">gefact.</span>' : ''}
                <span class="dashboard-project-hours">${e.hours}u</span>
                ${showDateRight ? `<span style="font-size:11px;color:var(--md-sys-color-on-surface-variant);">${formatDate(e.date)}</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
        </div>
      </div>
    ` : ''}
  `;
  el.querySelectorAll('[data-nav]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); switchTab(a.dataset.nav); });
  });
  const weekCap = settings?.weekCapacity || 40;
  renderHoursChart('chart-dash-hours', entries, weekCap, projects);
  renderHoursPerProjectChart('chart-dash-hours-per-project', entries, projects);
  renderHoursPerLabelChart('chart-dash-hours-per-label', entries, state.labels);
}

// ─── Projecten ─────────────────────────────────────────────────────────────
function renderProjects() {
  const el = document.getElementById('panel-projects');
  if (!el) return;
  const { projects, entries, clients } = state;
  const lastLogged = (pid) => {
    const dates = entries.filter((e) => e.projectId === pid).map((e) => e.date || '').filter(Boolean);
    return dates.length ? dates.sort().reverse()[0] : '0';
  };
  const sorted = [...projects].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return lastLogged(b.id).localeCompare(lastLogged(a.id));
  });
  const filtered = state.statusFilter === 'all' ? sorted : sorted.filter((p) => p.status === state.statusFilter);
  el.innerHTML = `
    <div class="filter-row" style="justify-content:space-between;align-items:center;">
      <div class="filter-row">
        ${[['active', 'Actief'], ['inactive', 'Inactief'], ['all', 'Alles']].map(([val, label]) => `
          <button type="button" class="filter-chip-btn ${state.statusFilter === val ? 'active' : ''}" data-filter="${val}">${label}</button>
        `).join('')}
      </div>
      <md-filled-button id="btn-project-new"><md-icon slot="icon">add</md-icon> Nieuw project</md-filled-button>
    </div>
    <div class="card-list">
    ${filtered.length === 0 ? (projects.length === 0
      ? (clients.length === 0
          ? emptyState({
              icon: 'business',
              title: 'Begin met een klant',
              subtitle: 'Om projecten aan te maken heb je eerst een klant nodig. Voeg je eerste klant toe.',
              cta: { nav: 'clients', text: 'Voeg een klant toe' }
            })
          : emptyState({
              icon: 'folder_open',
              title: 'Nog geen projecten',
              subtitle: 'Projecten zijn de basis voor urenregistratie en facturatie. Voeg je eerste project toe om te beginnen.',
              cta: { action: 'btn-empty-project-new', text: 'Eerste project aanmaken' }
            }))
      : emptyState({
          icon: 'filter_list',
          title: 'Geen projecten in deze filter',
          subtitle: 'Er zijn geen projecten die voldoen aan de geselecteerde status. Probeer een andere filter.',
          cta: null
        })
    ) : filtered.map((p) => {
      const totalHours = entries.filter((e) => e.projectId === p.id).reduce((s, e) => s + (e.hours || 0), 0);
      return `
        <div class="list-item" data-project-id="${p.id}">
          <div class="list-item-main">
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
              <span style="font-weight:700;font-size:14px;">${escapeHtml(p.name)}</span>
              <span class="badge" style="border:1px solid ${p.status === 'active' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline)'};color:${p.status === 'active' ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)'};">${p.status === 'active' ? 'Actief' : 'Inactief'}</span>
            </div>
            <div style="font-size:11px;color:var(--md-sys-color-on-surface-variant);margin-top:4px;">${escapeHtml(p.client)} · ${typeLabel(p.type)}</div>
            ${p.notes ? `<div style="font-size:11px;color:var(--md-sys-color-on-surface-variant);margin-top:4px;font-style:italic;">${escapeHtml(p.notes)}</div>` : ''}
            <div style="display:flex;gap:14px;margin-top:8px;font-size:11px;color:var(--md-sys-color-on-surface-variant);">
              <span>${totalHours.toFixed(1)}u gelogd</span>
              ${p.type === 'hourly' && p.rate > 0 ? `<span>${formatEur(p.rate)}/uur</span>` : ''}
              ${p.type === 'fixed' && p.budget > 0 ? `<span>Budget: ${formatEur(p.budget)}</span>` : ''}
              ${p.type === 'retainer' && p.rate > 0 ? `<span>${formatEur(p.rate)} ${periodLabel(p.period)}</span>` : ''}
              ${p.type === 'retainer_hours' && p.hoursPerPeriod && p.rate ? `<span>${p.hoursPerPeriod}u ${periodLabel(p.period)} × ${formatEur(p.rate)}/uur</span>` : ''}
            </div>
          </div>
          <div class="list-item-actions">
            <md-icon-button data-action="edit-project" data-id="${p.id}" aria-label="Bewerken"><md-icon>edit</md-icon></md-icon-button>
            <md-icon-button data-action="delete-project" data-id="${p.id}" aria-label="Verwijderen"><md-icon>delete</md-icon></md-icon-button>
          </div>
        </div>
      `;
    }).join('')}
    </div>
  `;
  el.querySelectorAll('.filter-chip-btn').forEach((ch) => {
    ch.addEventListener('click', () => {
      state.statusFilter = ch.dataset.filter;
      renderProjects();
    });
  });
  if (!el.dataset.projectBtnDelegated) {
    el.dataset.projectBtnDelegated = '1';
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('#btn-project-new, #btn-empty-project-new');
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        openProjectDialog();
      }
    });
  }
  el.querySelectorAll('[data-nav]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); switchTab(a.dataset.nav); });
  });
  el.querySelectorAll('[data-action="edit-project"]').forEach((b) => {
    b.addEventListener('click', () => openProjectDialog(b.dataset.id));
  });
  el.querySelectorAll('[data-action="delete-project"]').forEach((b) => {
    b.addEventListener('click', () => openConfirmDeleteDialog('project', b.dataset.id));
  });
}

// ─── Uren ─────────────────────────────────────────────────────────────────
function renderUren() {
  const el = document.getElementById('panel-uren');
  if (!el) return;
  const { entries, projects, invoices, clients } = state;
  const draftInvoiceIds = new Set(invoices.filter((i) => i.status === 'draft').map((i) => i.id));
  const sorted = [...entries].sort((a, b) => {
    const byDate = (b.date || '').localeCompare(a.date || '');
    if (byDate !== 0) return byDate;
    return (b.createdAt || b.date || '').localeCompare(a.createdAt || a.date || '');
  });
  const filtered = state.entryFilter === 'open' ? sorted.filter((e) => !e.invoiceId && !e.notBillable) : sorted;
  const isMobileView = window.innerWidth < 600;
  const activeProjects = projects.filter((p) => p.status === 'active');
  const runningTimers = state.timers || [];
  const busyProjectIds = new Set(runningTimers.map((t) => t.projectId));
  const availableProjects = activeProjects.filter((p) => !busyProjectIds.has(p.id));
  el.innerHTML = `
    ${projects.length > 0 ? `
    <div class="timer-card card">
      <div class="timer-running-grid">
      ${runningTimers.map((t) => {
        const proj = projects.find((p) => p.id === t.projectId);
        return `
          <div class="timer-running-item" data-timer-id="${t.id}">
            <div class="timer-display" id="timer-display-${t.id}">${formatTimerElapsed(getTimerElapsedMs(t))}</div>
            <div class="timer-project-name">${escapeHtml(proj?.name || '?')}</div>
            ${t.description ? `<div class="timer-description">${escapeHtml(t.description)}</div>` : ''}
            <md-filled-button class="timer-stop-btn" data-action="stop-timer" data-timer-id="${t.id}"><md-icon slot="icon">stop</md-icon> Stoppen & opslaan</md-filled-button>
          </div>
        `;
      }).join('')}
      </div>
      <div class="timer-idle">
        <span class="card-label timer-label">${runningTimers.length > 0 ? 'Nog een timer starten' : 'Timer'}</span>
        ${availableProjects.length === 0 ? `
          <p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin:8px 0;">Elk project heeft al een actieve timer. Stop een timer om een nieuw project te starten.</p>
        ` : `
        <div class="timer-start-row">
          ${availableProjects.length <= 4 ? `
            <div class="project-pills" style="margin-bottom:8px;">
              ${availableProjects.map((p, i) => `
                <button type="button" class="project-pill timer-project-pill ${i === 0 ? 'selected' : ''}" data-project-id="${p.id}">
                  <span class="name">${escapeHtml(p.name)}</span>
                  ${p.client ? `<span class="client">${escapeHtml(p.client)}</span>` : ''}
                </button>
              `).join('')}
            </div>
          ` : (() => {
            const useNative = isMobile();
            return useNative ? `
            <div class="timer-input-row" style="flex-direction:column;gap:8px;">
              <div class="form-field" style="margin:0;">
                <span class="card-label">Project</span>
                <select id="timer-project-select" class="native-select native-select-mobile">
                  ${availableProjects.map((p, i) => `<option value="${p.id}" ${i === 0 ? 'selected' : ''}>${escapeHtml(p.name)}${p.client ? ` (${escapeHtml(p.client)})` : ''}</option>`).join('')}
                </select>
              </div>
              <md-outlined-text-field id="timer-description-input" label="Omschrijving (optioneel)" placeholder="Wat doe je?" style="width:100%;"></md-outlined-text-field>
            </div>
            ` : `
            <div class="timer-input-row">
              <md-outlined-select id="timer-project-select" label="Project" value="${availableProjects[0]?.id || ''}" menu-positioning="popover" style="flex:1;min-width:0;">
                ${availableProjects.map((p) => `<md-select-option value="${p.id}"><div slot="headline">${escapeHtml(p.name)}</div><div slot="supporting-text">${escapeHtml(p.client || '—')}</div></md-select-option>`).join('')}
              </md-outlined-select>
              <md-outlined-text-field id="timer-description-input" label="Omschrijving (optioneel)" placeholder="Wat doe je?"></md-outlined-text-field>
            </div>
            `;
          })()}
        </div>
        ${availableProjects.length <= 4 ? `<md-outlined-text-field id="timer-description-input" label="Omschrijving (optioneel)" placeholder="Wat doe je?" style="margin-top:8px;width:100%;max-width:320px;"></md-outlined-text-field>` : ''}
        ${(state.settings?.members || []).length > 0 ? (isMobile() ? `
        <div class="form-field" style="margin-top:8px;max-width:200px;">
          <span class="card-label">Wie werkt</span>
          <select id="timer-person-select" class="native-select native-select-mobile">
            ${(state.settings.members || []).map((m, i) => `<option value="${escapeHtml(m.id)}" ${i === 0 ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
          </select>
        </div>
        ` : `
        <div class="form-field" style="margin-top:8px;max-width:200px;">
          <md-outlined-select id="timer-person-select" label="Wie werkt" value="${(state.settings.members || [])[0]?.id || ''}" menu-positioning="popover">
            ${(state.settings.members || []).map((m) => `<md-select-option value="${escapeHtml(m.id)}"><div slot="headline">${escapeHtml(m.name)}</div></md-select-option>`).join('')}
          </md-outlined-select>
        </div>
        `) : ''}
        <div class="timer-actions-row">
          <md-filled-button id="btn-timer-start"><md-icon slot="icon">play_arrow</md-icon> Start timer</md-filled-button>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <md-checkbox id="timer-not-billable" touch-target="wrapper"></md-checkbox>
            <span style="font-size:12px;">Intern (niet factureerbaar)</span>
          </label>
        </div>
        `}
      </div>
    </div>
    ` : ''}
    <div class="filter-row" style="justify-content:space-between;align-items:center;">
      <div class="filter-row">
        <button type="button" class="filter-chip-btn ${state.entryFilter === 'all' ? 'active' : ''}" data-filter="all">Alle</button>
        <button type="button" class="filter-chip-btn ${state.entryFilter === 'open' ? 'active' : ''}" data-filter="open">Open</button>
      </div>
      ${projects.length > 0 ? '<md-filled-button id="btn-uren-log"><md-icon slot="icon">add</md-icon> Uren loggen</md-filled-button>' : ''}
    </div>
    ${projects.length === 0 ? emptyState(clients.length === 0 ? {
      icon: 'business',
      title: 'Begin met een klant',
      subtitle: 'Om projecten en uren te loggen heb je eerst een klant nodig. Voeg je eerste klant toe.',
      cta: { nav: 'clients', text: 'Voeg een klant toe' }
    } : {
      icon: 'folder_off',
      title: 'Eerst een project nodig',
      subtitle: 'Om uren te loggen heb je minimaal één project nodig. Maak eerst een project aan.',
      cta: { nav: 'projects', text: 'Ga naar projecten' }
    }) : ''}
    ${entries.length === 0 && projects.length > 0 ? emptyState({
      icon: 'schedule',
      title: 'Nog geen uren gelogd',
      subtitle: 'Log je eerste uren om je tijd bij te houden en later te factureren.',
      cta: { action: 'btn-empty-uren-log', text: 'Uren loggen' }
    }) : ''}
    ${filtered.length > 0 ? (isMobileView ? `
      <div class="card-list">
        ${filtered.map((e) => {
          const p = projects.find((x) => x.id === e.projectId);
          const inv = e.invoiceId ? invoices.find((i) => i.id === e.invoiceId) : null;
          const isBilled = inv && !draftInvoiceIds.has(inv.id);
          return `
            <div class="list-item" data-entry-id="${e.id}">
              <div class="list-item-main">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  ${e.notBillable ? '<span class="badge" style="background:var(--md-sys-color-surface-container-high);">intern</span>' : ''}
                  ${isBilled ? `<span class="badge" style="background:var(--md-sys-color-primary-container);">#${inv?.number || ''}</span>` : ''}
                  <span style="font-size:10px;color:var(--md-sys-color-on-surface-variant);">${formatEntryDateTime(e)}</span>
                </div>
                <div style="font-weight:700;font-size:13px;margin-top:4px;">${escapeHtml(p?.name || '?')}</div>
                ${e.description ? `<div style="font-size:11px;color:var(--md-sys-color-on-surface-variant);margin-top:2px;">${escapeHtml(e.description)}</div>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-weight:900;color:var(--md-sys-color-primary);font-size:16px;">${e.hours}u</span>
                ${!e.invoiceId ? `<md-icon-button data-action="delete-entry" data-id="${e.id}" aria-label="Verwijderen"><md-icon>delete</md-icon></md-icon-button>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : `
      <table class="hours-table">
        <thead>
          <tr>
            <th class="col-project">Project</th>
            <th class="col-omschrijving">Omschrijving</th>
            <th class="col-label" style="min-width:80px;">Type</th>
            <th class="col-datum">Datum</th>
            <th class="col-uren">Uren</th>
            <th class="col-actions"></th>
          </tr>
        </thead>
        <tbody>
        ${filtered.map((e) => {
          const p = projects.find((x) => x.id === e.projectId);
          const inv = e.invoiceId ? invoices.find((i) => i.id === e.invoiceId) : null;
          const isBilled = inv && !draftInvoiceIds.has(inv?.id);
          return `
            <tr data-entry-id="${e.id}">
              <td class="col-project">
                <div style="font-weight:700;font-size:13px;">${escapeHtml(p?.name || '?')}</div>
                <div style="font-size:11px;color:var(--md-sys-color-on-surface-variant);">${escapeHtml(p?.client)}</div>
              </td>
              <td class="col-omschrijving" style="font-size:13px;color:var(--md-sys-color-on-surface-variant);">${e.description || '<span style="color:var(--md-sys-color-outline);font-style:italic;">—</span>'}</td>
              <td class="col-label">
                <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                  ${(state.labels?.find((l) => l.id === e.labelId)?.name) ? `<span class="badge" style="background:var(--md-sys-color-secondary-container);color:var(--md-sys-color-on-secondary-container);">${escapeHtml(state.labels.find((l) => l.id === e.labelId).name)}</span>` : ''}
                  ${e.notBillable ? '<span class="badge" style="background:var(--md-sys-color-surface-container-high);">intern</span>' : ''}
                  ${isBilled ? `<span class="badge" style="background:var(--md-sys-color-primary-container);">#${inv?.number || ''}</span>` : ''}
                </div>
              </td>
              <td class="col-datum" style="font-size:11px;">${formatEntryDateTime(e)}</td>
              <td class="col-uren"><span style="font-weight:700;color:var(--md-sys-color-primary);">${e.hours}u</span></td>
              <td class="col-actions">${!e.invoiceId ? `<md-icon-button data-action="delete-entry" data-id="${e.id}" aria-label="Verwijderen"><md-icon>delete</md-icon></md-icon-button>` : ''}</td>
            </tr>
          `;
        }).join('')}
        </tbody>
      </table>
    `) : ''}
  `;
  el.querySelectorAll('.filter-chip-btn').forEach((ch) => {
    ch.addEventListener('click', () => {
      state.entryFilter = ch.dataset.filter;
      renderUren();
    });
  });
  if (!el.dataset.urenBtnDelegated) {
    el.dataset.urenBtnDelegated = '1';
    el.addEventListener('click', (e) => {
      if (e.target.closest('#btn-uren-log, #btn-empty-uren-log')) {
        e.preventDefault();
        e.stopPropagation();
        openQuickLogDialog();
      }
    });
  }
  el.querySelectorAll('[data-action="stop-timer"]').forEach((btn) => {
    btn.addEventListener('click', () => stopTimer(btn.dataset.timerId));
  });
  el.querySelector('#btn-timer-start')?.addEventListener('click', () => {
    const projSelect = el.querySelector('#timer-project-select');
    let projectId = projSelect ? projSelect.value : el.querySelector('.timer-project-pill.selected')?.dataset?.projectId;
    if (!projectId && el.querySelector('.timer-project-pill')) {
      projectId = availableProjects[0]?.id;
    }
    const desc = el.querySelector('#timer-description-input')?.value?.trim() || '';
    const notBillable = el.querySelector('#timer-not-billable')?.checked ?? false;
    const personSelect = el.querySelector('#timer-person-select');
    const personId = personSelect ? personSelect.value || '' : '';
    startTimer(projectId, desc, notBillable, personId);
  });
  el.querySelectorAll('.timer-project-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.timer-project-pill').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
  el.querySelector('#timer-project-select')?.addEventListener('change', () => {});
  el.querySelectorAll('[data-nav]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); switchTab(a.dataset.nav); });
  });
  el.querySelectorAll('[data-action="delete-entry"]').forEach((b) => {
    b.addEventListener('click', () => openConfirmDeleteDialog('entry', b.dataset.id));
  });
}

// ─── Klanten ─────────────────────────────────────────────────────────────
function renderClientDashboard(clientId) {
  const el = document.getElementById('panel-clients');
  if (!el) return;
  const { clients, projects, entries, invoices } = state;
  const client = clients.find((c) => c.id === clientId);
  if (!client) {
    state.viewingClientId = null;
    renderClients();
    return;
  }
  const clientProjects = projects.filter((p) => p.client?.toLowerCase() === client.name.toLowerCase());
  const clientProjectIds = new Set(clientProjects.map((p) => p.id));
  const clientEntries = entries.filter((e) => clientProjectIds.has(e.projectId));
  const clientInvoices = invoices.filter((i) => {
    const ids = i.projectIds || (i.projectId ? [i.projectId] : []);
    return ids.some((pid) => {
      const proj = projects.find((p) => p.id === pid);
      return proj && proj.client?.toLowerCase() === client.name.toLowerCase();
    });
  });
  const draftInvoiceIds = new Set(invoices.filter((i) => i.status === 'draft').map((i) => i.id));
  const unbilledEntries = clientEntries.filter((e) => !e.notBillable && (!e.invoiceId || draftInvoiceIds.has(e.invoiceId)));
  const unbilledValue = unbilledEntries.reduce((sum, e) => {
    const p = projects.find((pr) => pr.id === e.projectId);
    if (!p || p.type !== 'hourly') return sum;
    return sum + (e.hours || 0) * (p.rate || 0);
  }, 0);
  const openInvoices = clientInvoices.filter((i) => i.status === 'sent' || i.status === 'overdue');
  const openValue = openInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const paidInvoices = clientInvoices.filter((i) => i.status === 'paid');
  const paidValue = paidInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const now = new Date();
  const thisMonth = clientEntries.filter((e) =>
    e.date?.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  );
  const lastMonth = clientEntries.filter((e) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1);
    const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return e.date?.startsWith(prefix);
  });
  const monthHours = thisMonth.reduce((s, e) => s + (e.hours || 0), 0);
  const lastMonthHours = lastMonth.reduce((s, e) => s + (e.hours || 0), 0);
  const totalHours = clientEntries.reduce((s, e) => s + (e.hours || 0), 0);
  const billableHours = clientEntries.filter((e) => !e.notBillable).reduce((s, e) => s + (e.hours || 0), 0);
  const nonBillableHours = clientEntries.filter((e) => e.notBillable).reduce((s, e) => s + (e.hours || 0), 0);
  const lastEntries = [...clientEntries].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
  const hoursTrend = lastMonthHours > 0 ? ((monthHours - lastMonthHours) / lastMonthHours * 100).toFixed(0) : null;
  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;">
      <md-icon-button data-action="client-dashboard-back" aria-label="Terug"><md-icon>arrow_back</md-icon></md-icon-button>
      <div>
        <h2 style="margin:0;font-size:18px;font-weight:700;">${escapeHtml(client.name)}</h2>
        <span class="card-label">Klantdashboard</span>
      </div>
    </div>
    <div class="dashboard-cards">
      <div class="card">
        <span class="card-label">Te factureren</span>
        <span class="card-value" style="color:var(--md-sys-color-primary)">${formatEur(unbilledValue)}</span>
        <span class="card-sub">${unbilledEntries.length} urenregels</span>
      </div>
      <div class="card">
        <span class="card-label">Openstaand</span>
        <span class="card-value" style="color:var(--md-sys-color-tertiary)">${formatEur(openValue)}</span>
        <span class="card-sub">${openInvoices.length} facturen</span>
      </div>
      <div class="card">
        <span class="card-label">Ontvangen</span>
        <span class="card-value" style="color:var(--md-sys-color-primary)">${formatEur(paidValue)}</span>
        <span class="card-sub">${paidInvoices.length} facturen</span>
      </div>
      <div class="card">
        <span class="card-label">Uren deze maand</span>
        <span class="card-value" style="color:var(--md-sys-color-secondary)">${monthHours.toFixed(1)}u</span>
        <span class="card-sub">${hoursTrend !== null ? (parseInt(hoursTrend) >= 0 ? `+${hoursTrend}% vs vorige maand` : `${hoursTrend}% vs vorige maand`) : 'eerste maand'}</span>
      </div>
    </div>
    <div class="dashboard-section">
      <div class="section-title">Uren per week</div>
      <div class="card" style="padding:16px;">
        <div style="height:220px;position:relative;">
          <canvas id="chart-client-hours"></canvas>
        </div>
      </div>
    </div>
    ${(() => {
      const projectHoursData = getHoursPerProjectData(clientEntries, clientProjects);
      return projectHoursData.length > 0 ? `
    <div class="dashboard-section">
      <div class="section-title">Uren per project</div>
      <div class="card" style="padding:16px;">
        <div style="height:${Math.min(220, Math.max(120, projectHoursData.length * 32))}px;position:relative;">
          <canvas id="chart-client-hours-per-project"></canvas>
        </div>
      </div>
    </div>
    ` : '';
    })()}
    ${(() => {
      const labelHoursData = getHoursPerLabelData(clientEntries, state.labels);
      return labelHoursData.length > 0 ? `
    <div class="dashboard-section">
      <div class="section-title">Uren per label</div>
      <div class="card" style="padding:16px;">
        <div style="height:${Math.min(200, Math.max(100, labelHoursData.length * 32))}px;position:relative;">
          <canvas id="chart-client-hours-per-label"></canvas>
        </div>
      </div>
    </div>
    ` : '';
    })()}
    ${(() => {
      const oldUnbilled = getOldUnbilledEntries(clientEntries, draftInvoiceIds, clientProjects, 4);
      return oldUnbilled.length > 0 ? `
    <div class="dashboard-section">
      <div class="card" style="padding:16px;border-left:4px solid var(--md-sys-color-error);background:var(--md-sys-color-error-container);">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
          <md-icon style="color:var(--md-sys-color-error);font-size:20px;">warning</md-icon>
          <span style="font-weight:700;font-size:14px;color:var(--md-sys-color-on-error-container);">Lang niet gefactureerd</span>
        </div>
        <p style="margin:0 0 10px;font-size:13px;color:var(--md-sys-color-on-error-container);">
          ${oldUnbilled.length} urenregel(s) voor deze klant ouder dan 4 weken staan nog open: ${oldUnbilled.reduce((s, e) => s + (e.hours || 0), 0).toFixed(1)}u (${formatEur(oldUnbilled.reduce((s, e) => s + (e.value || 0), 0))}).
        </p>
        <md-text-button data-nav="uren">Naar uren →</md-text-button>
      </div>
    </div>
    ` : '';
    })()}
    ${(() => {
      const budgetData = getBudgetUsageData(clientEntries, clientProjects);
      return budgetData.length > 0 ? `
    <div class="dashboard-section">
      <div class="section-title">Budgetverbruik</div>
      <div class="card" style="padding:16px;">
        <div style="display:flex;flex-direction:column;gap:14px;">
          ${budgetData.map((b) => {
            const over = b.pct > 100;
            const color = over ? 'var(--md-sys-color-error)' : b.pct > 80 ? 'var(--md-sys-color-tertiary)' : 'var(--md-sys-color-primary)';
            return `
          <div>
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
              <span style="font-weight:600;font-size:13px;">${escapeHtml(b.project.name)}</span>
              <span style="font-size:11px;font-weight:700;color:${color}">${b.usedLabel} / ${b.budgetLabel}${over ? ' ⚠ over' : ''}</span>
            </div>
            <div class="capacity-bar">
              <div class="capacity-bar-fill" style="width:${Math.min(100, b.pct)}%;background:${color};"></div>
            </div>
          </div>
          `;
          }).join('')}
        </div>
      </div>
    </div>
    ` : '';
    })()}
    <div class="dashboard-section">
      <div class="section-title">Projecten (${clientProjects.length})</div>
      <div class="card-list">
      ${clientProjects.length === 0 ? '<p style="color:var(--md-sys-color-on-surface-variant);font-size:13px;">Geen projecten</p>' : clientProjects.map((p) => {
        const pEntries = entries.filter((e) => e.projectId === p.id);
        const pHours = pEntries.reduce((s, e) => s + (e.hours || 0), 0);
        const pUnbilled = pEntries.filter((e) => !e.notBillable && (!e.invoiceId || draftInvoiceIds.has(e.invoiceId))).reduce((s, e) => s + (e.hours || 0), 0);
        const openAmt = p.type === 'hourly' ? formatEur(pUnbilled * p.rate) : (p.type === 'retainer' || p.type === 'retainer_hours') ? `${p.hoursPerPeriod || 0}u × ${formatEur(p.rate)}/uur` : '—';
        return `
          <div class="card list-item dashboard-project-card">
            <div class="dashboard-project-left">
              <div class="dashboard-project-name">${escapeHtml(p.name)}</div>
              <div class="dashboard-project-sub">${typeLabel(p.type)} · ${pEntries.length} regels</div>
            </div>
            <div class="dashboard-project-right">
              <div class="dashboard-project-hours">${pHours.toFixed(1)}u</div>
              <div class="dashboard-project-open">${openAmt}</div>
            </div>
          </div>
        `;
      }).join('')}
      </div>
    </div>
    ${lastEntries.length > 0 ? `
    <div class="dashboard-section" style="margin-top:24px;">
      <div class="section-title">Laatste uren</div>
      <div class="card-list">
      ${lastEntries.map((e) => {
        const p = projects.find((x) => x.id === e.projectId);
        const sub = e.description ? escapeHtml(e.description) : formatDate(e.date);
        return `
          <div class="card list-item dashboard-project-card">
            <div class="dashboard-project-left" style="flex:1;min-width:0;">
              <div class="dashboard-project-name">${escapeHtml(p?.name || '?')}</div>
              <div class="dashboard-project-sub">${sub}</div>
            </div>
            <div class="dashboard-project-right" style="display:flex;align-items:center;gap:10px;">
              ${e.notBillable ? '<span class="badge" style="background:var(--md-sys-color-surface-container-high);">intern</span>' : ''}
              ${e.invoiceId && !draftInvoiceIds.has(e.invoiceId) ? '<span class="badge" style="background:var(--md-sys-color-primary-container);color:var(--md-sys-color-on-primary-container);">gefact.</span>' : ''}
              <span class="dashboard-project-hours">${e.hours}u</span>
              <span style="font-size:11px;color:var(--md-sys-color-on-surface-variant);">${formatDate(e.date)}</span>
            </div>
          </div>
        `;
      }).join('')}
      </div>
    </div>
    ` : ''}
    <div class="dashboard-section" style="margin-top:24px;">
      <div class="section-title">Totaal</div>
      <div class="card" style="padding:16px;">
        <div style="display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;">Factureerbare uren</span>
            <span style="font-weight:700;font-size:16px;color:var(--md-sys-color-primary);">${billableHours.toFixed(1)}u</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;">Intern (niet factureerbaar)</span>
            <span style="font-weight:700;font-size:16px;color:var(--md-sys-color-on-surface-variant);">${nonBillableHours.toFixed(1)}u</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;border-top:1px solid var(--md-sys-color-outline-variant);">
            <span style="font-weight:700;">Alle uren (totaal)</span>
            <span style="font-weight:700;font-size:18px;color:var(--md-sys-color-primary);">${totalHours.toFixed(1)}u</span>
          </div>
        </div>
      </div>
    </div>
  `;
  el.querySelector('[data-action="client-dashboard-back"]')?.addEventListener('click', () => {
    state.viewingClientId = null;
    renderClients();
  });
  el.querySelectorAll('[data-nav]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); switchTab(a.dataset.nav); });
  });
  const weekCap = state.settings?.weekCapacity || 40;
  if (_hoursPerProjectChartInstance) {
    _hoursPerProjectChartInstance.destroy();
    _hoursPerProjectChartInstance = null;
  }
  if (_hoursPerLabelChartInstance) {
    _hoursPerLabelChartInstance.destroy();
    _hoursPerLabelChartInstance = null;
  }
  renderHoursChart('chart-client-hours', clientEntries, weekCap, state.projects);
  renderHoursPerProjectChart('chart-client-hours-per-project', clientEntries, clientProjects, false, true);
  renderHoursPerLabelChart('chart-client-hours-per-label', clientEntries, state.labels);
}

function renderClients() {
  const el = document.getElementById('panel-clients');
  if (!el) return;
  if (state.viewingClientId) {
    renderClientDashboard(state.viewingClientId);
    return;
  }
  if (_hoursChartInstance) {
    _hoursChartInstance.destroy();
    _hoursChartInstance = null;
  }
  const { clients, projects } = state;
  el.innerHTML = `
    <div class="filter-row" style="justify-content:space-between;align-items:center;">
      <span class="card-label">${clients.length} klanten</span>
      <md-filled-button id="btn-client-new"><md-icon slot="icon">add</md-icon> Nieuwe klant (Ctrl+K)</md-filled-button>
    </div>
    <div class="card-list">
    ${clients.length === 0 ? emptyState({
      icon: 'business',
      title: 'Nog geen klanten',
      subtitle: 'Voeg klanten toe om projecten aan te koppelen en facturen te versturen.',
      cta: { action: 'btn-empty-client-new', text: 'Eerste klant toevoegen' }
    }) : ''}
    ${clients.map((c) => {
      const clientProjects = projects.filter((p) => p.client.toLowerCase() === c.name.toLowerCase());
      return `
        <div class="list-item" data-client-id="${c.id}">
          <div class="list-item-main">
            <div style="font-weight:700;font-size:14px;">${escapeHtml(c.name)}</div>
            ${c.contactPerson ? `<div style="font-size:11px;color:var(--md-sys-color-on-surface-variant);margin-top:2px;">${escapeHtml(c.contactPerson)}</div>` : ''}
            ${(c.address || c.city) ? `<div style="font-size:11px;color:var(--md-sys-color-on-surface-variant);margin-top:4px;">${[c.address, c.city].filter(Boolean).join(', ')}</div>` : ''}
            <div style="display:flex;gap:12px;margin-top:6px;font-size:11px;color:var(--md-sys-color-on-surface-variant);">
              ${c.email ? `<span>${escapeHtml(c.email)}</span>` : ''}
              ${c.phone ? `<span>${escapeHtml(c.phone)}</span>` : ''}
              ${c.debiteurNr ? `<span>Deb. ${escapeHtml(c.debiteurNr)}</span>` : ''}
            </div>
            ${clientProjects.length > 0 ? `<div style="margin-top:8px;font-size:10px;color:var(--md-sys-color-on-surface-variant);">${clientProjects.length} project${clientProjects.length !== 1 ? 'en' : ''}: ${clientProjects.map((p) => p.name).join(', ')}</div>` : ''}
          </div>
          <div class="list-item-actions">
            <md-icon-button data-action="client-dashboard" data-id="${c.id}" aria-label="Dashboard"><md-icon>analytics</md-icon></md-icon-button>
            <md-icon-button data-action="edit-client" data-id="${c.id}" aria-label="Bewerken"><md-icon>edit</md-icon></md-icon-button>
            <md-icon-button data-action="delete-client" data-id="${c.id}" aria-label="Verwijderen"><md-icon>delete</md-icon></md-icon-button>
          </div>
        </div>
      `;
    }).join('')}
    </div>
  `;
  if (!el.dataset.clientBtnDelegated) {
    el.dataset.clientBtnDelegated = '1';
    el.addEventListener('click', (e) => {
      if (e.target.closest('#btn-client-new, #btn-empty-client-new')) {
        e.preventDefault();
        e.stopPropagation();
        openClientDialog();
      }
    });
  }
  el.querySelectorAll('[data-action="client-dashboard"]').forEach((b) => {
    b.addEventListener('click', () => { state.viewingClientId = b.dataset.id; renderClients(); });
  });
  el.querySelectorAll('[data-action="edit-client"]').forEach((b) => {
    b.addEventListener('click', () => openClientDialog(b.dataset.id));
  });
  el.querySelectorAll('[data-action="delete-client"]').forEach((b) => {
    b.addEventListener('click', () => openConfirmDeleteDialog('client', b.dataset.id));
  });
}

// ─── Instellingen ─────────────────────────────────────────────────────────
function renderSettings() {
  const el = document.getElementById('panel-settings');
  if (!el) return;
  const co = state.settings.company || {};
  const paymentDays = co.paymentDays ?? 14;
  el.innerHTML = `
    <div class="section-title">Instellingen</div>
    <div class="card" style="margin-bottom:20px;">
      <div class="card-label" style="margin-bottom:14px;">Bedrijfsgegevens</div>
      <div class="form-field">
        <span class="card-label">Logo (op factuur)</span>
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
          ${co.logo ? `<img src="${co.logo}" alt="Logo" style="max-height:48px;max-width:160px;object-fit:contain;border:1px solid var(--md-sys-color-outline-variant);border-radius:6px;">` : ''}
          <div style="display:flex;gap:8px;">
            <input type="file" id="settings-logo-input" accept="image/png,image/jpeg,image/svg+xml,image/webp" style="display:none;">
            <md-outlined-button id="settings-logo-upload">${co.logo ? 'Vervangen' : 'Upload logo'}</md-outlined-button>
            ${co.logo ? '<md-text-button id="settings-logo-remove">Verwijderen</md-text-button>' : ''}
          </div>
        </div>
        <span style="font-size:11px;color:var(--md-sys-color-on-surface-variant);display:block;margin-top:6px;">PNG, JPG, SVG of WebP. Max. 500 KB voor beste prestaties.</span>
      </div>
      <div class="form-field">
        <md-outlined-text-field id="settings-company-name" label="Bedrijfsnaam" value="${escapeHtml(co.name || '')}"></md-outlined-text-field>
      </div>
      <div class="form-field">
        <md-outlined-text-field id="settings-company-address" label="Adres" value="${escapeHtml(co.address || '')}"></md-outlined-text-field>
      </div>
      <div class="form-field">
        <md-outlined-text-field id="settings-company-city" label="Postcode + Plaats" value="${escapeHtml(co.city || '')}"></md-outlined-text-field>
      </div>
      <div class="form-grid-2">
        <div class="form-field">
          <md-outlined-text-field id="settings-company-iban" label="IBAN" value="${escapeHtml(co.iban || '')}"></md-outlined-text-field>
        </div>
        <div class="form-field">
          <md-outlined-text-field id="settings-company-kvk" label="KvK-nummer" inputmode="numeric" value="${escapeHtml(co.kvk || '')}"></md-outlined-text-field>
        </div>
      </div>
      <div class="form-grid-2">
        <div class="form-field">
          <md-outlined-text-field id="settings-company-phone" label="Telefoon" type="tel" inputmode="tel" value="${escapeHtml(co.phone || '')}"></md-outlined-text-field>
        </div>
        <div class="form-field">
          <md-outlined-text-field id="settings-company-email" label="E-mail" type="email" inputmode="email" value="${escapeHtml(co.email || '')}"></md-outlined-text-field>
        </div>
      </div>
      <div class="form-field">
        <md-outlined-text-field id="settings-company-website" label="Website" value="${escapeHtml(co.website || '')}"></md-outlined-text-field>
      </div>
      <div class="form-field">
        <md-outlined-text-field id="settings-company-btw" label="BTW-nummer" value="${escapeHtml(co.btw || '')}" placeholder="NL123456789B01"></md-outlined-text-field>
      </div>
      <div class="form-field">
        <span class="card-label">Standaard betaaltermijn</span>
        <div class="payment-days-row">
          ${[7, 14, 21, 30, 45, 60].map((d) => `
            <button type="button" class="payment-day-btn ${paymentDays === d ? 'selected' : ''}" data-days="${d}">${d} dagen</button>
          `).join('')}
        </div>
      </div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <div class="card-label" style="margin-bottom:14px;">Werklabels (onderwerpen)</div>
      <p style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin:0 0 12px;">Labels zoals Design, Call, Research. Kies bij het loggen van uren; ze verschijnen op de factuur.</p>
      <div class="label-edit-list" style="display:flex;flex-direction:column;gap:8px;">
        ${(state.labels || []).map((l) => `
          <div class="label-edit-row" style="display:flex;align-items:center;gap:8px;">
            <md-outlined-text-field data-label-id="${escapeHtml(l.id)}" value="${escapeHtml(l.name)}" style="flex:1;" label="Label"></md-outlined-text-field>
            <md-icon-button data-action="delete-label" data-label-id="${escapeHtml(l.id)}" aria-label="Verwijderen"><md-icon>delete</md-icon></md-icon-button>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:12px;">
        <md-outlined-button id="btn-add-label">+ Label toevoegen</md-outlined-button>
      </div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <div class="card-label" style="margin-bottom:14px;">Medewerkers</div>
      <p style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin:0 0 12px;">Kies bij het loggen van uren wie de uren heeft gelogd. De capaciteitsbalk toont dan een breakdown per persoon.</p>
      <div class="member-edit-list" style="display:flex;flex-direction:column;gap:8px;">
        ${(state.settings.members || []).map((m) => `
          <div class="member-edit-row" style="display:flex;align-items:center;gap:8px;">
            <md-outlined-text-field data-member-id="${escapeHtml(m.id)}" value="${escapeHtml(m.name)}" style="flex:1;" label="Naam"></md-outlined-text-field>
            <md-icon-button data-action="delete-member" data-member-id="${escapeHtml(m.id)}" aria-label="Verwijderen"><md-icon>delete</md-icon></md-icon-button>
          </div>
        `).join('')}
      </div>
      <div style="margin-top:12px;">
        <md-outlined-button id="btn-add-member">+ Medewerker toevoegen</md-outlined-button>
      </div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <div class="card-label" style="margin-bottom:14px;">Capaciteitsplanning</div>
      <div class="form-field">
        <md-outlined-text-field id="settings-week-capacity" label="Weekcapaciteit (uren)" type="number" inputmode="numeric" value="${state.settings.weekCapacity || 40}"></md-outlined-text-field>
      </div>
    </div>
    <div class="card" style="margin-bottom:20px;">
      <div class="form-field" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span class="card-label" style="margin-bottom:0;">Donkere modus</span>
        <md-switch id="dark-mode-switch" aria-label="Donkere modus" ${getEffectiveDarkMode() ? 'selected' : ''}></md-switch>
      </div>
    </div>
    ${(window.__firebaseUser || (window.firebaseConfig?.apiKey && window.firebaseConfig.apiKey !== 'VUL_JE_API_KEY_IN')) ? `
    <div class="card" style="margin-bottom:20px;">
      <div class="card-label" style="margin-bottom:8px;">Account</div>
      ${window.__firebaseUser ? `
        <p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin:0 0 12px;">Ingelogd als ${escapeHtml(window.__firebaseUser.email || '')}</p>
        <md-outlined-button id="btn-logout">Uitloggen</md-outlined-button>
      ` : `
        <p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin:0 0 12px;">Niet ingelogd. Log in om je data te synchroniseren met Firebase.</p>
        <md-filled-button id="btn-login">Inloggen</md-filled-button>
      `}
    </div>
    ` : ''}
    <md-filled-button id="btn-settings-save">Opslaan</md-filled-button>
  `;
  el.querySelector('#btn-add-label')?.addEventListener('click', () => {
    const list = el.querySelector('.label-edit-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'label-edit-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    row.innerHTML = `
      <md-outlined-text-field data-label-id="lbl-${uid()}" value="" style="flex:1;" label="Label"></md-outlined-text-field>
      <md-icon-button data-action="delete-label" data-label-id="" aria-label="Verwijderen"><md-icon>delete</md-icon></md-icon-button>
    `;
    list.appendChild(row);
  });
  el.querySelector('#btn-add-member')?.addEventListener('click', () => {
    const list = el.querySelector('.member-edit-list');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'member-edit-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
    row.innerHTML = `
      <md-outlined-text-field data-member-id="mem-${uid()}" value="" style="flex:1;" label="Naam"></md-outlined-text-field>
      <md-icon-button data-action="delete-member" data-member-id="" aria-label="Verwijderen"><md-icon>delete</md-icon></md-icon-button>
    `;
    list.appendChild(row);
  });
  el.querySelectorAll('[data-action="delete-member"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.member-edit-row');
      if (row) row.remove();
    });
  });
  el.querySelectorAll('[data-action="delete-label"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.label-edit-row');
      if (row) row.remove();
    });
  });
  el.querySelector('#settings-logo-upload')?.addEventListener('click', () => document.getElementById('settings-logo-input')?.click());
  el.querySelector('#settings-logo-remove')?.addEventListener('click', () => {
    state.settings.company = state.settings.company || {};
    delete state.settings.company.logo;
    saveState();
    renderSettings();
  });
  el.querySelector('#settings-logo-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500 * 1024) {
      showSnackbar('Logo te groot. Kies een afbeelding onder 500 KB.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.settings.company = state.settings.company || {};
      state.settings.company.logo = reader.result;
      saveState();
      renderSettings();
      showSnackbar('Logo geüpload');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  });
  el.querySelectorAll('.payment-day-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const days = Number(btn.dataset.days);
      state.settings.company = state.settings.company || {};
      state.settings.company.paymentDays = days;
      renderSettings();
    });
  });
  const darkSwitch = el.querySelector('#dark-mode-switch');
  if (darkSwitch) {
    darkSwitch.selected = getEffectiveDarkMode();
    darkSwitch.addEventListener('change', () => {
      state.settings.darkMode = darkSwitch.selected;
      storageSave(STORAGE_KEYS.settings, state.settings);
      applyDarkMode(darkSwitch.selected);
    });
  }
  el.querySelector('#btn-logout')?.addEventListener('click', async () => {
    const fb = window.__firebase;
    if (fb?.firebaseSignOut) {
      await fb.firebaseSignOut();
      location.reload();
    }
  });
  el.querySelector('#btn-login')?.addEventListener('click', async () => {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';
    const errEl = document.getElementById('login-error');
    try {
      const fb = window.__firebase || (await import('./firebase-app.js'));
      const cfg = window.firebaseConfig;
      if (!fb || !cfg?.apiKey) throw new Error('Firebase niet geconfigureerd');
      if (!fb.getFirebaseAuth?.()) fb.initFirebase(cfg);
      const auth = fb.getFirebaseAuth?.();
      if (!auth) throw new Error('Firebase kon niet starten');
      window.__firebase = fb;
      const doLogin = async (isSignUp) => {
        const email = document.getElementById('login-email')?.value?.trim();
        const pass = document.getElementById('login-password')?.value || '';
        errEl.style.display = 'none';
        if (!email || !pass) {
          errEl.textContent = 'Vul e-mail en wachtwoord in';
          errEl.style.display = 'block';
          return;
        }
        try {
          if (isSignUp) await fb.firebaseSignUp(email, pass);
          else await fb.firebaseSignIn(email, pass);
          location.reload();
        } catch (e) {
          errEl.textContent = e.message || 'Inloggen mislukt';
          errEl.style.display = 'block';
        }
      };
      document.getElementById('login-btn').onclick = () => doLogin(false);
      document.getElementById('signup-btn').onclick = () => doLogin(true);
    } catch (e) {
      errEl.textContent = e.message || 'Kon niet verbinden. Controleer je internetverbinding.';
      errEl.style.display = 'block';
    }
  });
  el.querySelector('#btn-settings-save')?.addEventListener('click', () => {
    const prevSettings = JSON.parse(JSON.stringify(state.settings));
    const prevLabels = JSON.parse(JSON.stringify(state.labels || []));
    const company = state.settings.company || {};
    company.name = document.getElementById('settings-company-name')?.value ?? company.name;
    company.address = document.getElementById('settings-company-address')?.value ?? company.address;
    company.city = document.getElementById('settings-company-city')?.value ?? company.city;
    company.iban = document.getElementById('settings-company-iban')?.value ?? company.iban;
    company.kvk = document.getElementById('settings-company-kvk')?.value ?? company.kvk;
    company.phone = document.getElementById('settings-company-phone')?.value ?? company.phone;
    company.email = document.getElementById('settings-company-email')?.value ?? company.email;
    company.website = document.getElementById('settings-company-website')?.value ?? company.website;
    company.btw = document.getElementById('settings-company-btw')?.value ?? company.btw;
    state.settings.company = company;
    state.settings.weekCapacity = Number(document.getElementById('settings-week-capacity')?.value) || 40;

    const memberFields = document.querySelectorAll('.member-edit-row md-outlined-text-field');
    const newMembers = [];
    memberFields.forEach((tf) => {
      const id = tf.dataset?.memberId;
      const name = (tf.value || '').trim();
      if (name) newMembers.push({ id: id || 'mem-' + uid(), name });
    });
    state.settings.members = newMembers;

    const labelFields = document.querySelectorAll('.label-edit-row md-outlined-text-field');
    const newLabels = [];
    labelFields.forEach((tf) => {
      const id = tf.dataset?.labelId;
      const name = (tf.value || '').trim();
      if (name) newLabels.push({ id: id || 'lbl-' + uid(), name });
    });
    state.labels = newLabels.length > 0 ? newLabels : DEFAULT_LABELS;

    saveState();
    renderDashboard();
    showSnackbar('Instellingen opgeslagen', {
      undo: () => {
        state.settings = prevSettings;
        state.labels = prevLabels;
        saveState();
        renderSettings();
        renderDashboard();
      },
    });
  });
}

// ─── Facturen ─────────────────────────────────────────────────────────────
function getClientGroupMap() {
  const billable = state.entries.filter((e) => !e.invoiceId && !e.notBillable);
  const projectsWithBillable = state.projects.filter(
    (p) =>
      p.status === 'active' &&
      (p.type === 'fixed' || p.type === 'retainer' || p.type === 'retainer_hours' || billable.some((e) => e.projectId === p.id))
  );
  const clientGroupMap = {};
  const clientMatches = (p, clientName) => {
    const pc = (p.client || '').trim().toLowerCase();
    const cn = (clientName || '').trim().toLowerCase();
    return pc === cn || pc.startsWith(cn) || cn.startsWith(pc);
  };
  state.clients.forEach((c) => {
    const name = (c.name || '').trim();
    if (!name) return;
    const projs = projectsWithBillable.filter((p) => clientMatches(p, name));
    if (projs.length > 0) clientGroupMap[name] = projs;
  });
  projectsWithBillable.forEach((p) => {
    const projClient = (p.client || '').trim();
    if (!projClient) return;
    const alreadyIn = Object.keys(clientGroupMap).some((k) =>
      clientGroupMap[k].some((pr) => pr.id === p.id)
    );
    if (alreadyIn) return;
    const projs = projectsWithBillable.filter((pr) => (pr.client || '').trim().toLowerCase() === projClient.toLowerCase());
    if (projs.length > 0) clientGroupMap[projClient] = projs;
  });
  return { clientGroupMap, clientNames: Object.keys(clientGroupMap).sort(), billable };
}

function calcInvoiceTotal() {
  let total = 0;
  state.selectedProjects.forEach((pid) => {
    const p = state.projects.find((x) => x.id === pid);
    if (!p) return;
    if (p.type === 'hourly') {
      const projectEntries = state.selectedEntries.filter((id) => state.entries.find((e) => e.id === id)?.projectId === pid);
      total += projectEntries.reduce((sum, id) => {
        const e = state.entries.find((x) => x.id === id);
        return sum + (e?.hours || 0) * (p.rate || 0);
      }, 0);
    } else if (p.type === 'fixed') total += p.budget || 0;
    else if (p.type === 'retainer') total += p.rate || 0;
    else if (p.type === 'retainer_hours') total += retainerHoursAmount(p);
    else if (p.type === 'retainer_hours') total += retainerHoursAmount(p);
  });
  return total;
}

function renderInvoices() {
  const el = document.getElementById('panel-invoices');
  if (!el) return;
  const { invoices, entries, projects } = state;
  const { clientNames } = getClientGroupMap();
  const statusColor = (s) => ({ draft: 'var(--md-sys-color-outline)', sent: 'var(--md-sys-color-tertiary)', paid: 'var(--md-sys-color-primary)', overdue: 'var(--md-sys-color-error)' })[s] || 'var(--md-sys-color-outline)';
  const statusLabel = (s) => ({ draft: 'Concept', sent: 'Verstuurd', paid: 'Betaald', overdue: 'Verlopen' })[s] || s;
  el.innerHTML = `
    <div class="filter-row" style="justify-content:space-between;align-items:center;">
      <span class="card-label">${invoices.length} facturen</span>
      <md-filled-button id="btn-invoice-new" ${clientNames.length === 0 ? 'disabled' : ''}><md-icon slot="icon">add</md-icon> Factuur aanmaken</md-filled-button>
    </div>
    ${clientNames.length === 0 && invoices.length === 0 ? emptyState({
      icon: 'receipt_long',
      title: 'Nog geen facturen mogelijk',
      subtitle: 'Je hebt eerst klanten en projecten nodig om facturen aan te maken. Voeg een klant toe en maak een project aan.',
      cta: { nav: 'clients', text: 'Ga naar klanten' }
    }) : ''}
    ${clientNames.length > 0 && invoices.length === 0 ? emptyState({
      icon: 'receipt_long',
      title: 'Nog geen facturen',
      subtitle: 'Maak je eerste factuur aan op basis van gelogde uren of vaste projecten.',
      cta: { action: 'btn-empty-invoice-new', text: 'Factuur aanmaken' }
    }) : ''}
    <div class="card-list">
      ${[...invoices]
        .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
        .map((inv) => `
            <div class="list-item" data-invoice-id="${inv.id}">
              <div class="list-item-main">
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                  <span style="font-weight:900;color:var(--md-sys-color-primary);font-size:12px;">${escapeHtml(inv.number)}</span>
                  <span class="badge" style="border:1px solid ${statusColor(inv.status)};color:${statusColor(inv.status)};">${statusLabel(inv.status)}</span>
                </div>
                <div style="font-weight:700;font-size:14px;margin-top:4px;">${escapeHtml(inv.client)}</div>
                <div style="font-size:11px;color:var(--md-sys-color-on-surface-variant);">${escapeHtml(inv.projectName || '')} · ${formatDate(inv.date)}</div>
                ${inv.dueDate ? `<div style="font-size:10px;color:var(--md-sys-color-on-surface-variant);margin-top:2px;">Vervaldatum: ${formatDate(inv.dueDate)}</div>` : ''}
              </div>
              <div style="font-weight:900;font-size:20px;flex-shrink:0;">${formatEur(inv.total)}</div>
              <div class="list-item-actions" style="flex-direction:row;align-items:center;gap:4px;">
                <md-icon-button data-action="invoice-status-dialog" data-id="${inv.id}" aria-label="Status wijzigen"><md-icon>edit</md-icon></md-icon-button>
                <md-icon-button data-action="invoice-pdf" data-id="${inv.id}" aria-label="PDF"><md-icon>picture_as_pdf</md-icon></md-icon-button>
                <md-icon-button data-action="delete-invoice" data-id="${inv.id}" aria-label="Verwijderen"><md-icon>delete</md-icon></md-icon-button>
              </div>
            </div>
          `)
        .join('')}
    </div>
  `;
  if (!el.dataset.invoiceBtnDelegated) {
    el.dataset.invoiceBtnDelegated = '1';
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('#btn-invoice-new, #btn-empty-invoice-new');
      if (btn && !btn.hasAttribute('disabled')) {
        e.preventDefault();
        e.stopPropagation();
        openInvoiceCreateDialog();
      }
    });
  }
  el.querySelectorAll('[data-nav]').forEach((a) => {
    a.addEventListener('click', (e) => { e.preventDefault(); switchTab(a.dataset.nav); });
  });
  el.querySelectorAll('[data-action="invoice-status-dialog"]').forEach((b) => {
    b.addEventListener('click', () => openInvoiceStatusDialog(b.dataset.id));
  });
  el.querySelectorAll('[data-action="invoice-pdf"]').forEach((b) => {
    b.addEventListener('click', () => {
      const inv = state.invoices.find((i) => i.id === b.dataset.id);
      if (inv) openInvoicePdfDialog(inv);
    });
  });
  el.querySelectorAll('[data-action="delete-invoice"]').forEach((b) => {
    b.addEventListener('click', () => openConfirmDeleteDialog('invoice', b.dataset.id));
  });
}

// ─── Dialogs ───────────────────────────────────────────────────────────────
const STATUS_OPTIONS = {
  draft: [{ status: 'sent', label: 'Verstuurd', icon: 'send' }],
  sent: [
    { status: 'paid', label: 'Betaling ontvangen', icon: 'check_circle' },
    { status: 'overdue', label: 'Verlopen', icon: 'schedule' },
  ],
  paid: [{ status: 'sent', label: 'Ongedaan maken', icon: 'undo' }],
  overdue: [{ status: 'sent', label: 'Herstel', icon: 'undo' }],
};

function openInvoiceStatusDialog(invId) {
  const inv = state.invoices.find((i) => i.id === invId);
  if (!inv) return;
  const opts = STATUS_OPTIONS[inv.status] || [];
  const content = document.getElementById('invoice-status-content');
  if (!content) return;
  content.innerHTML = opts.length === 0
    ? '<p style="color:var(--md-sys-color-on-surface-variant);">Geen statuswijziging mogelijk.</p>'
    : `<div class="status-options" style="display:flex;flex-direction:column;gap:8px;">
        ${opts.map((o) => `
          <md-filled-button data-status="${o.status}" style="justify-content:flex-start;">
            <md-icon slot="icon">${o.icon}</md-icon>
            ${escapeHtml(o.label)}
          </md-filled-button>
        `).join('')}
      </div>`;
  state.pendingInvoiceStatus = invId;
  document.getElementById('invoice-status-dialog')?.show();
  content.querySelectorAll('[data-status]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const status = btn.dataset.status;
      const inv = state.invoices.find((i) => i.id === invId);
      const prevStatus = inv?.status;
      const prevPaidAt = inv?.paidAt;
      state.invoices = state.invoices.map((i) =>
        i.id === invId ? { ...i, status, paidAt: status === 'paid' ? today() : i.paidAt } : i
      );
      saveState();
      renderInvoices();
      renderDashboard();
      state.pendingInvoiceStatus = null;
      document.getElementById('invoice-status-dialog')?.close();
      showSnackbar('Status bijgewerkt', {
        undo: () => {
          state.invoices = state.invoices.map((i) =>
            i.id === invId ? { ...i, status: prevStatus, paidAt: prevPaidAt } : i
          );
          saveState();
          renderInvoices();
          renderDashboard();
        },
      });
    });
  });
}

function openConfirmDeleteDialog(type, id, label) {
  state.pendingDelete = { type, id };
  let lbl = label;
  if (!lbl && type === 'project') lbl = state.projects.find((p) => p.id === id)?.name;
  if (!lbl && type === 'client') lbl = state.clients.find((c) => c.id === id)?.name;
  if (!lbl && type === 'invoice') lbl = state.invoices.find((i) => i.id === id)?.number;
  if (!lbl && type === 'entry') {
    const e = state.entries.find((x) => x.id === id);
    const p = e && state.projects.find((x) => x.id === e.projectId);
    lbl = p ? `${p.name} – ${formatDate(e.date)}` : 'deze urenregel';
  }
  const msg = document.getElementById('confirm-delete-message');
  if (msg) msg.textContent = `Weet je zeker dat je "${escapeHtml(lbl || 'dit item')}" wilt verwijderen?`;
  document.getElementById('confirm-delete-dialog')?.show();
}

function executePendingDelete() {
  const { type, id } = state.pendingDelete || {};
  if (!type || !id) return;
  let undoFn = null;
  if (type === 'project') {
    const item = state.projects.find((p) => p.id === id);
    if (item) undoFn = () => { state.projects.push(item); saveState(); renderProjects(); renderDashboard(); };
    state.projects = state.projects.filter((p) => p.id !== id);
    saveState();
    renderProjects();
    renderDashboard();
  } else if (type === 'client') {
    const item = state.clients.find((c) => c.id === id);
    if (item) undoFn = () => { state.clients.push(item); saveState(); renderClients(); renderProjects(); };
    state.clients = state.clients.filter((c) => c.id !== id);
    saveState();
    renderClients();
    renderProjects();
  } else if (type === 'invoice') {
    const inv = state.invoices.find((i) => i.id === id);
    const entriesWithInv = state.entries.filter((e) => e.invoiceId === id);
    if (inv) undoFn = () => {
      state.invoices.push(inv);
      state.entries = state.entries.map((e) => {
        const was = entriesWithInv.find((x) => x.id === e.id);
        return was ? { ...e, invoiceId: id } : e;
      });
      saveState();
      renderInvoices();
      renderUren();
      renderDashboard();
    };
    state.invoices = state.invoices.filter((i) => i.id !== id);
    state.entries = state.entries.map((e) => (e.invoiceId === id ? { ...e, invoiceId: null } : e));
    saveState();
    renderInvoices();
    renderUren();
    renderDashboard();
  } else if (type === 'entry') {
    const item = state.entries.find((e) => e.id === id);
    if (item) undoFn = () => { state.entries.push(item); saveState(); renderUren(); renderDashboard(); };
    state.entries = state.entries.filter((e) => e.id !== id);
    saveState();
    renderUren();
    renderDashboard();
  }
  state.pendingDelete = null;
  showSnackbar('Verwijderd', undoFn ? { undo: undoFn } : {});
}

function openQuickLogDialog() {
  const activeProjects = state.projects.filter((p) => p.status === 'active');
  const firstId = activeProjects[0]?.id || '';
  const members = state.settings?.members || [];
  const firstPersonId = members[0]?.id || '';
  state.quickLogForm = { projectId: firstId, date: today(), hours: '', description: '', labelId: '', notBillable: false, personId: firstPersonId };
  const content = document.getElementById('quick-log-content');
  const useNativeSelect = isMobile();
  content.innerHTML = `
    ${activeProjects.length <= 4 ? `
      <div class="form-field">
        <span class="card-label">Project</span>
        <div class="project-pills">
          ${activeProjects.map((p) => `
            <button type="button" class="project-pill ${p.id === firstId ? 'selected' : ''}" data-project-id="${p.id}">
              <span class="name">${escapeHtml(p.name)}</span>
              ${p.client ? `<span class="client">${escapeHtml(p.client)}</span>` : ''}
            </button>
          `).join('')}
        </div>
      </div>
    ` : useNativeSelect ? `
      <div class="form-field">
        <span class="card-label">Project</span>
        <select id="quick-project" class="native-select native-select-mobile">
          ${activeProjects.map((p) => `<option value="${p.id}" ${p.id === firstId ? 'selected' : ''}>${escapeHtml(p.name)}${p.client ? ` (${escapeHtml(p.client)})` : ''}</option>`).join('')}
        </select>
      </div>
    ` : `
      <div class="form-field">
        <md-outlined-select id="quick-project" label="Project" value="${firstId}" menu-positioning="popover">
          ${activeProjects.map((p) => `<md-select-option value="${p.id}"><div slot="headline">${escapeHtml(p.name)}</div><div slot="supporting-text">${escapeHtml(p.client || '—')}</div></md-select-option>`).join('')}
        </md-outlined-select>
      </div>
    `}
    <div class="form-field">
      <span class="card-label">Uren</span>
      <div class="hours-quick-row">
        ${[0.5, 1, 1.5, 2, 3, 4].map((h) => `
          <button type="button" class="hours-quick-btn" data-hours="${h}">${h}u</button>
        `).join('')}
        <span style="font-size:11px;color:var(--md-sys-color-on-surface-variant);">of:</span>
        <md-outlined-text-field id="quick-hours" type="number" inputmode="decimal" step="0.25" min="0.25" placeholder="bijv. 6.5" style="width:100px;"></md-outlined-text-field>
      </div>
    </div>
    <div class="form-field">
      <md-outlined-text-field id="quick-date" label="Datum" type="date" value="${today()}"></md-outlined-text-field>
    </div>
    ${(state.settings?.members || []).length > 0 ? (useNativeSelect ? `
    <div class="form-field">
      <span class="card-label">Wie heeft gewerkt</span>
      <select id="quick-person" class="native-select native-select-mobile">
        ${(state.settings.members || []).map((m) => `<option value="${escapeHtml(m.id)}" ${m.id === firstPersonId ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
      </select>
    </div>
    ` : `
    <div class="form-field">
      <md-outlined-select id="quick-person" label="Wie heeft gewerkt" value="${state.quickLogForm.personId || (state.settings.members || [])[0]?.id || ''}" menu-positioning="popover">
        ${(state.settings.members || []).map((m) => `<md-select-option value="${escapeHtml(m.id)}"><div slot="headline">${escapeHtml(m.name)}</div></md-select-option>`).join('')}
      </md-outlined-select>
    </div>
    `) : ''}
    ${state.labels?.length > 0 ? (useNativeSelect ? `
    <div class="form-field">
      <span class="card-label">Onderwerp / type werk</span>
      <select id="quick-label" class="native-select native-select-mobile">
        <option value="" ${!state.quickLogForm.labelId ? 'selected' : ''}>Geen</option>
        ${state.labels.map((l) => `<option value="${escapeHtml(l.id)}" ${l.id === state.quickLogForm.labelId ? 'selected' : ''}>${escapeHtml(l.name)}</option>`).join('')}
      </select>
    </div>
    ` : `
    <div class="form-field">
      <md-outlined-select id="quick-label" label="Onderwerp / type werk" value="${state.quickLogForm.labelId || ''}" menu-positioning="popover">
        <md-select-option value=""><div slot="headline">Geen</div></md-select-option>
        ${state.labels.map((l) => `<md-select-option value="${escapeHtml(l.id)}"><div slot="headline">${escapeHtml(l.name)}</div></md-select-option>`).join('')}
      </md-outlined-select>
    </div>
    `) : ''}
    <div class="form-field">
      <md-outlined-text-field id="quick-description" label="Omschrijving (optioneel)" placeholder="Wat heb je gedaan?"></md-outlined-text-field>
    </div>
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
      <md-checkbox id="quick-not-billable" touch-target="wrapper"></md-checkbox>
      <span>Intern (niet factureerbaar)</span>
    </label>
    <div id="quick-log-error" class="error-msg" style="display:none;"></div>
  `;
  content.querySelectorAll('.project-pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('.project-pill').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.quickLogForm.projectId = btn.dataset.projectId;
    });
  });
  content.querySelectorAll('.hours-quick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('.hours-quick-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.quickLogForm.hours = btn.dataset.hours;
      const tf = content.querySelector('#quick-hours');
      if (tf) tf.value = btn.dataset.hours;
    });
  });
  const projectSelect = content.querySelector('#quick-project');
  if (projectSelect) projectSelect.addEventListener('change', () => { state.quickLogForm.projectId = projectSelect.value; });
  const personSelect = content.querySelector('#quick-person');
  if (personSelect) personSelect.addEventListener('change', () => { state.quickLogForm.personId = personSelect.value || ''; });
  content.querySelector('#quick-hours')?.addEventListener('input', (e) => { state.quickLogForm.hours = e.target.value; });
  content.querySelector('#quick-date')?.addEventListener('input', (e) => { state.quickLogForm.date = e.target.value; });
  content.querySelector('#quick-description')?.addEventListener('input', (e) => { state.quickLogForm.description = e.target.value; });
  content.querySelector('#quick-not-billable')?.addEventListener('change', (e) => { state.quickLogForm.notBillable = e.target.checked; });
  const labelSelect = content.querySelector('#quick-label');
  if (labelSelect) labelSelect.addEventListener('change', () => { state.quickLogForm.labelId = labelSelect.value || ''; });
  document.getElementById('quick-log-dialog').show();
}

function saveQuickLog() {
  const form = state.quickLogForm;
  const projectSelect = document.querySelector('#quick-project');
  if (projectSelect) form.projectId = projectSelect.value;
  const personSelect = document.querySelector('#quick-person');
  if (personSelect) form.personId = personSelect.value || '';
  const hoursInput = document.querySelector('#quick-hours');
  if (hoursInput) form.hours = hoursInput.value;
  const dateInput = document.querySelector('#quick-date');
  if (dateInput) form.date = dateInput.value;
  const descInput = document.querySelector('#quick-description');
  if (descInput) form.description = descInput.value;
  const nbInput = document.querySelector('#quick-not-billable');
  if (nbInput) form.notBillable = nbInput.checked;
  const labelSelect = document.querySelector('#quick-label');
  if (labelSelect) form.labelId = labelSelect.value || '';
  const errEl = document.getElementById('quick-log-error');
  if (!form.projectId) { errEl.textContent = 'Selecteer een project'; errEl.style.display = 'block'; return; }
  const hours = parseFloat(form.hours);
  if (!form.hours || hours <= 0) { errEl.textContent = 'Vul uren in'; errEl.style.display = 'block'; return; }
  const entryId = uid();
  const { labelId, personId, ...rest } = form;
  state.entries.push({
    ...rest,
    id: entryId,
    hours,
    labelId: labelId || undefined,
    personId: personId || undefined,
    createdAt: new Date().toISOString(),
  });
  saveState();
  document.getElementById('quick-log-dialog').close();
  renderUren();
  renderDashboard();
  showSnackbar('Uren opgeslagen', {
    undo: () => {
      state.entries = state.entries.filter((e) => e.id !== entryId);
      saveState();
      renderUren();
      renderDashboard();
    },
  });
}

function openProjectDialog(editId = null) {
  const p = editId ? state.projects.find((x) => x.id === editId) : null;
  const clients = state.clients;
  const useNativeSelect = isMobile();
  document.getElementById('project-dialog-title').textContent = p ? 'Project bewerken' : 'Nieuw project';
  state.projectForm = p ? { ...p, rate: String(p.rate || ''), budget: String(p.budget || ''), hoursPerPeriod: String(p.hoursPerPeriod || '') } : { name: '', client: clients[0]?.name || '', type: 'hourly', rate: '', budget: '', period: 'month', hoursPerPeriod: '', status: 'active', notes: '' };
  const content = document.getElementById('project-dialog-content');
  content.innerHTML = `
    <div class="form-field">
      <md-outlined-text-field id="project-name" label="Projectnaam *" value="${escapeHtml(state.projectForm.name)}"></md-outlined-text-field>
    </div>
    ${clients.length === 0 ? `
      <div class="form-hint">
        <span>Voeg eerst een klant toe om een project aan te maken.</span>
        <md-text-button data-nav="clients">Naar klanten →</md-text-button>
      </div>
    ` : useNativeSelect ? `
      <div class="form-field">
        <span class="card-label">Klant *</span>
        <select id="project-client" class="native-select native-select-mobile" required>
          <option value="">Selecteer klant...</option>
          ${clients.map((c) => `<option value="${escapeHtml(c.name)}" ${state.projectForm.client === c.name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
    ` : `
      <div class="form-field">
        <md-outlined-select id="project-client" label="Klant *" value="${escapeHtml(state.projectForm.client || '')}" menu-positioning="popover" required>
          <md-select-option value=""><div slot="headline">Selecteer klant...</div></md-select-option>
          ${clients.map((c) => `<md-select-option value="${escapeHtml(c.name)}" ${state.projectForm.client === c.name ? 'selected' : ''}><div slot="headline">${escapeHtml(c.name)}</div></md-select-option>`).join('')}
        </md-outlined-select>
      </div>
    `}
    <div class="form-field">
      ${useNativeSelect ? `
      <span class="card-label">Facturatie type</span>
      <select id="project-type" class="native-select native-select-mobile">
        <option value="hourly" ${state.projectForm.type === 'hourly' ? 'selected' : ''}>Per uur</option>
        <option value="fixed" ${state.projectForm.type === 'fixed' ? 'selected' : ''}>Vaste prijs</option>
        <option value="retainer" ${state.projectForm.type === 'retainer' ? 'selected' : ''}>Retainer (vast bedrag per periode)</option>
        <option value="retainer_hours" ${state.projectForm.type === 'retainer_hours' ? 'selected' : ''}>Retainer (uren per periode)</option>
      </select>
      ` : `
      <md-outlined-select id="project-type" label="Facturatie type" value="${state.projectForm.type || 'hourly'}" menu-positioning="popover">
        <md-select-option value="hourly"><div slot="headline">Per uur</div></md-select-option>
        <md-select-option value="fixed"><div slot="headline">Vaste prijs</div></md-select-option>
        <md-select-option value="retainer"><div slot="headline">Retainer (vast bedrag per periode)</div></md-select-option>
        <md-select-option value="retainer_hours"><div slot="headline">Retainer (uren per periode)</div></md-select-option>
      </md-outlined-select>
      `}
    </div>
    <div id="project-fields-hourly" class="form-grid-2" style="${state.projectForm.type !== 'hourly' ? 'display:none' : ''}">
      <div class="form-field">
        <md-outlined-text-field id="project-rate" label="Uurtarief (€)" type="number" inputmode="decimal" value="${state.projectForm.rate}"></md-outlined-text-field>
      </div>
      <div class="form-field">
        <md-outlined-text-field id="project-budget" label="Urenbudget (optioneel)" type="number" inputmode="decimal" value="${state.projectForm.budget}"></md-outlined-text-field>
      </div>
    </div>
    <div id="project-fields-retainer" class="form-grid-2" style="${state.projectForm.type !== 'retainer' ? 'display:none' : ''}">
      <div class="form-field">
        <md-outlined-text-field id="project-retainer-rate" label="Bedrag (€)" type="number" inputmode="decimal" value="${state.projectForm.rate}"></md-outlined-text-field>
      </div>
      <div class="form-field">
        ${useNativeSelect ? `
        <span class="card-label">Periode</span>
        <select id="project-period" class="native-select native-select-mobile">
          <option value="week" ${state.projectForm.period === 'week' ? 'selected' : ''}>Per week</option>
          <option value="4weeks" ${state.projectForm.period === '4weeks' ? 'selected' : ''}>Per 4 weken</option>
          <option value="month" ${(state.projectForm.period || 'month') === 'month' ? 'selected' : ''}>Per maand</option>
          <option value="quarter" ${state.projectForm.period === 'quarter' ? 'selected' : ''}>Per kwartaal</option>
        </select>
        ` : `
        <md-outlined-select id="project-period" label="Periode" value="${state.projectForm.period || 'month'}" menu-positioning="popover">
          <md-select-option value="week"><div slot="headline">Per week</div></md-select-option>
          <md-select-option value="4weeks"><div slot="headline">Per 4 weken</div></md-select-option>
          <md-select-option value="month"><div slot="headline">Per maand</div></md-select-option>
          <md-select-option value="quarter"><div slot="headline">Per kwartaal</div></md-select-option>
        </md-outlined-select>
        `}
      </div>
    </div>
    <div id="project-fields-retainer-hours" class="form-grid-2" style="${state.projectForm.type !== 'retainer_hours' ? 'display:none' : ''}">
      <div class="form-field">
        <md-outlined-text-field id="project-hours-per-period" label="Uren per periode" type="number" inputmode="numeric" value="${state.projectForm.hoursPerPeriod || ''}" placeholder="bijv. 36"></md-outlined-text-field>
      </div>
      <div class="form-field">
        <md-outlined-text-field id="project-retainer-hours-rate" label="Uurtarief (€)" type="number" inputmode="decimal" value="${state.projectForm.rate}" placeholder="bijv. 108"></md-outlined-text-field>
      </div>
      <div class="form-field" style="grid-column:1/-1;">
        ${useNativeSelect ? `
        <span class="card-label">Periode</span>
        <select id="project-retainer-hours-period" class="native-select native-select-mobile">
          <option value="week" ${(state.projectForm.period || 'week') === 'week' ? 'selected' : ''}>Per week</option>
          <option value="4weeks" ${state.projectForm.period === '4weeks' ? 'selected' : ''}>Per 4 weken</option>
          <option value="month" ${state.projectForm.period === 'month' ? 'selected' : ''}>Per maand</option>
          <option value="quarter" ${state.projectForm.period === 'quarter' ? 'selected' : ''}>Per kwartaal</option>
        </select>
        ` : `
        <md-outlined-select id="project-retainer-hours-period" label="Periode" value="${state.projectForm.period || 'week'}" menu-positioning="popover">
          <md-select-option value="week"><div slot="headline">Per week</div></md-select-option>
          <md-select-option value="4weeks"><div slot="headline">Per 4 weken</div></md-select-option>
          <md-select-option value="month"><div slot="headline">Per maand</div></md-select-option>
          <md-select-option value="quarter"><div slot="headline">Per kwartaal</div></md-select-option>
        </md-outlined-select>
        `}
      </div>
    </div>
    <div id="project-fields-fixed" class="form-field" style="${state.projectForm.type !== 'fixed' ? 'display:none' : ''}">
      <md-outlined-text-field id="project-fixed-budget" label="Vaste prijs (€)" type="number" inputmode="decimal" value="${state.projectForm.budget}"></md-outlined-text-field>
    </div>
    <div class="form-field">
      ${useNativeSelect ? `
      <span class="card-label">Status</span>
      <select id="project-status" class="native-select native-select-mobile">
        <option value="active" ${(state.projectForm.status || 'active') === 'active' ? 'selected' : ''}>Actief</option>
        <option value="inactive" ${state.projectForm.status === 'inactive' ? 'selected' : ''}>Inactief</option>
      </select>
      ` : `
      <md-outlined-select id="project-status" label="Status" value="${state.projectForm.status || 'active'}" menu-positioning="popover">
        <md-select-option value="active"><div slot="headline">Actief</div></md-select-option>
        <md-select-option value="inactive"><div slot="headline">Inactief</div></md-select-option>
      </md-outlined-select>
      `}
    </div>
    <div class="form-field">
      <md-outlined-text-field id="project-notes" label="Notities (optioneel)" value="${escapeHtml(state.projectForm.notes || '')}"></md-outlined-text-field>
    </div>
    <div id="project-error" class="error-msg" style="display:none;"></div>
  `;
  content.querySelector('[data-nav="clients"]')?.addEventListener('click', (e) => { e.preventDefault(); document.getElementById('project-dialog').close(); switchTab('clients'); });
  content.querySelector('#project-type')?.addEventListener('change', (e) => {
    state.projectForm.type = e.target.value;
    content.querySelector('#project-fields-hourly').style.display = state.projectForm.type === 'hourly' ? 'grid' : 'none';
    content.querySelector('#project-fields-retainer').style.display = state.projectForm.type === 'retainer' ? 'grid' : 'none';
    content.querySelector('#project-fields-retainer-hours').style.display = state.projectForm.type === 'retainer_hours' ? 'grid' : 'none';
    content.querySelector('#project-fields-fixed').style.display = state.projectForm.type === 'fixed' ? 'block' : 'none';
  });
  document.getElementById('project-dialog').show();
}

function saveProject() {
  const content = document.getElementById('project-dialog-content');
  const type = content.querySelector('#project-type')?.value || 'hourly';
  const rateEl = type === 'retainer_hours' ? content.querySelector('#project-retainer-hours-rate') : (type === 'retainer' ? content.querySelector('#project-retainer-rate') : content.querySelector('#project-rate'));
  const periodEl = type === 'retainer_hours' ? content.querySelector('#project-retainer-hours-period') : content.querySelector('#project-period');
  const form = {
    name: content.querySelector('#project-name')?.value?.trim() || '',
    client: content.querySelector('#project-client')?.value?.trim() || '',
    type,
    rate: parseFloat(rateEl?.value || content.querySelector('#project-rate')?.value || content.querySelector('#project-retainer-rate')?.value) || 0,
    budget: parseFloat(content.querySelector('#project-budget')?.value || content.querySelector('#project-fixed-budget')?.value) || 0,
    period: periodEl?.value || (type === 'retainer_hours' ? 'week' : 'month'),
    hoursPerPeriod: type === 'retainer_hours' ? parseFloat(content.querySelector('#project-hours-per-period')?.value) || 0 : undefined,
    status: content.querySelector('#project-status')?.value || 'active',
    notes: content.querySelector('#project-notes')?.value || '',
  };
  const errEl = content.querySelector('#project-error');
  if (!form.name) { errEl.textContent = 'Vul een projectnaam in'; errEl.style.display = 'block'; return; }
  if (!form.client) { errEl.textContent = 'Vul een klant in'; errEl.style.display = 'block'; return; }
  if (form.type === 'retainer_hours' && (!form.hoursPerPeriod || !form.rate)) { errEl.textContent = 'Vul uren per periode en uurtarief in'; errEl.style.display = 'block'; return; }
  const data = { ...form, name: form.name, client: form.client, rate: form.rate, budget: form.budget };
  if (form.type === 'retainer_hours') data.hoursPerPeriod = form.hoursPerPeriod;
  if (form.type !== 'retainer_hours') delete data.hoursPerPeriod;
  const editId = state.projectForm.id;
  const prevProject = editId ? state.projects.find((p) => p.id === editId) : null;
  if (editId) {
    state.projects = state.projects.map((p) => (p.id === editId ? { ...p, ...data } : p));
  } else {
    const newId = uid();
    state.projects.push({ ...data, id: newId, createdAt: today() });
    saveState();
    document.getElementById('project-dialog').close();
    renderProjects();
    renderDashboard();
    showSnackbar('Project opgeslagen', {
      undo: () => {
        state.projects = state.projects.filter((p) => p.id !== newId);
        saveState();
        renderProjects();
        renderDashboard();
      },
    });
    return;
  }
  saveState();
  document.getElementById('project-dialog').close();
  renderProjects();
  renderDashboard();
  showSnackbar('Project opgeslagen', {
    undo: () => {
      if (prevProject) {
        state.projects = state.projects.map((p) => (p.id === editId ? prevProject : p));
        saveState();
        renderProjects();
        renderDashboard();
      }
    },
  });
}

function openClientDialog(editId = null) {
  const c = editId ? state.clients.find((x) => x.id === editId) : null;
  document.getElementById('client-dialog-title').textContent = c ? 'Klant bewerken' : 'Nieuwe klant';
  state.clientForm = c ? { ...c } : { name: '', contactPerson: '', address: '', city: '', email: '', phone: '', debiteurNr: '' };
  const content = document.getElementById('client-dialog-content');
  content.innerHTML = `
    <div class="form-field">
      <md-outlined-text-field id="client-name" label="Bedrijfsnaam *" value="${escapeHtml(state.clientForm.name)}"></md-outlined-text-field>
    </div>
    <div class="form-field">
      <md-outlined-text-field id="client-contact" label="Contactpersoon" value="${escapeHtml(state.clientForm.contactPerson || '')}"></md-outlined-text-field>
    </div>
    <div class="form-field">
      <md-outlined-text-field id="client-address" label="Adres" value="${escapeHtml(state.clientForm.address || '')}"></md-outlined-text-field>
    </div>
    <div class="form-field">
      <md-outlined-text-field id="client-city" label="Postcode + Plaats" value="${escapeHtml(state.clientForm.city || '')}"></md-outlined-text-field>
    </div>
    <div class="form-grid-2">
      <div class="form-field">
        <md-outlined-text-field id="client-email" label="E-mail" type="email" inputmode="email" value="${escapeHtml(state.clientForm.email || '')}"></md-outlined-text-field>
      </div>
      <div class="form-field">
        <md-outlined-text-field id="client-phone" label="Telefoon" type="tel" inputmode="tel" value="${escapeHtml(state.clientForm.phone || '')}"></md-outlined-text-field>
      </div>
    </div>
    <div class="form-field">
      <md-outlined-text-field id="client-debiteur" label="Debiteurnummer (optioneel)" inputmode="numeric" value="${escapeHtml(state.clientForm.debiteurNr || '')}"></md-outlined-text-field>
    </div>
    <div id="client-error" class="error-msg" style="display:none;"></div>
  `;
  document.getElementById('client-dialog').show();
}

function saveClient() {
  const content = document.getElementById('client-dialog-content');
  const form = {
    name: content.querySelector('#client-name')?.value?.trim() || '',
    contactPerson: content.querySelector('#client-contact')?.value || '',
    address: content.querySelector('#client-address')?.value || '',
    city: content.querySelector('#client-city')?.value || '',
    email: content.querySelector('#client-email')?.value || '',
    phone: content.querySelector('#client-phone')?.value || '',
    debiteurNr: content.querySelector('#client-debiteur')?.value || '',
  };
  const errEl = content.querySelector('#client-error');
  if (!form.name) { errEl.textContent = 'Vul een klantnaam in'; errEl.style.display = 'block'; return; }
  const editId = state.clientForm.id;
  const prevClient = editId ? state.clients.find((c) => c.id === editId) : null;
  if (editId) {
    state.clients = state.clients.map((c) => (c.id === editId ? { ...c, ...form } : c));
  } else {
    const newId = uid();
    state.clients.push({ ...form, id: newId, createdAt: today() });
    saveState();
    document.getElementById('client-dialog').close();
    renderClients();
    renderProjects();
    showSnackbar('Klant opgeslagen', {
      undo: () => {
        state.clients = state.clients.filter((c) => c.id !== newId);
        saveState();
        renderClients();
        renderProjects();
      },
    });
    return;
  }
  saveState();
  document.getElementById('client-dialog').close();
  renderClients();
  renderProjects();
  showSnackbar('Klant opgeslagen', {
    undo: () => {
      if (prevClient) {
        state.clients = state.clients.map((c) => (c.id === editId ? prevClient : c));
        saveState();
        renderClients();
        renderProjects();
      }
    },
  });
}

function openInvoiceCreateDialog() {
  const { clientGroupMap, clientNames, billable } = getClientGroupMap();
  const firstClient = clientNames[0] || '';
  const clientProjects = clientGroupMap[firstClient] || [];
  state.invoiceForm = { client: firstClient, date: today(), dueDate: addDays(today(), state.settings.company?.paymentDays || 30), notes: '' };
  state.selectedProjects = clientProjects.map((p) => p.id);
  state.selectedEntries = [];
  renderInvoiceCreateContent();
  document.getElementById('invoice-create-dialog').show();
}

function renderInvoiceCreateContent() {
  const content = document.getElementById('invoice-create-content');
  const { clientGroupMap, billable } = getClientGroupMap();
  const clientProjects = clientGroupMap[state.invoiceForm.client] || [];
  const handleClientChange = (client) => {
    state.invoiceForm.client = client;
    const projs = clientGroupMap[client] || [];
    state.selectedProjects = projs.map((p) => p.id);
    state.selectedEntries = [];
    renderInvoiceCreateContent();
  };
  const toggleProject = (pid) => {
    const p = state.projects.find((x) => x.id === pid);
    const isSelected = state.selectedProjects.includes(pid);
    if (isSelected) {
      state.selectedProjects = state.selectedProjects.filter((id) => id !== pid);
      if (p?.type === 'hourly') state.selectedEntries = state.selectedEntries.filter((id) => state.entries.find((e) => e.id === id)?.projectId !== pid);
    } else {
      state.selectedProjects = [...state.selectedProjects, pid];
    }
    renderInvoiceCreateContent();
  };
  const selectAllEntries = (pid) => {
    const toAdd = billable.filter((e) => e.projectId === pid).map((e) => e.id);
    state.selectedEntries = [...new Set([...state.selectedEntries, ...toAdd])];
    renderInvoiceCreateContent();
  };
  const selectNoEntries = (pid) => {
    state.selectedEntries = state.selectedEntries.filter((id) => state.entries.find((e) => e.id === id)?.projectId !== pid);
    renderInvoiceCreateContent();
  };
  const projectAmount = (p) => p.type === 'fixed' ? p.budget : p.type === 'retainer' ? p.rate : p.type === 'retainer_hours' ? retainerHoursAmount(p) : null;
  const toggleEntry = (id) => {
    state.selectedEntries = state.selectedEntries.includes(id) ? state.selectedEntries.filter((x) => x !== id) : [...state.selectedEntries, id];
    renderInvoiceCreateContent();
  };
  const useNativeSelect = isMobile();
  content.innerHTML = `
    <div class="form-field">
      ${useNativeSelect ? `
      <span class="card-label">Klant</span>
      <select id="invoice-client" class="native-select native-select-mobile">
        <option value="">Selecteer klant...</option>
        ${Object.keys(clientGroupMap).map((c) => `<option value="${escapeHtml(c)}" ${state.invoiceForm.client === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
      </select>
      ` : `
      <md-outlined-select id="invoice-client" label="Klant" value="${escapeHtml(state.invoiceForm.client || '')}" menu-positioning="popover">
        <md-select-option value=""><div slot="headline">Selecteer klant...</div></md-select-option>
        ${Object.keys(clientGroupMap).map((c) => `<md-select-option value="${escapeHtml(c)}" ${state.invoiceForm.client === c ? 'selected' : ''}><div slot="headline">${escapeHtml(c)}</div></md-select-option>`).join('')}
      </md-outlined-select>
      `}
    </div>
    ${state.invoiceForm.client ? `
      <div class="form-field">
        <span class="card-label">Projecten & uren</span>
        <div class="invoice-project-list">
          ${clientProjects.map((p) => {
            const projSelected = state.selectedProjects.includes(p.id);
            const projEntries = billable.filter((e) => e.projectId === p.id);
            return `
              <div>
                <label class="invoice-project-row" style="background:${projSelected ? 'var(--md-sys-color-surface-container-high)' : 'transparent'};color:var(--md-sys-color-on-surface);">
                  <md-checkbox touch-target="wrapper" ${projSelected ? 'checked' : ''} data-id="${p.id}" data-type="project"></md-checkbox>
                  <span style="flex:1;font-weight:700;font-size:13px;color:inherit;">${escapeHtml(p.name)}</span>
                  <span style="font-size:11px;color:var(--md-sys-color-on-surface-variant);">${typeLabel(p.type)}</span>
                  ${p.type !== 'hourly' ? `<span style="font-weight:700;color:var(--md-sys-color-primary);">${formatEur(projectAmount(p) ?? 0)}</span>` : ''}
                </label>
                ${projSelected && p.type === 'hourly' ? `
                  <div style="display:flex;gap:12px;margin-bottom:6px;margin-left:36px;font-size:11px;">
                    <button type="button" class="invoice-select-btn" data-action="select-all" data-pid="${p.id}">Selecteer alle</button>
                    <button type="button" class="invoice-select-btn" data-action="select-none" data-pid="${p.id}">Selecteer geen</button>
                  </div>
                  ${projEntries.map((e) => {
            const lbl = state.labels?.find((l) => l.id === e.labelId)?.name;
            const entryDesc = lbl ? `${lbl}: ${e.description || '—'}` : (e.description || '—');
            return `
                  <label class="invoice-entry-row" style="color:var(--md-sys-color-on-surface);">
                    <md-checkbox touch-target="wrapper" ${state.selectedEntries.includes(e.id) ? 'checked' : ''} data-id="${e.id}" data-type="entry"></md-checkbox>
                    <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:inherit;">${escapeHtml(entryDesc)}</span>
                    <span style="font-size:11px;color:var(--md-sys-color-on-surface-variant);">${formatDate(e.date)}</span>
                    <span style="font-weight:700;font-size:12px;color:var(--md-sys-color-on-surface);">${e.hours}u</span>
                  </label>
                `;
          }).join('')}` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    ` : ''}
    <div class="card" style="margin:12px 0;">
      <span class="card-label">Totaal</span>
      <span style="font-weight:900;font-size:20px;">${formatEur(calcInvoiceTotal())}</span>
    </div>
    <div class="form-field">
      <md-outlined-text-field id="invoice-date" label="Factuurdatum" type="date" value="${state.invoiceForm.date}"></md-outlined-text-field>
    </div>
    <div class="form-field">
      <label class="card-label" style="display:block;margin-bottom:6px;">Opmerkingen (optioneel)</label>
      <textarea id="invoice-notes" rows="2" placeholder="Bijv. referentie, betalingsinstructie..." style="padding:12px;border:1px solid var(--md-sys-color-outline);border-radius:8px;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font-family:inherit;font-size:14px;resize:vertical;">${escapeHtml(state.invoiceForm.notes || '')}</textarea>
    </div>
  `;
  content.querySelector('#invoice-client')?.addEventListener('change', (e) => handleClientChange(e.target?.value ?? ''));
  content.querySelectorAll('md-checkbox[data-type="project"]').forEach((cb) => {
    cb.addEventListener('change', () => toggleProject(cb.dataset.id));
  });
  content.querySelectorAll('md-checkbox[data-type="entry"]').forEach((cb) => {
    cb.addEventListener('change', () => toggleEntry(cb.dataset.id));
  });
  content.querySelectorAll('[data-action="select-all"]').forEach((btn) => {
    btn.addEventListener('click', () => selectAllEntries(btn.dataset.pid));
  });
  content.querySelectorAll('[data-action="select-none"]').forEach((btn) => {
    btn.addEventListener('click', () => selectNoEntries(btn.dataset.pid));
  });
}

function createInvoice() {
  const projectIdsForInv = state.selectedProjects.filter((pid) => {
    const p = state.projects.find((x) => x.id === pid);
    if (!p) return false;
    if (p.type !== 'hourly') return true;
    return state.selectedEntries.some((eid) => state.entries.find((e) => e.id === eid)?.projectId === pid);
  });
  if (!state.invoiceForm.client || projectIdsForInv.length === 0) {
    showSnackbar('Selecteer minstens één project of urenregel');
    return;
  }
  const content = document.getElementById('invoice-create-content');
  state.invoiceForm.date = content.querySelector('#invoice-date')?.value || state.invoiceForm.date;
  const paymentDays = state.settings.company?.paymentDays ?? 30;
  state.invoiceForm.dueDate = addDays(state.invoiceForm.date, paymentDays);
  state.invoiceForm.notes = content.querySelector('#invoice-notes')?.value || '';
  const invId = uid();
  const projectNames = projectIdsForInv.map((pid) => state.projects.find((p) => p.id === pid)?.name).filter(Boolean).join(', ');
  const inv = {
    id: invId,
    number: `INV-${String(state.invoices.length + 1).padStart(3, '0')}`,
    client: state.invoiceForm.client,
    projectName: projectNames,
    projectIds: projectIdsForInv,
    date: state.invoiceForm.date,
    dueDate: state.invoiceForm.dueDate,
    notes: state.invoiceForm.notes,
    total: calcInvoiceTotal(),
    entryIds: state.selectedEntries,
    status: 'draft',
    createdAt: new Date().toISOString(),
  };
  state.invoices.push(inv);
  state.entries = state.entries.map((e) => (state.selectedEntries.includes(e.id) ? { ...e, invoiceId: invId } : e));
  saveState();
  document.getElementById('invoice-create-dialog').close();
  renderInvoices();
  renderUren();
  renderDashboard();
  showSnackbar('Factuur aangemaakt', {
    undo: () => {
      state.invoices = state.invoices.filter((i) => i.id !== invId);
      state.entries = state.entries.map((e) => (e.invoiceId === invId ? { ...e, invoiceId: null } : e));
      saveState();
      renderInvoices();
      renderUren();
      renderDashboard();
    },
  });
}

function openInvoicePdfDialog(inv) {
  state.pdfInvoice = inv;
  const content = document.getElementById('invoice-pdf-content');
  const co = state.settings.company || {};
  const client = state.clients.find((c) => c.name.toLowerCase() === inv.client.toLowerCase()) || {};
  const invEntries = state.entries.filter((e) => inv.entryIds?.includes(e.id));
  const invoiceProjects = (inv.projectIds || [inv.projectId]).map((pid) => state.projects.find((p) => p.id === pid)).filter(Boolean);
  const exclBtw = inv.total;
  const btw = Math.round(exclBtw * 0.21 * 100) / 100;
  const totalIncBtw = exclBtw + btw;
  const fmt = (n) => new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
  const rows = [];
  const getLabelName = (id) => state.labels?.find((l) => l.id === id)?.name || '';
  invoiceProjects.forEach((p) => {
    if (!p) return;
    if (p.type === 'hourly') {
      const projEntries = invEntries.filter((e) => e.projectId === p.id);
      projEntries.forEach((e) => {
        const labelName = getLabelName(e.labelId);
        const desc = labelName ? `${labelName}: ${e.description || p.name}` : (e.description || p.name);
        rows.push({ nr: rows.length + 1, desc, qty: e.hours, unit: 'uur', price: p.rate, total: e.hours * p.rate });
      });
      if (projEntries.length === 0) rows.push({ nr: rows.length + 1, desc: p.name, qty: 1, unit: 'st.', price: exclBtw, total: exclBtw });
    } else if (p.type === 'fixed') {
      rows.push({ nr: rows.length + 1, desc: p.name, qty: 1, unit: 'st.', price: p.budget, total: p.budget });
    } else if (p.type === 'retainer') {
      rows.push({ nr: rows.length + 1, desc: p.name + ' (' + periodLabel(p.period) + ')', qty: 1, unit: 'st.', price: p.rate, total: p.rate });
    } else if (p.type === 'retainer_hours') {
      const amt = retainerHoursAmount(p);
      rows.push({ nr: rows.length + 1, desc: p.name + ' (' + (p.hoursPerPeriod || 0) + 'u ' + periodLabel(p.period) + ' × ' + formatEur(p.rate) + '/uur)', qty: 1, unit: 'st.', price: amt, total: amt });
    }
  });
  if (rows.length === 0) rows.push({ nr: 1, desc: inv.projectName, qty: 1, unit: 'st.', price: exclBtw, total: exclBtw });
  content.innerHTML = `
    <div id="inv-print" class="pdf-preview">
      ${co.logo ? `<div style="margin-bottom:24px;"><img src="${co.logo}" alt="Logo" style="max-height:60px;max-width:200px;object-fit:contain;"></div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:48px;">
        <div style="font-size:11px;line-height:1.7;">
          <div style="font-weight:bold;font-size:13px;margin-bottom:2px;">${escapeHtml(client.name || inv.client)}</div>
          ${client.contactPerson ? `<div>${escapeHtml(client.contactPerson)}</div>` : ''}
          ${client.address ? `<div>${escapeHtml(client.address)}</div>` : ''}
          ${client.city ? `<div>${escapeHtml(client.city)}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
          <div style="font-weight:bold;font-size:22px;">Factuur</div>
          <table style="border-collapse:collapse;font-size:11px;text-align:right;">
            ${client.debiteurNr ? `<tr><td style="font-weight:bold;padding-right:16px;padding-bottom:2px;">Debiteurnummer</td><td>${escapeHtml(client.debiteurNr)}</td></tr>` : ''}
            <tr><td style="font-weight:bold;padding-right:16px;padding-bottom:2px;">Factuurdatum</td><td>${formatDate(inv.date)}</td></tr>
            <tr><td style="font-weight:bold;padding-right:16px;padding-bottom:2px;">Vervaldatum</td><td>${formatDate(inv.dueDate)}</td></tr>
            <tr><td style="font-weight:bold;padding-right:16px;padding-bottom:2px;">Factuurnummer</td><td>${escapeHtml(inv.number)}</td></tr>
            ${inv.notes ? `<tr><td style="font-weight:bold;padding-right:16px;">Opmerkingen</td><td>${escapeHtml(inv.notes)}</td></tr>` : ''}
          </table>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;">
        <thead>
          <tr>
            <th style="border-bottom:2px solid #222;padding:8px 4px;width:40px;">Art.nr.</th>
            <th style="border-bottom:2px solid #222;padding:8px 4px;">Omschrijving</th>
            <th style="border-bottom:2px solid #222;padding:8px 4px;text-align:right;width:60px;">Aantal</th>
            <th style="border-bottom:2px solid #222;padding:8px 4px;width:50px;">Eenh.</th>
            <th style="border-bottom:2px solid #222;padding:8px 4px;text-align:right;width:90px;">Prijs/stuk</th>
            <th style="border-bottom:2px solid #222;padding:8px 4px;text-align:right;width:90px;">Totaal</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r) => `
            <tr>
              <td style="padding:8px 4px;border-bottom:1px solid #eee;">${r.nr}</td>
              <td style="padding:8px 4px;border-bottom:1px solid #eee;">${escapeHtml(r.desc)}</td>
              <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:right;">${typeof r.qty === 'number' ? r.qty.toFixed(2) : r.qty}</td>
              <td style="padding:8px 4px;border-bottom:1px solid #eee;">${r.unit}</td>
              <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:right;">${fmt(r.price)}</td>
              <td style="padding:8px 4px;border-bottom:1px solid #eee;text-align:right;">${fmt(r.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;">
        <div style="width:300px;">
          <div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Excl. btw</span><span>${fmt(exclBtw)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Btw (21%)</span><span>${fmt(btw)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:8px 0 0;margin-top:6px;border-top:2px solid #222;font-weight:bold;font-size:14px;">
            <span>Totaalbedrag EUR</span><span>${fmt(totalIncBtw)}</span>
          </div>
          <div style="border:2px solid #222;padding:10px 12px;margin-top:16px;font-size:11px;">
            <div><strong>Vervaldatum</strong> ${formatDate(inv.dueDate)}</div>
            <div><strong>Bank</strong> ABN AMRO Bank NV</div>
            <div><strong>IBAN</strong> ${escapeHtml(co.iban || '')}</div>
            <div><strong>Rekeninghouder</strong> ${escapeHtml(co.name || '')}</div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:48px;margin-top:60px;padding-top:14px;border-top:1px solid #ccc;font-size:10px;color:#555;">
        <div><div style="font-weight:bold;color:#222;margin-bottom:3px;">Adres</div><div>${escapeHtml(co.name)}</div><div>${escapeHtml(co.address)}</div><div>${escapeHtml(co.city)}</div></div>
        <div><div style="font-weight:bold;color:#222;margin-bottom:3px;">Telefoon</div><div>${escapeHtml(co.phone)}</div><div style="font-weight:bold;margin-top:8px;">E-mail/website</div><div>${escapeHtml(co.email)}</div><div>${escapeHtml(co.website)}</div></div>
        <div><div style="font-weight:bold;color:#222;margin-bottom:3px;">KvK-nummer</div><div>${escapeHtml(co.kvk)}</div>${co.btw ? `<div style="font-weight:bold;margin-top:8px;">BTW-nummer</div><div>${escapeHtml(co.btw)}</div>` : ''}</div>
      </div>
    </div>
  `;
  document.getElementById('invoice-pdf-dialog').show();
}

function printInvoicePdf() {
  const printEl = document.getElementById('inv-print');
  if (!printEl) return;
  const inv = state.pdfInvoice;
  const filename = (inv?.number || 'factuur').replace(/\s+/g, '-') + '.pdf';

  const doPrint = () => {
    const w = window.open('', '_blank');
    if (!w) {
      showSnackbar('Pop-up geblokkeerd. Sta pop-ups toe of gebruik Download PDF.');
      return;
    }
    const styles = `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #222; padding: 40px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 8px 4px; border-bottom: 1px solid #eee; }
      th { border-bottom: 2px solid #222; text-align: left; }
      img { max-height: 60px; max-width: 200px; object-fit: contain; }
    `;
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Factuur</title><style>' + styles + '</style></head><body>');
    w.document.write(printEl.innerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); }, 600);
  };

  if (typeof html2pdf !== 'undefined') {
    const opt = {
      margin: 10,
      filename,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };
    html2pdf().set(opt).from(printEl).save()
      .then(() => showSnackbar('PDF gedownload'))
      .catch((err) => {
        console.warn('html2pdf failed:', err);
        doPrint();
      });
  } else {
    doPrint();
  }
}

// ─── Tab & Init ───────────────────────────────────────────────────────────
const TAB_IDS = ['dash', 'projects', 'uren', 'invoices', 'clients', 'settings'];
const TAB_LABELS = { dash: 'Dashboard', projects: 'Projecten', uren: 'Uren', invoices: 'Facturen', clients: 'Klanten', settings: 'Instellingen' };

function getTabFromHash() {
  const hash = (window.location.hash || '').replace(/^#/, '');
  return TAB_IDS.includes(hash) ? hash : 'dash';
}

function switchTab(tabId) {
  state.tab = tabId;
  if (TAB_IDS.includes(tabId)) window.location.hash = tabId;
  state.menuOpen = false;
  document.getElementById('menu-dropdown')?.classList.remove('open');
  document.getElementById('menu-overlay')?.classList.remove('visible');
  const headerLabel = document.getElementById('header-tab-label');
  if (headerLabel) headerLabel.textContent = TAB_LABELS[tabId] || '';
  document.querySelectorAll('.menu-item').forEach((m) => {
    m.classList.toggle('active', m.dataset.tab === tabId);
  });
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.remove('active');
    loading.style.cssText = 'display:none !important;';
  }
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.remove('active');
    if (p.id === 'loading') return;
    p.style.display = (p.id === 'panel-' + tabId) ? 'block' : 'none';
  });
  const panel = document.getElementById('panel-' + tabId);
  if (panel) {
    panel.classList.add('active');
    panel.style.display = 'block';
  }
  if (tabId === 'dash') renderDashboard();
  else if (tabId === 'projects') renderProjects();
  else if (tabId === 'uren') renderUren();
  else if (tabId === 'invoices') renderInvoices();
  else if (tabId === 'clients') renderClients();
  else if (tabId === 'settings') renderSettings();
  const fab = document.getElementById('fab-quick-log');
  if (fab) fab.style.display = state.projects.length > 0 ? 'flex' : 'none';
  updateTimerHeader();
}

function init() {
  const loadStart = Date.now();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js', { scope: './' }).catch(() => {});
  }
  loadState();
  if (window.__firebaseUser && !window.__initialData) saveState();
  if (state.timers?.length > 0) startTimerTick();
  updateTimerHeader();
  applyDarkMode(getEffectiveDarkMode());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (typeof state.settings.darkMode !== 'boolean') applyDarkMode(getEffectiveDarkMode());
  });
  document.getElementById('header-timer')?.addEventListener('click', () => switchTab('uren'));
  document.getElementById('hamburger-btn')?.addEventListener('click', () => {
    state.menuOpen = !state.menuOpen;
    document.getElementById('menu-dropdown').classList.toggle('open', state.menuOpen);
    document.getElementById('menu-overlay').classList.toggle('visible', state.menuOpen);
  });
  document.getElementById('menu-overlay')?.addEventListener('click', () => {
    state.menuOpen = false;
    document.getElementById('menu-dropdown')?.classList.remove('open');
    document.getElementById('menu-overlay')?.classList.remove('visible');
  });
  document.querySelectorAll('.menu-item').forEach((m) => {
    if (m.id === 'menu-account') return;
    m.addEventListener('click', () => switchTab(m.dataset.tab));
  });
  const menuAccount = document.getElementById('menu-account');
  if (menuAccount) {
    const hasFirebase = window.firebaseConfig?.apiKey && window.firebaseConfig.apiKey !== 'VUL_JE_API_KEY_IN';
    menuAccount.textContent = window.__firebaseUser ? 'Uitloggen' : (hasFirebase ? 'Inloggen' : '');
    menuAccount.style.display = hasFirebase || window.__firebaseUser ? '' : 'none';
    menuAccount.addEventListener('click', async () => {
      document.getElementById('menu-dropdown')?.classList.remove('open');
      state.menuOpen = false;
      document.getElementById('menu-overlay')?.classList.remove('visible');
      if (window.__firebaseUser) {
        const fb = window.__firebase;
        if (fb?.firebaseSignOut) {
          await fb.firebaseSignOut();
          location.reload();
        }
      } else {
        document.getElementById('login-screen').style.display = 'flex';
        document.getElementById('app-shell').style.display = 'none';
        const errEl = document.getElementById('login-error');
        try {
          const fb = window.__firebase || (await import('./firebase-app.js'));
          const cfg = window.firebaseConfig;
          if (!fb || !cfg?.apiKey) throw new Error('Firebase niet geconfigureerd');
          if (!fb.getFirebaseAuth?.()) fb.initFirebase(cfg);
          const auth = fb.getFirebaseAuth?.();
          if (!auth) throw new Error('Firebase kon niet starten');
          window.__firebase = fb;
          const doLogin = async (isSignUp) => {
            const email = document.getElementById('login-email')?.value?.trim();
            const pass = document.getElementById('login-password')?.value || '';
            errEl.style.display = 'none';
            if (!email || !pass) {
              errEl.textContent = 'Vul e-mail en wachtwoord in';
              errEl.style.display = 'block';
              return;
            }
            try {
              if (isSignUp) await fb.firebaseSignUp(email, pass);
              else await fb.firebaseSignIn(email, pass);
              location.reload();
            } catch (e) {
              errEl.textContent = e.message || 'Inloggen mislukt';
              errEl.style.display = 'block';
            }
          };
          document.getElementById('login-btn').onclick = () => doLogin(false);
          document.getElementById('signup-btn').onclick = () => doLogin(true);
        } catch (e) {
          errEl.textContent = e.message || 'Kon niet verbinden. Controleer je internetverbinding.';
          errEl.style.display = 'block';
        }
      }
    });
  }
  document.getElementById('fab-quick-log')?.addEventListener('click', () => openQuickLogDialog());
  document.getElementById('btn-quick-log-save')?.addEventListener('click', saveQuickLog);
  document.getElementById('btn-quick-log-close')?.addEventListener('click', () => document.getElementById('quick-log-dialog').close());
  document.getElementById('btn-project-save')?.addEventListener('click', saveProject);
  document.getElementById('btn-project-close')?.addEventListener('click', () => document.getElementById('project-dialog').close());
  document.getElementById('btn-client-save')?.addEventListener('click', saveClient);
  document.getElementById('btn-client-close')?.addEventListener('click', () => document.getElementById('client-dialog').close());
  document.getElementById('btn-invoice-create')?.addEventListener('click', createInvoice);
  document.getElementById('btn-invoice-create-close')?.addEventListener('click', () => document.getElementById('invoice-create-dialog').close());
  document.getElementById('btn-pdf-print')?.addEventListener('click', printInvoicePdf);
  document.getElementById('btn-pdf-close')?.addEventListener('click', () => document.getElementById('invoice-pdf-dialog').close());
  document.getElementById('btn-invoice-status-close')?.addEventListener('click', () => {
    state.pendingInvoiceStatus = null;
    document.getElementById('invoice-status-dialog')?.close();
  });
  document.getElementById('btn-confirm-delete-yes')?.addEventListener('click', () => {
    executePendingDelete();
    document.getElementById('confirm-delete-dialog')?.close();
  });
  document.getElementById('btn-confirm-delete-no')?.addEventListener('click', () => {
    state.pendingDelete = null;
    document.getElementById('confirm-delete-dialog')?.close();
  });
  const confirmDlg = document.getElementById('confirm-delete-dialog');
  if (confirmDlg) {
    confirmDlg.addEventListener('cancel', () => { state.pendingDelete = null; });
  }
  const appHeader = document.querySelector('.app-header');
  const fab = document.getElementById('fab-quick-log');
  const updateHeaderInert = () => {
    const anyOpen = document.querySelector('md-dialog[open]');
    if (appHeader) appHeader.inert = !!anyOpen;
    if (fab) fab.style.display = anyOpen ? 'none' : (state.projects.length > 0 ? 'flex' : 'none');
  };
  const injectScrimStyle = (dialog) => {
    if (!dialog?.shadowRoot || dialog.dataset.scrimStyled) return;
    const style = document.createElement('style');
    style.textContent = '.scrim { opacity: 0.8 !important; }';
    dialog.shadowRoot.appendChild(style);
    dialog.dataset.scrimStyled = '1';
  };
  document.querySelectorAll('md-dialog').forEach((d) => {
    injectScrimStyle(d);
    d.addEventListener('open', updateHeaderInert);
    d.addEventListener('closed', () => setTimeout(updateHeaderInert, 0));
  });
  new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      if (m.addedNodes?.length) m.addedNodes.forEach((n) => {
        if (n?.nodeName === 'MD-DIALOG') injectScrimStyle(n);
      });
    });
  }).observe(document.body, { childList: true, subtree: true });
  document.getElementById('snackbar-undo')?.addEventListener('click', onSnackbarUndo);
  // Voorkom dat scrollen in select-dropdown de pagina scrollt
  let selectMenuOpenCount = 0;
  document.addEventListener('opened', (e) => {
    if (e.target?.matches?.('md-outlined-select, md-filled-select')) {
      selectMenuOpenCount++;
      document.body.style.overflow = 'hidden';
    }
  }, true);
  document.addEventListener('closed', (e) => {
    if (e.target?.matches?.('md-outlined-select, md-filled-select')) {
      selectMenuOpenCount = Math.max(0, selectMenuOpenCount - 1);
      if (selectMenuOpenCount === 0) document.body.style.overflow = '';
    }
  }, true);
  document.addEventListener('keydown', (e) => {
    const dialogOpen = document.querySelector('md-dialog[open]');
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      if (dialogOpen) {
        e.preventDefault();
        const id = dialogOpen.id;
        if (id === 'quick-log-dialog') saveQuickLog();
        else if (id === 'project-dialog') saveProject();
        else if (id === 'client-dialog') saveClient();
        else if (id === 'invoice-create-dialog') createInvoice();
      }
      return;
    }
    if (!(e.ctrlKey || e.metaKey)) return;
    const active = document.activeElement;
    const isEditing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
    if (isEditing || dialogOpen) return;
    if (e.key === 'u') {
      if (state.projects.length > 0) {
        e.preventDefault();
        openQuickLogDialog();
      }
    } else if (e.key === 'k') {
      e.preventDefault();
      openClientDialog();
    }
  });
  window.addEventListener('hashchange', () => switchTab(getTabFromHash()));
  const minSkeletonMs = 400;
  const elapsed = Date.now() - loadStart;
  const delay = Math.max(0, minSkeletonMs - elapsed);
  setTimeout(() => switchTab(getTabFromHash()), delay);
}

(function() {
  try {
    init();
  } catch (err) {
    console.error('Init error:', err);
    const loading = document.getElementById('loading');
    if (loading) loading.innerHTML = '<p style="color:var(--md-sys-color-error);">Fout: ' + String(err.message) + '</p>';
  }
})();
