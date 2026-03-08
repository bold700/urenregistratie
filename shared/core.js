/**
 * Shared core – constants, utils, storage, migration
 * Gebruikt door alle apps in het ecosysteem (uren, projecten, planning)
 */

// ─── Constants & config ─────────────────────────────────────────────────────
export const BREAKPOINT_MOBILE = 960;
export const BREAKPOINT_SMALL = 600;
export const DEFAULT_WEEK_CAPACITY = 40;
export const DEFAULT_PAYMENT_DAYS = 14;
export const DEFAULT_INVOICE_DUE_DAYS = 30;
export const OLD_UNBILLED_WEEKS_THRESHOLD = 4;
export const SNACKBAR_DURATION_MS = 4000;
export const MIN_SKELETON_MS = 400;
export const MAX_LOGO_SIZE_BYTES = 500 * 1024;

export const STORAGE_KEYS = {
  projects: 'bold700:projects',
  entries: 'bold700:timeentries',
  invoices: 'bold700:invoices',
  settings: 'bold700:settings',
  clients: 'bold700:clients',
  labels: 'bold700:labels',
  timer: 'bold700:timer',
  todos: 'bold700:todos',
  lastUsedProjectIds: 'bold700:lastUsedProjectIds',
  legacy: 'urenregistratie-data',
  legacyCapacity: 'urenregistratie-capacity',
};

export const DEFAULT_LABELS = [
  { id: 'lbl-1', name: 'Design' },
  { id: 'lbl-2', name: 'Call' },
  { id: 'lbl-3', name: 'Research' },
  { id: 'lbl-4', name: 'Development' },
  { id: 'lbl-5', name: 'Overleg' },
];

// ─── Formatting & formatters ────────────────────────────────────────────────
export const formatEur = (n) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n || 0);

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

export const formatDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export const formatEntryDateTime = (e) => (e?.createdAt ? formatDateTime(e.createdAt) : formatDate(e?.date));

export const today = () => new Date().toISOString().split('T')[0];
export const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 9) : Math.random().toString(36).slice(2, 11));
export const isMobile = () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${BREAKPOINT_MOBILE}px)`).matches;

export const addDays = (dateStr, days) => {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

export const typeLabel = (t) => ({ hourly: 'Per uur', fixed: 'Vaste prijs', retainer: 'Retainer (vast bedrag)', retainer_hours: 'Retainer (uren per periode)' })[t] || t;
export const periodLabel = (p) => ({ week: 'p/week', '4weeks': 'p/4wk', month: 'p/maand', quarter: 'p/kwartaal' })[p] || 'p/maand';
export const retainerHoursAmount = (p) => (p.hoursPerPeriod || 0) * (p.rate || 0);
export const retainerAmountPerMonth = (p) => {
  const amt = p.type === 'retainer' ? (p.rate || 0) : retainerHoursAmount(p);
  if (!amt) return 0;
  const mult = { week: 4.33, '4weeks': 1, month: 1, quarter: 1 / 3 }[p.period || 'month'] ?? 1;
  return amt * mult;
};
export const retainerHoursPerWeek = (p) => {
  if (p.type !== 'retainer_hours' || !p.hoursPerPeriod) return 0;
  const mult = { week: 1, '4weeks': 0.25, month: 1 / 4.33, quarter: 1 / 13 }[p.period || 'month'] ?? 1 / 4.33;
  return (p.hoursPerPeriod || 0) * mult;
};
export const retainerHoursPerMonth = (p) => {
  if (p.type !== 'retainer_hours' || !p.hoursPerPeriod) return 0;
  const mult = { week: 4.33, '4weeks': 1, month: 1, quarter: 1 / 3 }[p.period || 'month'] ?? 1;
  return (p.hoursPerPeriod || 0) * mult;
};

// ─── Week & date utilities ──────────────────────────────────────────────────
export function getISOWeek(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  const yearStart = new Date(date.getFullYear(), 0, 1);
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

// ─── Storage & migration ────────────────────────────────────────────────────
export function storageLoad(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : (key === STORAGE_KEYS.settings ? null : []);
  } catch {
    return key === STORAGE_KEYS.settings ? null : [];
  }
}

export function storageSave(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {}
}

export function migrateLegacyData() {
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
      dueDate: i.dueDate || addDays(i.date || today(), DEFAULT_INVOICE_DUE_DAYS),
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
        if (!raw) return { weekCapacity: DEFAULT_WEEK_CAPACITY, paymentDays: DEFAULT_PAYMENT_DAYS };
        const c = JSON.parse(raw);
        return { weekCapacity: c.maxHoursPerWeek || DEFAULT_WEEK_CAPACITY, paymentDays: DEFAULT_PAYMENT_DAYS };
      } catch {
        return { weekCapacity: DEFAULT_WEEK_CAPACITY, paymentDays: DEFAULT_PAYMENT_DAYS };
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

// ─── UI helpers ─────────────────────────────────────────────────────────────
export function escapeHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function emptyState(opts) {
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

// ─── Theme / dark mode ──────────────────────────────────────────────────────
export function getSystemPrefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function getEffectiveDarkMode(settings) {
  if (settings && typeof settings.darkMode === 'boolean') return settings.darkMode;
  return getSystemPrefersDark();
}

export function applyDarkMode(enabled) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (enabled) {
    root.setAttribute('data-color-scheme', 'dark');
    root.classList.add('dark');
  } else {
    root.removeAttribute('data-color-scheme');
    root.classList.remove('dark');
  }
}

// ─── Initial state ─────────────────────────────────────────────────────────
export function createInitialState() {
  return {
    tab: 'dash',
    menuOpen: false,
    projects: [],
    entries: [],
    invoices: [],
    clients: [],
    labels: [...DEFAULT_LABELS],
    settings: {
      weekCapacity: DEFAULT_WEEK_CAPACITY,
      company: {},
      members: [],
    },
    statusFilter: 'active',
    entryFilter: 'all',
    quickLogForm: { projectId: '', date: today(), hours: '', description: '', notBillable: false, personId: '' },
    timers: [],
    timerTickInterval: null,
    projectForm: {},
    clientForm: {},
    invoiceForm: { client: '', date: today(), dueDate: addDays(today(), DEFAULT_INVOICE_DUE_DAYS), notes: '' },
    selectedProjects: [],
    selectedEntries: [],
    pdfInvoice: null,
    pendingDelete: null,
    viewingClientId: null,
    todos: [],
    todoFilter: 'open',
    projectFilter: 'all',
    takenViewMode: 'mijn-werk',
    lastUsedProjectIds: [],
  };
}

/** Schatting in minuten – 5, 15, 30, 60. Snel = ≤15 */
export const ESTIMATE_OPTIONS = [
  { value: '', label: 'Geen schatting' },
  { value: '5', label: '± 5 min' },
  { value: '15', label: '± 15 min' },
  { value: '30', label: '± 30 min' },
  { value: '60', label: '± 1 uur' },
];

/** Initial state voor projecten + to-do app */
export function createProjectenInitialState() {
  return {
    projects: [],
    clients: [],
    todos: [],
    projectFilter: 'all', // 'all' | projectId
    todoFilter: 'open',   // 'open' | 'done' | 'all'
    menuOpen: false,
  };
}
