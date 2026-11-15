# Tilanne

Päivitetty 15.11.2026.

| Vaihe | Tila | Huom. |
|---|---|---|
| 1. Repo ja rakenne | ✅ Valmis | Julkinen repo, GitHub Pages `main`-haarasta |
| 2. PWA | ✅ Valmis | Manifest, ikonit, service worker, offline. Chromen asennettavuustarkistus testattu |
| 3. Firebase-synkronointi | 🟡 Koodi valmis | Puuttuu Firebase-projekti ja config → BLOCKERS.md 1–6 |
| 4. Push-muistutukset | 🟡 Koodi valmis | Puuttuu VAPID-avain ja `FIREBASE_SERVICE_ACCOUNT` → BLOCKERS.md 5, 7 |
| 5. Testit ja CI | ✅ Valmis | 16 yksikkötestiä + 14 Playwright-testiä, GitHub Actions jokaisesta pushista |
| 6. Viimeistely | ✅ Valmis | README, kuvakaappaukset, BLOCKERS.md |

## Tehty
- Laskentalogiikka eriytetty `src/logic.js`:ään. Sama koodi on käytössä sovelluksessa ja muistutusskriptissä.
- Firebase-adapteri (`src/firebase-adapter.js`) toteuttaa `window.claude.use('db'|'user')`-rajapinnan Firestoren ja Authin päälle.
- Kirjautumisnäkymä, jäsenyyden tarkistus, kotitalouden automaattinen luonti omistajalle, jäsenen lisäys sovelluksesta ja paikallisen datan siirto.
- `firestore.rules`: luku ja kirjoitus vain allowlistatuille sähköposteille.
- Push: ilmoitusluvan pyyntö napista, token Firestoreen, lähettäjä GitHub Actionsissa (30 min välein), tuplaesto.
- Korjattu bugi: paikallisessa tilassa poistojen ilmoitus ja varastolistan päivitys eivät toimineet.

## Kesken / vaatii sinua
- BLOCKERS.md:n askeleet 1–8.
- Oikeaa Firebasea vasten ei ole testattu, koska projektia ei vielä ole. Adapteri on testattu mockia ja feikattuja SDK-moduuleja vasten.
