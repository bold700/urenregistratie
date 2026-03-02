# Beveiliging

## Exposed API key – actie vereist

Als je een melding hebt gekregen over een geëxposeerde Firebase/Google API key:

### 1. Maak een nieuwe API key aan

1. Ga naar [Google Cloud Console](https://console.cloud.google.com)
2. Selecteer project **urenregistratie**
3. **APIs & Services** → **Credentials**
4. Klik op je API key (of maak een nieuwe)
5. **Regenerate key** of maak een nieuwe key aan
6. Kopieer de nieuwe key

### 2. Beperk de API key

Bij dezelfde key:
- **Application restrictions** → **HTTP referrers**
- Voeg toe:
  - `https://*.vercel.app/*`
  - `http://localhost:*`
  - `https://jouwdomein.nl/*` (als je een eigen domein hebt)
- Sla op

### 3. Update je configuratie

Vervang in `firebase-config.js` de waarde van `apiKey` met je nieuwe key.

### 4. Deploy opnieuw

Push je wijzigingen en Vercel deployt automatisch.

---

**Let op:** De oude API key is gecompromitteerd. Gebruik deze niet meer. Met HTTP referrer restrictions werkt je key alleen vanaf geautoriseerde domeinen.
