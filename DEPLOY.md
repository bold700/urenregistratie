# Urenregistratie – Deploy instructies

## 1. Firebase configureren

1. Ga naar [Firebase Console](https://console.firebase.google.com)
2. Maak een project aan (of gebruik bestaand)
3. **Authentication** → Sign-in method → Schakel **E-mail/wachtwoord** in
4. **Firestore Database** → Create database → Start in test mode (of production met rules)
5. **Project settings** (tandwiel) → Your apps → Add app (Web) → Kopieer de config
6. Kopieer `firebase-config.example.js` naar `firebase-config.js` en plak je config
7. **Firestore** → Rules → Plak de inhoud van `firestore.rules`

### API key beveiligen (belangrijk)

Ga naar [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials:
1. Klik op je API key
2. Bij **Application restrictions** kies **HTTP referrers**
3. Voeg toe: `https://*.vercel.app/*`, `http://localhost:*`, `https://jouwdomein.nl/*`
4. Sla op – de key werkt nu alleen vanaf deze domeinen

## 2. Vercel deployen

### Optie A: Via Vercel website
1. Ga naar [vercel.com](https://vercel.com) en log in
2. **Add New** → **Project**
3. Importeer je Git repository (of upload de map `urenregistratie`)
4. **Root Directory**: `urenregistratie` (als het in een submap staat)
5. **Deploy**

### Optie B: Via CLI
```bash
cd urenregistratie
npx vercel
```
Volg de instructies. Bij eerste deploy: link aan je Vercel account.

## 3. Firebase domein toevoegen

Na deploy heb je een URL zoals `urenregistratie.vercel.app`. Voeg deze toe in Firebase:
- **Authentication** → Settings → Authorized domains → Add domain → `urenregistratie.vercel.app`

## 4. Klaar

Open je Vercel URL. Je ziet het inlogscherm. Maak een account aan en je data wordt gesynchroniseerd tussen telefoon en computer.
