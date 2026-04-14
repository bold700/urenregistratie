/**
 * Schrijft firebase-config.js vanuit environment variables.
 * Lokaal: waarden in .env (zie .env.example).
 * Vercel: Environment Variables in het projectdashboard.
 * Geen client-bundler: daarom process.env hier i.p.v. import.meta.env.
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outFile = join(root, 'firebase-config.js');

function val(name, fallback = '') {
  const v = process.env[name];
  return v != null && String(v).trim() !== '' ? String(v).trim() : fallback;
}

const config = {
  apiKey: val('FIREBASE_API_KEY'),
  authDomain: val('FIREBASE_AUTH_DOMAIN'),
  projectId: val('FIREBASE_PROJECT_ID'),
  storageBucket: val('FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: val('FIREBASE_MESSAGING_SENDER_ID'),
  appId: val('FIREBASE_APP_ID'),
  measurementId: val('FIREBASE_MEASUREMENT_ID'),
};

const banner = `/**
 * Automatisch gegenereerd – niet handmatig bewerken.
 * Bron: .env (lokaal) of Vercel Environment Variables.
 * Genereren: npm run env:generate  of  npm run build
 */
`;

const body = `${banner}window.firebaseConfig = ${JSON.stringify(config, null, 2)};
`;

writeFileSync(outFile, body, 'utf8');
console.log('firebase-config.js geschreven vanuit environment variables.');
