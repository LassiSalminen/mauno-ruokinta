# Sinulta tarvittavat askeleet

Kaikki koodi on valmiina. Nämä askeleet vaativat kirjautumisen Googleen tai Firebaseen, joten ne jäävät sinulle. Tee ne järjestyksessä. **Yhteensä noin 25–30 min.**

Ennen näitä askeleita sovellus toimii jo osoitteessa https://lassisalminen.github.io/mauno-ruokinta/ paikallisessa tilassa (tiedot vain omassa selaimessa).

---

## 1. Luo Firebase-projekti (≈ 5 min)

1. Avaa https://console.firebase.google.com/ ja kirjaudu tilillä **lassi.salminen3@gmail.com**.
2. **Create a project** → nimi `mauno-ruokinta` → Google Analytics **pois päältä** → Create.
   - Jos projektin ID `mauno-ruokinta` on varattu, Firebase ehdottaa muuta ID:tä (esim. `mauno-ruokinta-1a2b3`). Laita se tiedostoon `.firebaserc` kohtaan `"default"`.
3. Pysy **Spark (ilmainen)** -tasolla. Älä päivitä Blaze-tasolle.

## 2. Ota käyttöön Google-kirjautuminen (≈ 3 min)

1. Vasen valikko → **Build → Authentication → Get started**.
2. **Sign-in method** → **Google** → Enable → valitse tukisähköpostiksi oma osoitteesi → Save.
3. **Settings → Authorized domains → Add domain** → `lassisalminen.github.io` → Add.

## 3. Luo Firestore-tietokanta (≈ 2 min)

1. **Build → Firestore Database → Create database**.
2. Sijainti: `eur3 (europe-west)` → Next → **Start in production mode** → Create.

## 4. Deployaa security rules (≈ 3 min)

**Vaihtoehto A, konsolista (ei asennuksia):**
1. Firestore Database → **Rules**-välilehti.
2. Korvaa sisältö tiedoston [`firestore.rules`](firestore.rules) sisällöllä → **Publish**.

**Vaihtoehto B, komentoriviltä:**
```bash
npm install -g firebase-tools
```
```bash
firebase login
```
```bash
firebase deploy --only firestore:rules
```

## 5. Rekisteröi web-sovellus ja liitä config (≈ 5 min)

1. Project Overview (⚙️) → **Project settings → General → Your apps → `</>` (Web)**.
2. Nimi `Maunon ruokinta` → Firebase Hosting **ei** → Register app.
3. Kopioi `firebaseConfig`-olion arvot tiedostoon [`src/firebase-config.js`](src/firebase-config.js) (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
4. **Project settings → Cloud Messaging → Web configuration → Web Push certificates → Generate key pair.** Kopioi avain kohtaan `window.FIREBASE_VAPID_KEY`.
5. Commitoi ja pushaa:
```bash
git commit -am "Firebase-config" && git push
```
Nämä arvot eivät ole salaisuuksia, joten ne saa olla julkisessa repossa.

## 6. Kirjaudu ja lisää Annika (≈ 3 min)

1. Avaa https://lassisalminen.github.io/mauno-ruokinta/ (päivitä sivu, jos se oli jo auki).
2. **Kirjaudu Googlella** omalla tililläsi. Kotitalous luodaan automaattisesti, ja sinusta tulee sen omistaja.
3. Jos selaimessa oli jo dataa, sovellus kysyy, siirretäänkö se jaettuun tietoon. Vastaa **OK**.
4. Sivun alalaidasta **👥 Lisää jäsen** → kirjoita **Annikan Google-tilin sähköpostiosoite** → OK.
5. Annika avaa saman linkin ja kirjautuu omalla Google-tilillään.

(Vaihtoehtoisesti konsolista: Firestore → `households` → `mauno` → kenttä `members` → Add item → Annikan osoite **pienillä kirjaimilla**.)

## 7. Push-muistutusten lähettäjä: service account GitHubiin (≈ 5 min)

1. Firebase-konsoli → ⚙️ **Project settings → Service accounts → Generate new private key** → Generate key. Selain lataa JSON-tiedoston.
   - **Tämä on salaisuus.** Älä lisää sitä repoon (`.gitignore` estää yleisimmät nimet).
2. Lisää se GitHubiin salaisuudeksi `FIREBASE_SERVICE_ACCOUNT`. Komentoriviltä (korvaa polku omallasi):
```bash
gh secret set FIREBASE_SERVICE_ACCOUNT --repo LassiSalminen/mauno-ruokinta < "$HOME/Downloads/mauno-ruokinta-firebase-adminsdk-xxxxx.json"
```
   Tai selaimessa: repo → **Settings → Secrets and variables → Actions → New repository secret** → nimi `FIREBASE_SERVICE_ACCOUNT` → liitä koko JSON-tiedoston sisältö.
3. Poista ladattu JSON-tiedosto koneelta.
4. Testaa: repo → **Actions → Muistutukset → Run workflow**. Lokissa pitäisi näkyä esim. `0 muistutusehdokasta`.

## 8. Puhelimiin (≈ 2 min / puhelin)

1. Avaa linkki puhelimen selaimessa (Android: Chrome, iPhone: Safari) → kirjaudu.
2. **Lisää kotinäytölle** (Android: ⋮ → *Asenna sovellus*; iPhone: Jaa → *Lisää Koti-valikkoon*).
3. Avaa sovellus kotinäytöltä → **🔔 Ota muistutukset käyttöön** → Salli.
   - iPhonessa ilmoitukset toimivat vain kotinäytölle lisätyssä sovelluksessa (iOS 16.4+).

---

### Hyvä tietää
- GitHub pysäyttää ajastetut workflowt, jos julkisessa repossa ei ole tapahtunut mitään 60 päivään. GitHub lähettää siitä sähköpostin. Muistutukset saa takaisin päälle: **Actions → Muistutukset → Enable workflow**.
- Kaikki käytetyt palvelut ovat ilmaisia: Firebase Spark (Auth, Firestore, Cloud Messaging), GitHub Pages ja GitHub Actions julkisessa repossa.
