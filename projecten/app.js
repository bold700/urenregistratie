/**
 * Projecten & To-do – overzicht van projecten en taken
 * Gebruikt shared/core. Sync via Firebase.
 */
import {
  STORAGE_KEYS,
  DEFAULT_LABELS,
  formatDate,
  today,
  uid,
  storageLoad,
  storageSave,
  escapeHtml,
  emptyState,
  getEffectiveDarkMode,
  applyDarkMode,
  createProjectenInitialState,
  SNACKBAR_DURATION_MS,
} from '../shared/core.js';

let state = createProjectenInitialState();
let snackbarTimeout = null;

function showSnackbar(message) {
  const el = document.getElementById('snackbar');
  const msgEl = el?.querySelector('.snackbar-message');
  if (!el || !msgEl) return;
  if (snackbarTimeout) clearTimeout(snackbarTimeout);
  msgEl.textContent = message;
  el.classList.add('visible');
  snackbarTimeout = setTimeout(() => {
    el.classList.remove('visible');
    snackbarTimeout = null;
  }, SNACKBAR_DURATION_MS);
}

function stripUndefined(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripUndefined).filter((v) => v !== undefined);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    const cleaned = stripUndefined(v);
    if (cleaned !== undefined) out[k] = cleaned;
  }
  return out;
}

function loadState() {
  const initial = window.__initialData;
  const hasFirebaseUser = !!window.__firebaseUser;
  if (initial) {
    state.projects = initial.projects || [];
    state.clients = initial.clients || [];
    state.todos = initial.todos || [];
    return;
  }
  if (hasFirebaseUser) return;
  state.projects = storageLoad(STORAGE_KEYS.projects) || [];
  state.clients = storageLoad(STORAGE_KEYS.clients) || [];
  state.todos = storageLoad(STORAGE_KEYS.todos) || [];
}

function saveState() {
  const user = window.__firebaseUser;
  if (!user) {
    storageSave(STORAGE_KEYS.projects, state.projects);
    storageSave(STORAGE_KEYS.clients, state.clients);
    storageSave(STORAGE_KEYS.todos, state.todos);
    return;
  }
  const fb = window.__firebase;
  if (fb?.firebaseSaveUserData) {
    const data = stripUndefined({
      projects: state.projects,
      clients: state.clients,
      todos: state.todos,
    });
    fb.firebaseSaveUserData(user.uid, data).catch((e) => {
      console.error('[Firebase] Opslaan mislukt:', e?.message || e);
      showSnackbar('Synchronisatie mislukt – probeer opnieuw');
    });
  }
}

