/**
 * Firebase – Auth + Firestore voor ecosysteem (uren, projecten, planning)
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

let app = null;
let auth = null;
let db = null;

export function initFirebase(config) {
  if (!config?.apiKey || config.apiKey === 'VUL_JE_API_KEY_IN') return null;
  try {
    app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    return { app, auth, db };
  } catch (e) {
    console.warn('Firebase init failed:', e);
    return null;
  }
}

export function getFirebaseAuth() {
  return auth;
}

export function getFirebaseDb() {
  return db;
}

export async function firebaseSignIn(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function firebaseSignUp(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function firebaseSignOut() {
  return signOut(auth);
}

export function firebaseOnAuthStateChanged(callback) {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, callback);
}

export async function firebaseLoadUserData(userId) {
  if (!db) return null;
  try {
    const ref = doc(db, 'users', userId);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error('[Firebase] Firestore load mislukt:', e?.code || e?.message || e);
    return null;
  }
}

export async function firebaseSaveUserData(userId, data) {
  if (!db) return;
  try {
    const ref = doc(db, 'users', userId);
    await setDoc(ref, data, { merge: true });
  } catch (e) {
    console.warn('Firebase save failed:', e);
    throw e;
  }
}
