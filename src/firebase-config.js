/* Firebasen web-config. Nämä arvot EIVÄT ole salaisuuksia (ne näkyvät joka tapauksessa selaimelle);
 * pääsy dataan rajataan Firestoren security rulesilla (firestore.rules).
 *
 * Täytä arvot: Firebase-konsoli → Project settings → General → Your apps → Web app → SDK setup and configuration → Config.
 * Niin kauan kuin apiKey on tyhjä, sovellus toimii pelkässä paikallisessa tilassa (localStorage).
 */
window.FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

/* Web push -avain: Firebase-konsoli → Project settings → Cloud Messaging → Web Push certificates → Key pair. */
window.FIREBASE_VAPID_KEY = '';

/* Kotitalous, jonka alle kaikki data tallennetaan (households/<id>/...). */
window.MAUNO_HOUSEHOLD = 'mauno';

/* Omistaja voi luoda kotitalouden ja lisätä jäseniä sovelluksesta. Sama osoite on firestore.rules-tiedostossa. */
window.MAUNO_OWNER = 'lassi.salminen3@gmail.com';