function render() {
  const el = document.getElementById('panel-main');
  const loading = document.getElementById('loading');
  if (!el) return;

  loading.classList.remove('active');
  loading.style.display = 'none';
  el.style.display = 'block';
  el.classList.add('active');

  const { projects, todos, projectFilter, todoFilter } = state;
  const filteredProjects = projectFilter === 'all'
    ? projects
    : projects.filter((p) => p.id === projectFilter);
  const projectOptions = [
    { id: 'all', name: 'Alle projecten' },
    ...projects.map((p) => ({ id: p.id, name: p.name, client: p.client })),
  ];

  const getTodosForProject = (pid) => {
    let list = todos.filter((t) => t.projectId === pid);
    if (todoFilter === 'open') list = list.filter((t) => !t.done);
    else if (todoFilter === 'done') list = list.filter((t) => t.done);
    return list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  };

  el.innerHTML = `
    <div class="filter-row" style="justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      <div class="filter-row">
        <select id="project-filter" class="native-select" style="max-width:200px;">
          ${projectOptions.map((o) => `<option value="${escapeHtml(o.id)}" ${projectFilter === o.id ? 'selected' : ''}>${escapeHtml(o.name)}${o.client ? ' · ' + escapeHtml(o.client) : ''}</option>`).join('')}
        </select>
        ${[['open', 'Open'], ['done', 'Afgerond'], ['all', 'Alles']].map(([val, label]) => `
          <button type="button" class="filter-chip-btn ${todoFilter === val ? 'active' : ''}" data-todo-filter="${val}">${label}</button>
        `).join('')}
      </div>
    </div>

    ${projects.length === 0 ? emptyState({
      icon: 'folder_open',
      title: 'Nog geen projecten',
      subtitle: 'Projecten worden beheerd in de Uren & Facturatie app. Voeg daar eerst een project toe.',
      cta: { nav: '/', text: 'Ga naar Uren & Facturatie' }
    }) : `
    <div class="card-list">
      ${filteredProjects.map((p) => {
        const projectTodos = getTodosForProject(p.id);
        return `
          <div class="card" data-project-id="${p.id}">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
              <div>
                <span style="font-weight:700;font-size:15px;">${escapeHtml(p.name)}</span>
                ${p.client ? `<span style="font-size:12px;color:var(--md-sys-color-on-surface-variant);margin-left:8px;">${escapeHtml(p.client)}</span>` : ''}
              </div>
              <md-icon-button data-action="add-todo" data-project-id="${p.id}" aria-label="Taak toevoegen">
                <md-icon>add</md-icon>
              </md-icon-button>
            </div>
            ${projectTodos.length === 0 ? `
              <p style="font-size:13px;color:var(--md-sys-color-on-surface-variant);margin:0;">Geen taken</p>
              <md-text-button data-action="add-todo" data-project-id="${p.id}" style="align-self:flex-start;margin-top:8px;">+ Taak toevoegen</md-text-button>
            ` : `
              <ul style="list-style:none;padding:0;margin:0;">
                ${projectTodos.map((t) => `
                  <li class="list-item" style="margin-bottom:8px;padding:10px 12px;border-radius:8px;background:var(--md-sys-color-surface-container-high);">
                    <div style="display:flex;align-items:center;gap:10px;">
                      <md-checkbox data-action="toggle-todo" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="Afgerond"></md-checkbox>
                      <span style="flex:1;${t.done ? 'text-decoration:line-through;opacity:0.7;' : ''}">${escapeHtml(t.title)}</span>
                      ${t.dueDate ? `<span style="font-size:11px;color:var(--md-sys-color-on-surface-variant);">${formatDate(t.dueDate)}</span>` : ''}
                      <md-icon-button data-action="delete-todo" data-id="${t.id}" aria-label="Verwijderen">
                        <md-icon>delete</md-icon>
                      </md-icon-button>
                    </div>
                  </li>
                `).join('')}
              </ul>
            `}
          </div>
        `;
      }).join('')}
    </div>
    `}
  `;

  el.querySelector('#project-filter')?.addEventListener('change', (e) => {
    state.projectFilter = e.target.value;
    render();
  });
  el.querySelectorAll('[data-todo-filter]').forEach((b) => {
    b.addEventListener('click', () => {
      state.todoFilter = b.dataset.todoFilter;
      render();
    });
  });
  el.querySelectorAll('[data-action="add-todo"]').forEach((b) => {
    b.addEventListener('click', () => openTodoDialog(b.dataset.projectId));
  });
  el.querySelectorAll('[data-action="toggle-todo"]').forEach((cb) => {
    cb.addEventListener('change', () => toggleTodo(cb.dataset.id));
  });
  el.querySelectorAll('[data-action="delete-todo"]').forEach((b) => {
    b.addEventListener('click', () => confirmDeleteTodo(b.dataset.id));
  });
  el.querySelectorAll('[data-nav]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = a.dataset.nav || a.getAttribute('href') || '/';
    });
  });
}

function openTodoDialog(projectId, editId = null) {
  const todo = editId ? state.todos.find((t) => t.id === editId) : null;
  const dialog = document.getElementById('todo-dialog');
  const titleEl = document.getElementById('todo-dialog-title');
  const content = document.getElementById('todo-dialog-content');
  titleEl.textContent = todo ? 'Taak bewerken' : 'Nieuwe taak';
  const selectedProjectId = projectId || todo?.projectId || state.projects[0]?.id || '';
  content.innerHTML = `
    <div class="form-field">
      <md-outlined-select id="todo-project" label="Project" value="${escapeHtml(selectedProjectId)}" menu-positioning="popover" style="width:100%;">
        ${state.projects.map((p) => `<md-select-option value="${p.id}"><div slot="headline">${escapeHtml(p.name)}</div><div slot="supporting-text">${escapeHtml(p.client || '')}</div></md-select-option>`).join('')}
      </md-outlined-select>
    </div>
    <div class="form-field">
      <md-outlined-text-field id="todo-title" label="Taak" value="${todo ? escapeHtml(todo.title) : ''}" style="width:100%;"></md-outlined-text-field>
    </div>
    <div class="form-field">
      <md-outlined-text-field id="todo-due" label="Deadline (optioneel)" type="date" value="${todo?.dueDate || ''}" style="width:100%;"></md-outlined-text-field>
    </div>
  `;
  dialog.show();
  dialog.dataset.editId = editId || '';
  dialog.dataset.projectId = selectedProjectId;
  setTimeout(() => content.querySelector('#todo-title')?.focus(), 50);
}

function saveTodo() {
  const dialog = document.getElementById('todo-dialog');
  const content = document.getElementById('todo-dialog-content');
  const titleInput = content?.querySelector('#todo-title');
  const projectSelect = content?.querySelector('#todo-project');
  const dueInput = content?.querySelector('#todo-due');
  const title = (titleInput?.value ?? titleInput?.querySelector?.('input')?.value ?? '').trim();
  if (!title) {
    showSnackbar('Vul een taak in');
    return;
  }
  const projectId = projectSelect?.value || dialog.dataset.projectId || state.projects[0]?.id;
  const dueDate = dueInput?.value?.trim() || null;
  const editId = dialog.dataset.editId;

  if (editId) {
    const idx = state.todos.findIndex((t) => t.id === editId);
    if (idx >= 0) {
      state.todos[idx] = { ...state.todos[idx], title, projectId, dueDate };
    }
  } else {
    state.todos.push({
      id: uid(),
      projectId,
      title,
      dueDate,
      done: false,
      createdAt: new Date().toISOString(),
    });
  }
  saveState();
  dialog.close();
  render();
  showSnackbar(editId ? 'Taak bijgewerkt' : 'Taak toegevoegd');
}

