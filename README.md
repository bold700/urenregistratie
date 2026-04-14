# Urenregistratie

Eenvoudige project- en urenadministratie voor jezelf: bijhouden waar je uren naartoe gaan, wat je moet factureren en wat al gefactureerd is.

## Werking

1. **Projecten** – Voeg projecten (of klanten) toe met een uurtarief. Je kunt meerdere projecten hebben.
2. **Uren loggen** – Per project log je uren met datum, aantal uren en korte omschrijving. Deze uren staan eerst als **open** (nog te factureren).
3. **Dashboard** – Toont in één oogopslag:
   - **Te factureren (open)** – Bedrag en aantal uren dat nog niet op een factuur staat.
   - **Al gefactureerd** – Wat je al op facturen hebt gezet.
   - **Totaal uren** – Alle gelogde uren.
   - Per project: open vs. gefactureerde uren en bedragen.
4. **Facturen** – Je maakt een nieuwe factuur aan door open uren te selecteren (per project). Die uren worden dan aan de factuur gekoppeld en tellen niet meer als “open”. Je kunt de status van een factuur zetten op: Concept, Verzonden, Betaald.

## Starten

Data wordt lokaal in je browser opgeslagen (localStorage). Geen server of database nodig.

### Firebase-config (sync)

1. `cp .env.example .env` en vul je Firebase-waarden in (of gebruik bestaande `.env`).
2. `npm install` en daarna `npm run env:generate` – dit schrijft `firebase-config.js` vanuit environment variables (geen secrets in git).

Zonder Node: kopieer `firebase-config.example.js` naar `firebase-config.js` en vul handmatig in (alleen voor lokaal testen).

**Optie 1 – Lokaal openen (kan beperkt werken door CORS/imports):**  
Open `index.html` in je browser (na bovenstaande config-stap).

**Optie 2 – Met een simpele server (aanbevolen):**

```bash
cd urenregistratie
npm install && npm run env:generate
python3 -m http.server 8765
```

Ga daarna in je browser naar: **http://localhost:8765/**

## Bestanden

- `index.html` – Pagina met tabs (Dashboard, Projecten, Uren, Facturen).
- `app.js` – Logica en UI (uren + facturatie). Importeert uit `shared/`.
- `shared/core.js` – Gedeelde kern: constants, utils, storage, migratie.
- `shared/theme.css` – Material-thema (groen palet), gedeeld door alle apps.
- `shared/firebase-app.js` – Firebase Auth + Firestore, gedeeld door alle apps.
- `firebase-config.js` – Gegenereerd uit `.env` / Vercel env vars (niet in git); zie `.env.example`.
- `README.md` – Deze uitleg.

### Navigatiestructuur

**Beheer** (overstijgend)
- Klanten, Projecten, Instellingen

**Werk** (registratie & taken)
- Dashboard, Uren, Facturen, Taken

Alles in één app. `/projecten/` verwijst door naar `/#taken`.

## Samenvatting

| Vraag | Waar te zien |
|--------|----------------|
| Hoeveel uur besteed ik? | Dashboard → “Totaal uren (alle)” en per project. |
| Wat moet ik factureren? | Dashboard → “Te factureren (open)” en onder “Per project”. |
| Wat heb ik al gefactureerd? | Dashboard → “Al gefactureerd” en tab Facturen. |
| Wat staat nog open? | Zelfde als “Te factureren (open)” + in tab Uren (alle open uren). |
