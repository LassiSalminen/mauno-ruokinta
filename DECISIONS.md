# Päätökset

Itsenäisesti tehdyt oletuspäätökset ja niiden perustelut.

## Rakenne
- **Yksi `index.html` + pienet moduulit `src/`-kansiossa.** Käyttöliittymä ja sovelluslogiikka pysyivät `index.html`:ssä lähes ennallaan. Erillisinä tiedostoina ovat vain jaettu laskenta (`src/logic.js`), Firebase-adapteri ja config. Ei build-vaihetta: GitHub Pages tarjoilee tiedostot sellaisenaan.
- **Klassiset `<script>`-tagit, ei ES-moduuleja** sovelluksen omissa tiedostoissa. Sovelluksen inline-skripti kutsuu `window.claude.use()`:a heti, joten adapterin täytyy olla määritelty synkronisesti ennen sitä. Firebase-SDK ladataan adapterin sisällä dynaamisella `import()`:lla gstaticin CDN:stä (versio 11.0.2).
- **GitHub Pages suoraan `main`-haaran juuresta** (ei Actions-deployta). Yksinkertaisin vaihtoehto, ja jokainen push julkaisee heti.

## Jaettu logiikka
- `rawState`, `rawNeed`, `stockG`, `kibRate`, `slotsOf` ym. siirrettiin muuttamattomina `src/logic.js`:ään puhtaiksi funktioiksi (`(tila, nyt)`). Sovellus kutsuu niitä ohuiden kääreiden kautta, ja muistutusskripti käyttää täsmälleen samaa koodia.
- Päivän raja lasketaan ajoympäristön paikallisessa ajassa. Muistutus-workflow ajetaan siksi `TZ=Europe/Helsinki`.

## Firebase
- **Adapteri toteuttaa saman rajapinnan kuin `window.claude.use('db'|'user')`.** Sovelluslogiikkaan ei tarvinnut koskea. Erot Firestoreen tasataan adapterissa: `snapshot.exists` on ominaisuus eikä metodi, ja virhekoodit muunnetaan (`resource-exhausted` → `quota_exceeded` jne.).
- **Kirjoitukset kuitataan viimeistään 1,5 s jälkeen.** Offline-tilassa Firestore jonottaa kirjoituksen, ja käyttöliittymä jatkaa heti. Pelkkä `await setDoc` jäisi offline-tilassa roikkumaan.
- **`permission-denied` ei pudota sovellusta localStorage-tilaan.** Sovellus käsittelee vain `invalid_argument`-koodin "go local" -tapauksena. Siksi oikeusvirhe näytetään pelkkänä "Tallennus epäonnistui" -ilmoituksena, ettei data jakaudu huomaamatta kahteen paikkaan.
- **Firestoren persistent cache (IndexedDB, monivälilehtinen)** pitää jaetun datan saatavilla myös offline-tilassa.
- **Jäsenlista: `households/mauno.members` (sähköpostit pieninä kirjaimina).** Omistajan osoite on kovakoodattu `firestore.rules`-tiedostoon ja `src/firebase-config.js`:ään. Omistaja luo kotitalouden automaattisesti ensimmäisellä kirjautumisella ja voi lisätä jäseniä sovelluksesta (👥 Lisää jäsen). Firebase-konsolia ei tarvitse avata Annikan lisäämiseksi.
- **Omistajan sähköposti on julkisessa repossa** (rulesissa ja configissa). Pyysit tätä osoitetta allowlistiin, ja ilman sitä rulesia ei voi deployata repoon tallennettuna. Annikan osoitetta ei tallenneta repoon, vaan se lisätään vain Firestoreen.
- **Kirjautuminen: `signInWithPopup`, varalla `signInWithRedirect`.** Redirect-kirjautuminen on epäluotettava, kun authDomain (`*.firebaseapp.com`) on eri sivustolla kuin sovellus (`github.io`), koska selaimet rajoittavat kolmannen osapuolen tallennusta.
- **"Jatka ilman kirjautumista"** pitää localStorage-tilan käytettävissä myös Firebasen kanssa.
- **Paikallisen datan siirto:** jos selaimessa on vanhaa localStorage-dataa ja jaettu tieto on tyhjä, sovellus kysyy kirjautumisen jälkeen, siirretäänkö data.

## Push-muistutukset
- **FCM-data-viestit + oma service worker (`sw.js`)** eikä erillistä `firebase-messaging-sw.js`:ää. Yksi service worker hoitaa sekä offline-välimuistin että push-ilmoitukset. Data-viestit eivät tuota tuplailmoituksia.
- **Tokenit: `pushTokens/{uid}.tokens` on lista.** Spesifikaatio sanoi `pushTokens/{uid}`, mutta yhdellä käyttäjällä voi olla useita laitteita (puhelin ja kone), joten dokumentti tallentaa listan tokeneita. Vanhentuneet tokenit siivotaan lähetyksen yhteydessä.
- **Aikaikkunat:** sulatus klo 17.00–20.59; myöhästynyt ateria 60 min – 6 h eräpäivän jälkeen ja ennen klo 22; päivittäinen varastomuistutus ensimmäisellä ajolla klo 10–22 (GitHubin cron voi myöhästyä, joten tarkkaa klo 10.00-ajoa ei vaadita). Kaikki varastovaroitukset kootaan yhdeksi viestiksi.
- **Tuplaesto:** `sentReminders/{key}` luodaan atomisesti (`create()`) ennen lähetystä, ja avaimessa on päivämäärä. Jos yksikään lähetys ei onnistu, merkintä poistetaan ja seuraava ajo yrittää uudelleen.
- **GitHub poistaa ajastetut workflowt käytöstä, jos repossa ei ole tapahtunut mitään 60 päivään.** Ratkaisu on BLOCKERS.md:ssä ja READMEssä (Actions-välilehdeltä "Enable workflow" tai mikä tahansa commit).

## PWA
- Service worker hakee omat tiedostot verkosta ensin (päivitykset näkyvät heti) ja käyttää välimuistia, jos verkkoa ei ole. Firebase-SDK ja fontit haetaan välimuistista ensin. Firestore- ja Auth-liikenne ei kulje välimuistin kautta.
- Lighthouse 12 poisti PWA-kategorian, joten asennettavuus tarkistetaan Chromen omalla `Page.getInstallabilityErrors`-tarkistuksella (CDP) Playwright-testissä.
- Ikonit generoidaan tassu-SVG:stä Playwrightin Chromiumilla (`npm run icons`), joten erillistä kuvankäsittelykirjastoa ei tarvita.

## Testit
- Firestore-emulaattori vaatii Javan, jota koneella ei ole. Adapterin yksikkötestit ajetaan siksi in-memory-mockia vasten (`tests/unit/fake-firestore.js`). Lisäksi `tests/e2e/firebase.spec.js` ajaa adapterin selainkäynnistyksen (kirjautumisnäkymä, jäsenyys, kotitalouden luonti, synkronointi, datan siirto) feikattuja Firebase-moduuleja vasten.
- E2E-testit ajetaan kiinteällä kellolla (ma 16.11.2026 klo 12, Europe/Helsinki), jotta laskelmat ovat toistettavia.

## Korjattu bugi
- Paikallisessa tilassa `loc()` palautti `true`:n eikä Promisea. Siksi `store.delRaw(id).then(...)`, varastotuotteen poisto ja lihapullien "Korjaa" heittivät virheen: tallennus onnistui, mutta ilmoitus jäi näyttämättä, eikä varastolista päivittynyt. Nyt `loc()` palauttaa Promisen.
