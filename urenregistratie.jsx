import { useState, useEffect } from "react";

const STORAGE_KEYS = {
  projects: "bold700:projects",
  entries: "bold700:timeentries",
  invoices: "bold700:invoices",
  settings: "bold700:settings",
};

const formatEur = (n) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n || 0);

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const today = () => new Date().toISOString().split("T")[0];
const uid = () => Math.random().toString(36).slice(2, 9);
const addDays = (dateStr, days) => { const d = new Date(dateStr); d.setDate(d.getDate() + days); return d.toISOString().split("T")[0]; };
const typeLabel = t => ({ hourly: "Per uur", fixed: "Vaste prijs", retainer: "Retainer" })[t] || t;
const periodLabel = p => ({ week: "p/week", "4weeks": "p/4wk", month: "p/maand", quarter: "p/kwartaal" })[p] || "p/maand";

function useIsMobile() {
  const [mobile, setMobile] = useState(window.innerWidth < 600);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 600);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

async function storageLoad(key) {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : []; } catch { return []; }
}
async function storageSave(key, data) {
  try { await window.storage.set(key, JSON.stringify(data)); } catch {}
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const Icon = ({ d, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
const ICONS = {
  project: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  clock: "M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zM12 6v6l4 2",
  invoice: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z",
  dash: "M3 12h18M3 6h18M3 18h18",
  plus: "M12 5v14M5 12h14",
  trash: "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
  check: "M20 6L9 17l-5-5",
  x: "M18 6L6 18M6 6l12 12",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z",
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  input: (focused) => ({
    backgroundColor: "#161616",
    border: `1px solid ${focused ? "#C8FF00" : "#3a3a3a"}`,
    color: "#f0f0f0",
    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    fontSize: "13px",
    padding: "10px 12px",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
    colorScheme: "dark",
    display: "block",
    transition: "border-color 0.15s",
    WebkitTextFillColor: "#f0f0f0",
  }),
  label: {
    fontSize: "10px",
    color: "#aaa",
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    display: "block",
    marginBottom: "5px",
  },
};

// ─── Shared UI ────────────────────────────────────────────────────────────────
const Btn = ({ children, onClick, variant = "primary", small, disabled }) => {
  const base = { display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "inherit", fontWeight: "700", fontSize: small ? "11px" : "13px", padding: small ? "6px 12px" : "10px 18px", border: "1px solid", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, transition: "all 0.15s", letterSpacing: "0.05em", background: "none", whiteSpace: "nowrap", alignSelf: "flex-start" };
  const vars = {
    primary: { backgroundColor: "#C8FF00", color: "#0a0a0a", borderColor: "#C8FF00" },
    ghost: { backgroundColor: "transparent", color: "#999", borderColor: "#3a3a3a" },
    danger: { backgroundColor: "transparent", color: "#ff5555", borderColor: "#ff5555" },
    success: { backgroundColor: "transparent", color: "#55ff99", borderColor: "#55ff99" },
  };
  return <button disabled={disabled} onClick={onClick} style={{ ...base, ...vars[variant] }}>{children}</button>;
};

function FInput({ label, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      {label && <span style={S.label}>{label}</span>}
      <input style={S.input(focused)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} {...props} />
    </div>
  );
}

function FSelect({ label, children, ...props }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      {label && <span style={S.label}>{label}</span>}
      <select style={{ ...S.input(focused), cursor: "pointer" }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} {...props}>
        {children}
      </select>
    </div>
  );
}

const Card = ({ children, style = {} }) => (
  <div style={{ backgroundColor: "#111", border: "1px solid #222", padding: "16px", ...style }}>{children}</div>
);

const Badge = ({ children, color = "#C8FF00" }) => (
  <span style={{ fontFamily: "inherit", fontSize: "10px", padding: "2px 7px", border: `1px solid ${color}`, color, backgroundColor: color + "18", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
    {children}
  </span>
);

const Modal = ({ title, onClose, children }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.85)" }}>
    <div onClick={e => e.stopPropagation()} style={{ backgroundColor: "#0f0f0f", border: "1px solid #333", borderBottom: "none", width: "100%", maxWidth: "540px", maxHeight: "92vh", overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #222", position: "sticky", top: 0, backgroundColor: "#0f0f0f", zIndex: 1 }}>
        <span style={{ fontFamily: "inherit", fontWeight: "700", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00" }}>{title}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#999", cursor: "pointer", padding: "4px" }}><Icon d={ICONS.x} /></button>
      </div>
      <div style={{ padding: "20px" }}>{children}</div>
    </div>
  </div>
);

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("dash");
  const [quickLog, setQuickLog] = useState(false);
  const [projects, setProjects] = useState([]);
  const [entries, setEntries] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({ weekCapacity: 40 });
  const isMobile = useIsMobile();

  useEffect(() => {
    (async () => {
      setProjects(await storageLoad(STORAGE_KEYS.projects));
      setEntries(await storageLoad(STORAGE_KEYS.entries));
      setInvoices(await storageLoad(STORAGE_KEYS.invoices));
      const s = await storageLoad(STORAGE_KEYS.settings);
      if (s && s.weekCapacity) setSettings({ weekCapacity: s.weekCapacity });
      setLoading(false);
    })();
  }, []);

  const saveProjects = async d => { setProjects(d); await storageSave(STORAGE_KEYS.projects, d); };
  const saveEntries = async d => { setEntries(d); await storageSave(STORAGE_KEYS.entries, d); };
  const saveInvoices = async d => { setInvoices(d); await storageSave(STORAGE_KEYS.invoices, d); };
  const saveSettings = async d => { setSettings(d); await storageSave(STORAGE_KEYS.settings, d); };

  if (loading) return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" }}>
      <span style={{ color: "#C8FF00", fontSize: "13px" }}>LADEN...</span>
    </div>
  );

  const tabs = [
    { id: "dash", label: "Dashboard", icon: ICONS.dash },
    { id: "projects", label: "Projecten", icon: ICONS.project },
    { id: "uren", label: "Uren", icon: ICONS.clock },
    { id: "invoices", label: "Facturen", icon: ICONS.invoice },
    { id: "settings", label: "Instellingen", icon: ICONS.settings },
  ];

  const mono = { fontFamily: "'JetBrains Mono', 'Courier New', monospace" };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#0a0a0a", color: "#eee", ...mono, paddingBottom: isMobile ? "70px" : "0" }}>
      {/* Header — hidden on mobile to save space */}
      {!isMobile && (
        <div style={{ borderBottom: "1px solid #1a1a1a", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ color: "#C8FF00", fontWeight: "900", letterSpacing: "0.15em", fontSize: "13px" }}>BOLD700</span>
            <span style={{ color: "#333" }}>·</span>
            <span style={{ color: "#888", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase" }}>Urenregistratie</span>
          </div>
          <span style={{ color: "#333", fontSize: "11px" }}>{new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
      )}

      {/* Nav — top on desktop, bottom on mobile */}
      {isMobile ? (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 40, backgroundColor: "#0d0d0d", borderTop: "1px solid #222", display: "flex" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "10px 0 8px", fontSize: "9px", fontFamily: "inherit", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.08em", background: "none", border: "none", borderTop: `2px solid ${tab === t.id ? "#C8FF00" : "transparent"}`, color: tab === t.id ? "#C8FF00" : "#aaa", cursor: "pointer" }}>
              <Icon d={t.icon} size={18} />
              {t.label.slice(0, 5)}
            </button>
          ))}
        </div>
      ) : (
        <div style={{ borderBottom: "1px solid #1a1a1a", padding: "0 24px", display: "flex" }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "12px 16px", fontSize: "11px", fontFamily: "inherit", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.12em", background: "none", border: "none", borderBottom: `2px solid ${tab === t.id ? "#C8FF00" : "transparent"}`, color: tab === t.id ? "#C8FF00" : "#aaa", cursor: "pointer", transition: "all 0.15s" }}>
              <Icon d={t.icon} size={13} />
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Mobile header strip */}
      {isMobile && (
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1a1a1a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: "#C8FF00", fontWeight: "900", letterSpacing: "0.15em", fontSize: "12px" }}>BOLD700</span>
          <span style={{ color: "#888", fontSize: "10px" }}>{new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</span>
        </div>
      )}

      {/* Content */}
      <div style={{ padding: isMobile ? "16px" : "24px", maxWidth: "900px", margin: "0 auto" }}>
        {tab === "dash" && <Dashboard projects={projects} entries={entries} invoices={invoices} setTab={setTab} isMobile={isMobile} settings={settings} />}
        {tab === "projects" && <Projects projects={projects} entries={entries} saveProjects={saveProjects} isMobile={isMobile} />}
        {tab === "uren" && <Uren entries={entries} projects={projects} invoices={invoices} saveEntries={saveEntries} isMobile={isMobile} />}
        {tab === "invoices" && <Invoices invoices={invoices} entries={entries} projects={projects} saveInvoices={saveInvoices} saveEntries={saveEntries} isMobile={isMobile} />}
        {tab === "settings" && <Settings settings={settings} saveSettings={saveSettings} />}
      </div>

      {/* Global FAB — always visible when projects exist */}
      {projects.length > 0 && (
        <button onClick={() => setQuickLog(true)} style={{ position: "fixed", bottom: isMobile ? "82px" : "24px", right: "20px", width: "52px", height: "52px", borderRadius: "50%", backgroundColor: "#C8FF00", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(200,255,0,0.35)", zIndex: 45, transition: "transform 0.15s", fontFamily: "inherit" }}
          onMouseEnter={e => e.currentTarget.style.transform = "scale(1.08)"}
          onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      )}

      {/* Quick log modal */}
      {quickLog && <QuickLogModal projects={projects} entries={entries} saveEntries={saveEntries} onClose={() => setQuickLog(false)} />}
    </div>
  );
}

// ─── QuickLog Modal ───────────────────────────────────────────────────────────
function QuickLogModal({ projects, entries, saveEntries, onClose }) {
  const activeProjects = projects.filter(p => p.status === "active");
  const [form, setForm] = useState({
    projectId: activeProjects[0]?.id || "",
    date: today(),
    hours: "",
    description: "",
    notBillable: false,
  });
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (!form.projectId) { setError("Selecteer een project"); return; }
    if (!form.hours || parseFloat(form.hours) <= 0) { setError("Vul uren in"); return; }
    saveEntries([...entries, { ...form, id: uid(), hours: parseFloat(form.hours), createdAt: new Date().toISOString() }]);
    setSaved(true);
    setTimeout(() => onClose(), 800);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.85)" }}>
      <div onClick={e => e.stopPropagation()} style={{ backgroundColor: "#0f0f0f", border: "1px solid #333", borderBottom: "none", width: "100%", maxWidth: "540px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #222" }}>
          <span style={{ fontWeight: "700", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.15em", color: "#C8FF00" }}>
            {saved ? "✓ Opgeslagen!" : "Uren loggen"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#999", cursor: "pointer", padding: "4px" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Project selector as pills if few projects, else dropdown */}
          {activeProjects.length <= 4 ? (
            <div>
              <span style={S.label}>Project</span>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {activeProjects.map(p => (
                  <button key={p.id} onClick={() => setForm(f => ({ ...f, projectId: p.id }))}
                    style={{ padding: "8px 14px", fontSize: "12px", fontFamily: "inherit", fontWeight: "700", border: `1px solid ${form.projectId === p.id ? "#C8FF00" : "#333"}`, backgroundColor: form.projectId === p.id ? "#C8FF00" : "transparent", color: form.projectId === p.id ? "#0a0a0a" : "#777", cursor: "pointer", transition: "all 0.1s", textAlign: "left", lineHeight: "1.3" }}>
                    <div>{p.name}</div>
                    <div style={{ fontSize: "10px", fontWeight: "400", opacity: 0.65, marginTop: "2px" }}>{p.client}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <FSelect label="Project" value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))}>
              <option value="">Selecteer...</option>
              {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </FSelect>
          )}

          {/* Hours — big tap targets */}
          <div>
            <span style={S.label}>Uren</span>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "8px" }}>
              {[0.5, 1, 1.5, 2, 3, 4].map(h => (
                <button key={h} onClick={() => setForm(f => ({ ...f, hours: String(h) }))}
                  style={{ padding: "10px 16px", fontSize: "13px", fontFamily: "inherit", fontWeight: "700", border: `1px solid ${String(form.hours) === String(h) ? "#C8FF00" : "#333"}`, backgroundColor: String(form.hours) === String(h) ? "#C8FF00" : "transparent", color: String(form.hours) === String(h) ? "#0a0a0a" : "#777", cursor: "pointer", transition: "all 0.1s" }}>
                  {h}u
                </button>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "#888", whiteSpace: "nowrap" }}>of:</span>
                <FInput type="number" step="0.25" min="0.25" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder="bijv. 6.5" />
              </div>
            </div>
          </div>

          <FInput label="Datum" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
          <FInput label="Omschrijving (optioneel)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Wat heb je gedaan?" />

          {error && <div style={{ color: "#ff5555", fontSize: "12px", backgroundColor: "#ff555515", border: "1px solid #ff5555", padding: "8px 12px" }}>{error}</div>}

          <button onClick={handleSave} disabled={saved} style={{ width: "100%", padding: "14px", backgroundColor: saved ? "#55ff99" : "#C8FF00", color: "#0a0a0a", border: "none", fontFamily: "inherit", fontWeight: "900", fontSize: "14px", letterSpacing: "0.1em", textTransform: "uppercase", cursor: saved ? "default" : "pointer", transition: "background-color 0.2s" }}>
            {saved ? "✓ Opgeslagen" : "Opslaan"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ projects, entries, invoices, setTab, isMobile, settings = { weekCapacity: 40, fixedHours: 36 } }) {
  const now = new Date();
  const thisMonth = entries.filter(e => e.date?.startsWith(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`));

  const draftInvoiceIds = new Set(invoices.filter(i => i.status === "draft").map(i => i.id));
  const unbilledEntries = entries.filter(e => !e.notBillable && (!e.invoiceId || draftInvoiceIds.has(e.invoiceId)));
  const unbilledValue = unbilledEntries.reduce((sum, e) => {
    const p = projects.find(p => p.id === e.projectId);
    if (!p || p.type !== "hourly") return sum;
    return sum + (e.hours || 0) * (p.rate || 0);
  }, 0);

  const openInvoices = invoices.filter(i => i.status === "sent" || i.status === "overdue");
  const openValue = openInvoices.reduce((s, i) => s + (i.total || 0), 0);
  const paidValue = invoices.filter(i => i.status === "paid").reduce((s, i) => s + (i.total || 0), 0);
  const monthHours = thisMonth.reduce((s, e) => s + (e.hours || 0), 0);

  // Capaciteit deze week
  const weekStart = (() => {
    const d = new Date();
    const day = d.getDay(); // 0=zo, 1=ma...
    const diff = day === 0 ? -6 : 1 - day; // zondag = terug naar maandag vorige week
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  })();
  const weekEnd = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = day === 0 ? 0 : 7 - day; // zondag = vandaag is al einde
    d.setDate(d.getDate() + diff);
    return d.toISOString().split("T")[0];
  })();
  const hoursThisWeek = entries.filter(e => e.date >= weekStart && e.date <= weekEnd).reduce((s, e) => s + (e.hours || 0), 0);
  const weekCapacity = settings.weekCapacity || 40;
  const pct = Math.min(100, (hoursThisWeek / weekCapacity) * 100);
  const hoursLeft = Math.max(0, weekCapacity - hoursThisWeek);
  const overbooked = hoursThisWeek > weekCapacity;

  const stats = [
    { label: "Te factureren", value: formatEur(unbilledValue), sub: `${unbilledEntries.length} urenregels`, color: "#C8FF00" },
    { label: "Openstaand", value: formatEur(openValue), sub: `${openInvoices.length} facturen`, color: "#FFAA00" },
    { label: "Ontvangen", value: formatEur(paidValue), sub: "alle tijden", color: "#55ff99" },
    { label: "Uren deze maand", value: `${monthHours.toFixed(1)}u`, sub: `${thisMonth.length} regels`, color: "#88aaff" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        {stats.map(s => (
          <Card key={s.label}>
            <div style={{ fontSize: "9px", color: "#888", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "6px" }}>{s.label}</div>
            <div style={{ fontSize: isMobile ? "18px" : "22px", fontWeight: "900", color: s.color, wordBreak: "break-all" }}>{s.value}</div>
            <div style={{ fontSize: "10px", color: "#aaa", marginTop: "4px" }}>{s.sub}</div>
          </Card>
        ))}
      </div>

      {/* Capaciteitsbalk */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "8px" }}>
          <div>
            <span style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.12em" }}>Capaciteit deze week</span>
            <span style={{ fontSize: "10px", color: "#555", marginLeft: "8px" }}>{new Date(weekStart).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – {new Date(weekEnd).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}</span>
          </div>
          <span style={{ fontSize: "11px", fontWeight: "700", color: overbooked ? "#ff5555" : hoursLeft === 0 ? "#FFAA00" : "#888" }}>
            {hoursThisWeek.toFixed(1)}u / {weekCapacity}u {overbooked ? "⚠ overbezet" : hoursLeft === 0 ? "vol" : `· ${hoursLeft.toFixed(1)}u over`}
          </span>
        </div>
        <div style={{ height: "6px", backgroundColor: "#1a1a1a", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", backgroundColor: overbooked ? "#ff5555" : pct > 80 ? "#FFAA00" : "#C8FF00", transition: "width 0.4s, background-color 0.3s" }} />
        </div>
      </div>

      <div>
        <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px" }}>Actieve projecten</div>
        {projects.filter(p => p.status === "active").length === 0 ? (
          <Card><div style={{ color: "#aaa", fontSize: "13px", textAlign: "center", padding: "20px 0" }}>
            Geen actieve projecten.{" "}
            <button onClick={() => setTab("projects")} style={{ color: "#C8FF00", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: "13px", textDecoration: "underline" }}>Maak een project aan →</button>
          </div></Card>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {projects.filter(p => p.status === "active").map(p => {
              const pEntries = entries.filter(e => e.projectId === p.id);
              const totalHours = pEntries.reduce((s, e) => s + (e.hours || 0), 0);
              const draftInvoiceIds = new Set(invoices.filter(i => i.status === "draft").map(i => i.id));
              const unbilledHours = pEntries.filter(e => !e.notBillable && (!e.invoiceId || draftInvoiceIds.has(e.invoiceId))).reduce((s, e) => s + (e.hours || 0), 0);
              return (
                <Card key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: "700", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{p.client} · {typeLabel(p.type)}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: "700", color: "#C8FF00", fontSize: "13px" }}>{totalHours.toFixed(1)}u</div>
                    {p.type === "hourly" && <div style={{ fontSize: "10px", color: "#888" }}>{formatEur(unbilledHours * p.rate)} open</div>}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {entries.length > 0 && (
        <div>
          <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "10px" }}>Laatste uren</div>
          {[...entries].sort((a, b) => b.date?.localeCompare(a.date)).slice(0, 5).map(e => {
            const p = projects.find(x => x.id === e.projectId);
            return (
              <div key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1a1a1a", gap: "10px" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: "13px", fontWeight: "600" }}>{p?.name || "?"}</span>
                  {e.description && !isMobile && <span style={{ fontSize: "11px", color: "#999", marginLeft: "10px" }}>{e.description}</span>}
                  {e.description && isMobile && <div style={{ fontSize: "11px", color: "#888", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
                  {!isMobile && <span style={{ fontSize: "11px", color: "#999" }}>{formatDate(e.date)}</span>}
                  <span style={{ fontWeight: "700", color: "#C8FF00" }}>{e.hours}u</span>
                  {e.invoiceId && !draftInvoiceIds.has(e.invoiceId) && <Badge color="#55ff99">gefact.</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── ClientInput — autocomplete from existing clients ─────────────────────────
function ClientInput({ label, value, onChange, projects }) {
  const [focused, setFocused] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Unique clients, case-insensitive deduped, sorted
  const allClients = [...new Set(projects.map(p => p.client).filter(Boolean))].sort();
  const suggestions = allClients.filter(c =>
    c.toLowerCase().includes((value || "").toLowerCase()) && c.toLowerCase() !== (value || "").toLowerCase()
  );

  return (
    <div style={{ position: "relative" }}>
      {label && <span style={S.label}>{label}</span>}
      <input
        style={{ ...S.input(focused), borderColor: focused ? "#C8FF00" : "#3a3a3a" }}
        value={value}
        onChange={e => { onChange(e.target.value); setShowSuggestions(true); }}
        onFocus={() => { setFocused(true); setShowSuggestions(true); }}
        onBlur={() => { setFocused(false); setTimeout(() => setShowSuggestions(false), 150); }}
        placeholder="Klantnaam"
        autoComplete="off"
      />
      {showSuggestions && suggestions.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 99, backgroundColor: "#1a1a1a", border: "1px solid #C8FF00", borderTop: "none", maxHeight: "160px", overflowY: "auto" }}>
          {suggestions.map(c => (
            <div key={c} onMouseDown={() => { onChange(c); setShowSuggestions(false); }}
              style={{ padding: "10px 12px", fontSize: "13px", cursor: "pointer", borderBottom: "1px solid #222" }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = "#C8FF0018"}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = "transparent"}>
              {c}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Projects ─────────────────────────────────────────────────────────────────
function Projects({ projects, entries, saveProjects, isMobile }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ name: "", client: "", type: "hourly", rate: "", budget: "", status: "active", notes: "" });
  const [error, setError] = useState("");

  const openNew = () => { setForm({ name: "", client: "", type: "hourly", rate: "", budget: "", status: "active", notes: "" }); setError(""); setModal("new"); };
  const openEdit = p => { setForm({ ...p, rate: String(p.rate || ""), budget: String(p.budget || "") }); setError(""); setModal("edit"); };

  const handleSave = () => {
    if (!form.name.trim()) { setError("Vul een projectnaam in"); return; }
    if (!form.client.trim()) { setError("Vul een klantnaam in"); return; }
    const data = { ...form, name: form.name.trim(), client: form.client.trim(), rate: parseFloat(form.rate) || 0, budget: parseFloat(form.budget) || 0 };
    if (modal === "new") {
      saveProjects([...projects, { ...data, id: uid(), createdAt: today() }]);
    } else {
      saveProjects(projects.map(p => p.id === form.id ? data : p));
    }
    setModal(null);
  };

  const [confirmDel, setConfirmDel] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const del = id => { setConfirmDel(id); };
  const confirmDelete = id => { saveProjects(projects.filter(p => p.id !== id)); setConfirmDel(null); };

  // Sort: active first, then by last logged entry date desc
  const lastLogged = (pid) => {
    const dates = entries.filter(e => e.projectId === pid).map(e => e.date || "").filter(Boolean);
    return dates.length ? dates.sort().reverse()[0] : "0";
  };
  const sorted = [...projects].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return lastLogged(b.id).localeCompare(lastLogged(a.id));
  });
  const filtered = statusFilter === "all" ? sorted : sorted.filter(p => p.status === statusFilter);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {[["active", "Actief"], ["inactive", "Inactief"], ["all", "Alles"]].map(([val, label]) => (
            <button key={val} onClick={() => setStatusFilter(val)}
              style={{ fontSize: "11px", fontFamily: "inherit", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 12px", background: "none", border: `1px solid ${statusFilter === val ? "#C8FF00" : "#333"}`, color: statusFilter === val ? "#C8FF00" : "#888", cursor: "pointer" }}>
              {label}
            </button>
          ))}
        </div>
        <Btn onClick={openNew}><Icon d={ICONS.plus} size={14} /> Nieuw project</Btn>
      </div>

      {filtered.length === 0 && <Card><div style={{ color: "#aaa", fontSize: "13px", textAlign: "center", padding: "32px 0" }}>{projects.length === 0 ? "Nog geen projecten." : "Geen projecten in deze filter."}</div></Card>}

      {filtered.map(p => {
        const totalHours = entries.filter(e => e.projectId === p.id).reduce((s, e) => s + (e.hours || 0), 0);
        return (
          <Card key={p.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: "700", fontSize: "14px" }}>{p.name}</span>
                  <Badge color={p.status === "active" ? "#C8FF00" : "#999"}>{p.status === "active" ? "Actief" : "Inactief"}</Badge>
                </div>
                <div style={{ fontSize: "11px", color: "#999", marginTop: "4px" }}>{p.client} · {typeLabel(p.type)}</div>
                {p.notes && <div style={{ fontSize: "11px", color: "#666", marginTop: "4px", fontStyle: "italic" }}>{p.notes}</div>}
                <div style={{ display: "flex", gap: "14px", marginTop: "8px", fontSize: "11px", color: "#666", flexWrap: "wrap" }}>
                  <span>{totalHours.toFixed(1)}u gelogd</span>
                  {p.type === "hourly" && p.rate > 0 && <span>{formatEur(p.rate)}/uur</span>}
                  {p.type === "fixed" && p.budget > 0 && <span>Budget: {formatEur(p.budget)}</span>}
                  {p.type === "retainer" && p.rate > 0 && <span>{formatEur(p.rate)} {periodLabel(p.period)}</span>}
                </div>
              </div>
              <div style={{ display: "flex", gap: "6px", flexShrink: 0, alignItems: "center" }}>
                {confirmDel === p.id ? (
                  <>
                    <span style={{ fontSize: "11px", color: "#ff5555" }}>Verwijderen?</span>
                    <Btn small variant="danger" onClick={() => confirmDelete(p.id)}>Ja</Btn>
                    <Btn small variant="ghost" onClick={() => setConfirmDel(null)}>Nee</Btn>
                  </>
                ) : (
                  <>
                    <Btn small variant="ghost" onClick={() => openEdit(p)}><Icon d={ICONS.edit} size={12} /></Btn>
                    <Btn small variant="danger" onClick={() => del(p.id)}><Icon d={ICONS.trash} size={12} /></Btn>
                  </>
                )}
              </div>
            </div>
          </Card>
        );
      })}

      {modal && (
        <Modal title={modal === "new" ? "Nieuw project" : "Project bewerken"} onClose={() => setModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <FInput label="Projectnaam *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Projectnaam" />
            <ClientInput label="Klant *" value={form.client} onChange={v => setForm(f => ({ ...f, client: v }))} projects={projects} />
            <FSelect label="Facturatie type" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="hourly">Per uur</option>
              <option value="fixed">Vaste prijs</option>
              <option value="retainer">Retainer (per periode)</option>
            </FSelect>
            {form.type === "hourly" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <FInput label="Uurtarief (€)" type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="125" />
                <FInput label="Urenbudget (optioneel)" type="number" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="40" />
              </div>
            )}
            {form.type === "retainer" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <FInput label="Bedrag (€)" type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="2000" />
                <FSelect label="Periode" value={form.period || "month"} onChange={e => setForm(f => ({ ...f, period: e.target.value }))}>
                  <option value="week">Per week</option>
                  <option value="4weeks">Per 4 weken</option>
                  <option value="month">Per maand</option>
                  <option value="quarter">Per kwartaal</option>
                </FSelect>
              </div>
            )}
            {form.type === "fixed" && <FInput label="Vaste prijs (€)" type="number" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="5000" />}
            <FSelect label="Status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
              <option value="active">Actief</option>
              <option value="inactive">Inactief</option>
            </FSelect>
            <FInput label="Notities (optioneel)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Extra info..." />
            {error && <div style={{ color: "#ff5555", fontSize: "12px", backgroundColor: "#ff555515", border: "1px solid #ff5555", padding: "8px 12px" }}>{error}</div>}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", paddingTop: "8px" }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Annuleren</Btn>
              <Btn onClick={handleSave}>Opslaan</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Uren ─────────────────────────────────────────────────────────────────────
function Uren({ entries, projects, invoices, saveEntries, isMobile }) {
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ projectId: "", date: today(), hours: "", description: "", notBillable: false });
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const handleSave = () => {
    if (!form.projectId) { setError("Selecteer een project"); return; }
    if (!form.hours || parseFloat(form.hours) <= 0) { setError("Vul een geldig aantal uren in"); return; }
    saveEntries([...entries, { ...form, id: uid(), hours: parseFloat(form.hours), createdAt: new Date().toISOString() }]);
    setForm(f => ({ ...f, hours: "", description: "" }));
    setModal(false);
  };

  const del = id => saveEntries(entries.filter(e => e.id !== id));

  const sorted = [...entries].sort((a, b) => b.date?.localeCompare(a.date));
  const draftInvoiceIds = new Set(invoices.filter(i => i.status === "draft").map(i => i.id));
  const filtered = filter === "open" ? sorted.filter(e => !e.invoiceId && !e.notBillable) : sorted;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
        <div style={{ display: "flex", gap: "6px" }}>
          {["all", "open"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{ fontSize: "11px", fontFamily: "inherit", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.1em", padding: "6px 12px", background: "none", border: `1px solid ${filter === f ? "#C8FF00" : "#333"}`, color: filter === f ? "#C8FF00" : "#999", cursor: "pointer" }}>
              {f === "all" ? "Alle" : "Open"}
            </button>
          ))}
        </div>
        {projects.length > 0 && <Btn onClick={() => { setError(""); setModal(true); }}><Icon d={ICONS.plus} size={14} /> Loggen</Btn>}
      </div>

      {projects.length === 0 && <Card><div style={{ color: "#aaa", fontSize: "13px", textAlign: "center", padding: "32px 0" }}>Maak eerst een project aan.</div></Card>}
      {entries.length === 0 && projects.length > 0 && <Card><div style={{ color: "#aaa", fontSize: "13px", textAlign: "center", padding: "32px 0" }}>Nog geen uren gelogd.</div></Card>}

      {/* Mobile: card list. Desktop: table */}
      {filtered.length > 0 && (
        isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {filtered.map(e => {
              const p = projects.find(x => x.id === e.projectId);
              const inv = e.invoiceId ? invoices.find(i => i.id === e.invoiceId) : null;
              const isBilled = inv && !draftInvoiceIds.has(inv.id);
              return (
                <Card key={e.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: "700", fontSize: "13px" }}>{p?.name || "?"}</div>
                    {e.description && <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{e.description}</div>}
                    <div style={{ fontSize: "10px", color: "#888", marginTop: "4px" }}>{formatDate(e.date)}</div>
                    <div style={{ display: "flex", gap: "6px", marginTop: "6px", flexWrap: "wrap" }}>
                      {e.notBillable && <Badge color="#999">intern</Badge>}
                      {isBilled && <Badge color="#55ff99">#{inv.number}</Badge>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px", flexShrink: 0 }}>
                    <span style={{ fontWeight: "900", color: "#C8FF00", fontSize: "16px" }}>{e.hours}u</span>
                    {!e.invoiceId && (
                      <button onClick={() => del(e.id)} style={{ background: "none", border: "none", color: "#ff5555", cursor: "pointer", padding: "2px" }}>
                        <Icon d={ICONS.trash} size={14} />
                      </button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div style={{ border: "1px solid #222" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto auto auto", gap: "12px", padding: "8px 16px", borderBottom: "1px solid #222", fontSize: "10px", color: "#aaa", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              <span>Project</span><span>Omschrijving</span><span>Datum</span><span style={{ textAlign: "right" }}>Uren</span><span></span>
            </div>
            {filtered.map(e => {
              const p = projects.find(x => x.id === e.projectId);
              const inv = e.invoiceId ? invoices.find(i => i.id === e.invoiceId) : null;
              const isBilled = inv && !draftInvoiceIds.has(inv?.id);
              return (
                <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr 2fr auto auto auto", gap: "12px", alignItems: "center", padding: "12px 16px", borderBottom: "1px solid #1a1a1a" }}>
                  <div>
                    <div style={{ fontWeight: "700", fontSize: "13px" }}>{p?.name || "?"}</div>
                    <div style={{ fontSize: "11px", color: "#999" }}>{p?.client}</div>
                  </div>
                  <div style={{ fontSize: "13px", color: "#888" }}>{e.description || <span style={{ color: "#333", fontStyle: "italic" }}>—</span>}</div>
                  <div style={{ fontSize: "11px", color: "#999", whiteSpace: "nowrap" }}>{formatDate(e.date)}</div>
                  <div style={{ textAlign: "right", fontWeight: "700", color: "#C8FF00" }}>{e.hours}u</div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    {e.notBillable && <Badge color="#999">intern</Badge>}
                    {isBilled && <Badge color="#55ff99">#{inv.number}</Badge>}
                    {!e.invoiceId && (
                      <button onClick={() => del(e.id)} style={{ background: "none", border: "none", color: "#ff5555", cursor: "pointer", padding: "2px", opacity: 0.6 }}>
                        <Icon d={ICONS.trash} size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {modal && <QuickLogModal projects={projects} entries={entries} saveEntries={saveEntries} onClose={() => setModal(false)} />}
    </div>
  );
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
function Invoices({ invoices, entries, projects, saveInvoices, saveEntries, isMobile }) {
  const [modal, setModal] = useState(null);
  const [selectedEntries, setSelectedEntries] = useState([]);
  const [selectedProjects, setSelectedProjects] = useState([]);
  const [form, setForm] = useState({ client: "", date: today(), dueDate: addDays(today(), 30), notes: "" });

  const billable = entries.filter(e => !e.invoiceId && !e.notBillable);

  const projectsWithBillable = projects.filter(p =>
    p.status === "active" && (
      p.type === "fixed" || p.type === "retainer" || billable.some(e => e.projectId === p.id)
    )
  );

  // Group by client — normalize to the first-seen casing
  const clientsMap = {};
  const clientKeyMap = {}; // lowercase -> display name
  projectsWithBillable.forEach(p => {
    const key = p.client.toLowerCase();
    if (!clientKeyMap[key]) clientKeyMap[key] = p.client;
    const displayName = clientKeyMap[key];
    if (!clientsMap[displayName]) clientsMap[displayName] = [];
    clientsMap[displayName].push(p);
  });
  const clients = Object.keys(clientsMap);

  const openCreate = () => {
    const firstClient = clients[0] || "";
    const firstClientProjects = clientsMap[firstClient] || [];
    setForm({ client: firstClient, date: today(), dueDate: addDays(today(), 30), notes: "" });
    setSelectedProjects(firstClientProjects.map(p => p.id));
    setSelectedEntries(billable.filter(e => firstClientProjects.some(p => p.id === e.projectId)).map(e => e.id));
    setModal("create");
  };

  const handleClientChange = (client) => {
    const clientProjects = clientsMap[client] || [];
    setForm(f => ({ ...f, client }));
    setSelectedProjects(clientProjects.map(p => p.id));
    setSelectedEntries(billable.filter(e => clientProjects.some(p => p.id === e.projectId)).map(e => e.id));
  };

  const toggleProject = (pid) => {
    const p = projects.find(x => x.id === pid);
    const isSelected = selectedProjects.includes(pid);
    if (isSelected) {
      setSelectedProjects(s => s.filter(id => id !== pid));
      if (p?.type === "hourly") setSelectedEntries(s => s.filter(id => entries.find(e => e.id === id)?.projectId !== pid));
    } else {
      setSelectedProjects(s => [...s, pid]);
      if (p?.type === "hourly") {
        const toAdd = billable.filter(e => e.projectId === pid).map(e => e.id);
        setSelectedEntries(s => [...new Set([...s, ...toAdd])]);
      }
    }
  };

  const toggleEntry = (id) => setSelectedEntries(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const calcTotal = () => {
    let total = 0;
    selectedProjects.forEach(pid => {
      const p = projects.find(x => x.id === pid);
      if (!p) return;
      if (p.type === "hourly") {
        const projectEntries = selectedEntries.filter(id => entries.find(e => e.id === id)?.projectId === pid);
        total += projectEntries.reduce((sum, id) => { const e = entries.find(x => x.id === id); return sum + (e?.hours || 0) * p.rate; }, 0);
      } else if (p.type === "fixed") total += p.budget || 0;
      else if (p.type === "retainer") total += p.rate || 0;
    });
    return total;
  };

  const createInvoice = () => {
    if (!form.client || selectedProjects.length === 0) return;
    const invId = uid();
    const projectNames = selectedProjects.map(pid => projects.find(p => p.id === pid)?.name).filter(Boolean).join(", ");
    const toLink = selectedEntries;
    const inv = {
      id: invId,
      number: `INV-${String(invoices.length + 1).padStart(3, "0")}`,
      client: form.client,
      projectName: projectNames,
      projectIds: selectedProjects,
      date: form.date,
      dueDate: form.dueDate,
      notes: form.notes,
      total: calcTotal(),
      entryIds: toLink,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    saveInvoices([...invoices, inv]);
    saveEntries(entries.map(e => toLink.includes(e.id) ? { ...e, invoiceId: invId } : e));
    setModal(null);
  };

  const updateStatus = (id, status) => saveInvoices(invoices.map(i => i.id === id ? { ...i, status, paidAt: status === "paid" ? today() : i.paidAt } : i));
  const [confirmDelInv, setConfirmDelInv] = useState(null);
  const del = id => setConfirmDelInv(id);
  const confirmDeleteInv = id => {
    saveInvoices(invoices.filter(i => i.id !== id));
    saveEntries(entries.map(e => e.invoiceId === id ? { ...e, invoiceId: null } : e));
    setConfirmDelInv(null);
  };

  const statusColor = s => ({ draft: "#999", sent: "#FFAA00", paid: "#55ff99", overdue: "#ff5555" })[s] || "#999";
  const statusLabel = s => ({ draft: "Concept", sent: "Verstuurd", paid: "Betaald", overdue: "Verlopen" })[s] || s;

  const clientProjects = clientsMap[form.client] || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.12em" }}>{invoices.length} facturen</span>
        <Btn onClick={openCreate} disabled={clients.length === 0}><Icon d={ICONS.plus} size={14} /> {isMobile ? "Nieuw" : "Factuur aanmaken"}</Btn>
      </div>

      {clients.length === 0 && invoices.length === 0 && (
        <Card><div style={{ color: "#aaa", fontSize: "13px", textAlign: "center", padding: "32px 0" }}>Geen factureerbare projecten.</div></Card>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {[...invoices].sort((a, b) => b.date?.localeCompare(a.date)).map(inv => (
          <Card key={inv.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "12px", marginBottom: "10px" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: "900", color: "#C8FF00", fontSize: "12px" }}>{inv.number}</span>
                  <Badge color={statusColor(inv.status)}>{statusLabel(inv.status)}</Badge>
                </div>
                <div style={{ fontWeight: "700", fontSize: "14px", marginTop: "4px" }}>{inv.client}</div>
                <div style={{ fontSize: "11px", color: "#999" }}>{inv.projectName} · {formatDate(inv.date)}</div>
                {inv.dueDate && <div style={{ fontSize: "10px", color: "#aaa", marginTop: "2px" }}>Vervaldatum: {formatDate(inv.dueDate)}</div>}
              </div>
              <div style={{ fontWeight: "900", fontSize: isMobile ? "18px" : "20px", color: "#eee", flexShrink: 0 }}>{formatEur(inv.total)}</div>
            </div>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", paddingTop: "10px", borderTop: "1px solid #1a1a1a" }}>
              {inv.status === "draft" && <Btn small variant="ghost" onClick={() => updateStatus(inv.id, "sent")}>Verstuurd</Btn>}
              {inv.status === "sent" && <Btn small variant="ghost" onClick={() => updateStatus(inv.id, "paid")}>Betaling ontvangen</Btn>}
              {inv.status === "sent" && <Btn small variant="ghost" onClick={() => updateStatus(inv.id, "overdue")}>Verlopen</Btn>}
              {inv.status === "paid" && <Btn small variant="ghost" onClick={() => updateStatus(inv.id, "sent")}>↩ Ongedaan</Btn>}
              {inv.status === "overdue" && <Btn small variant="ghost" onClick={() => updateStatus(inv.id, "sent")}>↩ Herstel</Btn>}
              {confirmDelInv === inv.id ? (
                <>
                  <span style={{ fontSize: "11px", color: "#ff5555" }}>Verwijderen?</span>
                  <Btn small variant="danger" onClick={() => confirmDeleteInv(inv.id)}>Ja</Btn>
                  <Btn small variant="ghost" onClick={() => setConfirmDelInv(null)}>Nee</Btn>
                </>
              ) : (
                <Btn small variant="danger" onClick={() => del(inv.id)}><Icon d={ICONS.trash} size={12} /></Btn>
              )}
            </div>
          </Card>
        ))}
      </div>

      {modal === "create" && (
        <Modal title="Factuur aanmaken" onClose={() => setModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

            {/* Client selector */}
            <FSelect label="Klant" value={form.client} onChange={e => handleClientChange(e.target.value)}>
              <option value="">Selecteer klant...</option>
              {clients.map(c => <option key={c} value={c}>{c}</option>)}
            </FSelect>

            {/* Project checkboxes for this client */}
            {form.client && (
              <div>
                <span style={S.label}>Projecten & uren</span>
                <div style={{ border: "1px solid #333" }}>
                  {clientProjects.map(p => {
                    const projSelected = selectedProjects.includes(p.id);
                    const projEntries = billable.filter(e => e.projectId === p.id);
                    return (
                      <div key={p.id}>
                        {/* Project toggle row */}
                        <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", backgroundColor: projSelected ? "#1a1a1a" : "transparent", cursor: "pointer", borderBottom: "1px solid #222" }}>
                          <input type="checkbox" checked={projSelected} onChange={() => toggleProject(p.id)} style={{ accentColor: "#C8FF00", width: "15px", height: "15px", flexShrink: 0 }} />
                          <span style={{ flex: 1, fontWeight: "700", fontSize: "13px" }}>{p.name}</span>
                          <span style={{ fontSize: "11px", color: "#888" }}>{typeLabel(p.type)}</span>
                          {p.type !== "hourly" && (
                            <span style={{ fontWeight: "700", color: "#C8FF00", fontSize: "13px" }}>
                              {formatEur(p.type === "fixed" ? p.budget : p.rate)}
                            </span>
                          )}
                        </label>
                        {/* Entry rows for hourly projects */}
                        {projSelected && p.type === "hourly" && projEntries.map(e => (
                          <label key={e.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px 8px 36px", borderBottom: "1px solid #1a1a1a", cursor: "pointer" }}>
                            <input type="checkbox" checked={selectedEntries.includes(e.id)} onChange={() => toggleEntry(e.id)} style={{ accentColor: "#C8FF00", width: "14px", height: "14px", flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: "12px", color: "#ccc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.description || "—"}</span>
                            <span style={{ fontSize: "11px", color: "#888", flexShrink: 0 }}>{formatDate(e.date)}</span>
                            <span style={{ fontWeight: "700", color: "#C8FF00", fontSize: "12px", flexShrink: 0 }}>{e.hours}u</span>
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Total */}
            <div style={{ backgroundColor: "#1a1a1a", border: "1px solid #333", padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", letterSpacing: "0.1em" }}>Totaal</span>
              <span style={{ fontWeight: "900", fontSize: "20px", color: "#C8FF00" }}>{formatEur(calcTotal())}</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <FInput label="Factuurdatum" type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
              <FInput label="Vervaldatum" type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />
            </div>
            <FInput label="Notities (optioneel)" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="PO nummer, referentie..." />
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <Btn variant="ghost" onClick={() => setModal(null)}>Annuleren</Btn>
              <Btn onClick={createInvoice} disabled={!form.client || selectedProjects.length === 0}>Aanmaken</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function Settings({ settings, saveSettings }) {
  const [capacity, setCapacity] = useState(String(settings.weekCapacity || 40));
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    saveSettings({ weekCapacity: parseFloat(capacity) || 40 });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px", maxWidth: "480px" }}>
      <div style={{ fontSize: "10px", color: "#888", textTransform: "uppercase", letterSpacing: "0.12em" }}>Instellingen</div>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <FInput
              label="Mijn weekcapaciteit (uren)"
              type="number"
              value={capacity}
              onChange={e => setCapacity(e.target.value)}
              placeholder="40"
            />
            <div style={{ fontSize: "11px", color: "#777", marginTop: "6px" }}>
              Hoeveel uur per week ben je beschikbaar voor werk. Wordt gebruikt om je bezetting te berekenen op het dashboard.
            </div>
          </div>
          <Btn onClick={handleSave}>{saved ? "✓ Opgeslagen" : "Opslaan"}</Btn>
        </div>
      </Card>
    </div>
  );
}
