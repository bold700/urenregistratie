/**
 * Firebase loader – initialiseert Firebase, wacht op auth, laadt dan de app
 */
(async function() {
  const config = window.firebaseConfig;
  const useFirebase = config?.apiKey && config.apiKey !== 'VUL_JE_API_KEY_IN';

  if (!useFirebase) {
    console.log('[Firebase] Niet geconfigureerd – gebruik localStorage');
    loadApp();
    return;
  }

  try {
    console.log('[Firebase] Initialiseren...');
    const fb = await import('./firebase-app.js');
    fb.initFirebase(config);
    const auth = fb.getFirebaseAuth();
    if (!auth) { showLoginScreenWithFallback(new Error('Firebase Auth niet beschikbaar')); return; }

    const user = await new Promise((resolve) => {
      const unsub = fb.firebaseOnAuthStateChanged((u) => {
        unsub();
        resolve(u);
      });
    });

    if (!user) {
      console.log('[Firebase] Geen gebruiker – toon inlogscherm');
      showLoginScreen(fb);
      return;
    }

    console.log('[Firebase] Ingelogd als', user.email, '(uid:', user.uid, ')');
    // Direct app-shell tonen zodat gebruiker laadskelet ziet (voorkomt "vastgelopen" gevoel)
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = '';
    const data = await fb.firebaseLoadUserData(user.uid);
    window.__firebaseUser = user;
    window.__firebase = fb;
    window.__initialData = data;
    window.__isNewFirebaseUser = !data || (!data.projects?.length && !data.entries?.length);
    console.log('[Firebase] Data geladen:', data ? `${data.clients?.length || 0} klanten, ${data.projects?.length || 0} projecten` : 'geen data');
    loadApp();
  } catch (e) {
    console.error('[Firebase] Init mislukt:', e);
    showLoginScreenWithFallback(e);
  }

  function loadApp() {
    const s = document.createElement('script');
    s.src = 'app.js?v=8';
    s.onerror = () => document.getElementById('loading').innerHTML = '<p style="color:var(--md-sys-color-error);">Fout bij laden</p>';
    document.body.appendChild(s);
  }

  function showLoginScreenWithFallback(err) {
    const ls = document.getElementById('login-screen');
    const as = document.getElementById('app-shell');
    if (ls) ls.style.display = 'flex';
    if (as) as.style.display = 'none';
    const card = ls?.querySelector('.login-card');
    if (card) {
      const formWrap = card.querySelector('#login-form-wrap');
      if (formWrap) formWrap.style.display = 'none';
      const fallbackMsg = document.createElement('div');
      fallbackMsg.className = 'fallback-msg';
      fallbackMsg.style.cssText = 'margin-top:8px;padding:12px;background:var(--md-sys-color-error-container);color:var(--md-sys-color-on-error-container);border-radius:8px;font-size:13px;';
      fallbackMsg.innerHTML = `<strong>Kon niet verbinden met Firebase.</strong><br><span style="opacity:0.9;">${err?.message || ''}</span><br><br>Je kunt doorgaan zonder synchronisatie (data blijft lokaal).`;
      const fallbackBtn = document.createElement('md-filled-button');
      fallbackBtn.textContent = 'Doorgaan zonder inloggen';
      fallbackBtn.style.marginTop = '12px';
      fallbackBtn.onclick = () => {
        ls.style.display = 'none';
        as.style.display = '';
        loadApp();
      };
      fallbackMsg.appendChild(fallbackBtn);
      if (!card.querySelector('.fallback-msg')) card.appendChild(fallbackMsg);
    }
  }

  function showLoginScreen(fb) {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';
    const emailEl = document.getElementById('login-email');
    const passEl = document.getElementById('login-password');
    const errEl = document.getElementById('login-error');

    const doLogin = async (isSignUp) => {
      const email = emailEl.value?.trim();
      const pass = passEl.value || '';
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

    const formWrap = document.getElementById('login-form-wrap');
    const scrollButtonsIntoView = () => {
      const btnWrap = formWrap?.querySelector('div:last-of-type');
      if (btnWrap) setTimeout(() => btnWrap.scrollIntoView({ block: 'end', behavior: 'smooth' }), 300);
    };
    formWrap?.addEventListener('focusin', (e) => {
      if (e.target.closest('md-outlined-text-field')) scrollButtonsIntoView();
    }, true);
    formWrap?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doLogin(false);
      }
    });
  }
})();