function toggleTodo(id) {
  const t = state.todos.find((x) => x.id === id);
  if (!t) return;
  t.done = !t.done;
  saveState();
  render();
  showSnackbar(t.done ? 'Afgerond' : 'Heropend');
}

let pendingDeleteId = null;

function confirmDeleteTodo(id) {
  pendingDeleteId = id;
  const todo = state.todos.find((t) => t.id === id);
  document.getElementById('confirm-delete-message').textContent =
    `Weet je zeker dat je "${escapeHtml(todo?.title || 'deze taak')}" wilt verwijderen?`;
  document.getElementById('confirm-delete-dialog').show();
}

function executeDelete() {
  if (!pendingDeleteId) return;
  state.todos = state.todos.filter((t) => t.id !== pendingDeleteId);
  saveState();
  pendingDeleteId = null;
  render();
  showSnackbar('Taak verwijderd');
}

function init() {
  loadState();
  applyDarkMode(getEffectiveDarkMode(storageLoad(STORAGE_KEYS.settings)));
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const s = storageLoad(STORAGE_KEYS.settings);
    if (!s || typeof s.darkMode !== 'boolean') applyDarkMode(getEffectiveDarkMode(s));
  });

  document.getElementById('hamburger-btn')?.addEventListener('click', () => {
    state.menuOpen = !state.menuOpen;
    document.getElementById('menu-dropdown').classList.toggle('open', state.menuOpen);
    document.getElementById('menu-overlay').classList.toggle('visible', state.menuOpen);
  });
  document.getElementById('menu-overlay')?.addEventListener('click', () => {
    state.menuOpen = false;
    document.getElementById('menu-dropdown').classList.remove('open');
    document.getElementById('menu-overlay').classList.remove('visible');
  });

  document.getElementById('fab-main')?.addEventListener('click', (e) => {
    e.stopPropagation();
    const wrap = document.getElementById('fab-menu-wrap');
    const icon = document.getElementById('fab-main-icon');
    const isExpanded = wrap?.classList.toggle('expanded');
    if (icon) icon.textContent = isExpanded ? 'close' : 'add';
  });
  document.querySelectorAll('.fab-menu-item').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.dataset.action === 'new-todo') {
        document.getElementById('fab-menu-wrap')?.classList.remove('expanded');
        document.getElementById('fab-main-icon').textContent = 'add';
        openTodoDialog(state.projectFilter !== 'all' ? state.projectFilter : state.projects[0]?.id);
      }
    });
  });
  document.addEventListener('click', () => {
    const wrap = document.getElementById('fab-menu-wrap');
    if (wrap?.classList.contains('expanded')) {
      wrap.classList.remove('expanded');
      document.getElementById('fab-main-icon').textContent = 'add';
    }
  });

  document.getElementById('btn-todo-save')?.addEventListener('click', saveTodo);
  document.getElementById('btn-todo-close')?.addEventListener('click', () => document.getElementById('todo-dialog').close());
  document.getElementById('btn-confirm-delete-yes')?.addEventListener('click', () => {
    executeDelete();
    document.getElementById('confirm-delete-dialog').close();
  });
  document.getElementById('btn-confirm-delete-no')?.addEventListener('click', () => {
    pendingDeleteId = null;
    document.getElementById('confirm-delete-dialog').close();
  });

  const fabWrap = document.getElementById('fab-menu-wrap');
  if (fabWrap) fabWrap.style.display = state.projects.length > 0 ? 'flex' : 'none';

  const menuAccount = document.getElementById('menu-account');
  if (menuAccount) {
    const hasFirebase = window.firebaseConfig?.apiKey && window.firebaseConfig.apiKey !== 'VUL_JE_API_KEY_IN';
    menuAccount.textContent = window.__firebaseUser ? 'Uitloggen' : (hasFirebase ? 'Inloggen' : '');
    menuAccount.style.display = hasFirebase || window.__firebaseUser ? '' : 'none';
    menuAccount.addEventListener('click', async () => {
      document.getElementById('menu-dropdown').classList.remove('open');
      state.menuOpen = false;
      if (window.__firebaseUser) {
        const fb = window.__firebase;
        if (fb?.firebaseSignOut) {
          await fb.firebaseSignOut();
          location.reload();
        }
      } else {
        window.location.href = '/';
      }
    });
  }

  render();
}

init();
