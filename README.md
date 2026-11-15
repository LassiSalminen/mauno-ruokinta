# Mauno-ruokinta 🐾

Koiran ruokinnan seurantasovellus: yksi HTML-tiedosto, ei asennuksia eikä palvelinta.

## Ominaisuudet

- **Päivän annos**: päivittäinen grammamäärä jaettuna aterioihin, edistyminen renkaana
- **Kuivaruoka, lihapullat ja raakaruoka**: ruokintojen kirjaus napin painalluksella
- **Muut ruoat ja herkut**: lisäkset lasketaan mukaan päivän määrään
- **Varasto**: ostot, pakastin ja sulatus – sovellus muistuttaa, kun pitää ottaa ruokaa sulamaan
- **Profiili**: koiran nimi, rotu ja kuva; ohjattu käyttöönotto ensimmäisellä kerralla

## Käyttö

Avaa `index.html` selaimessa. Sovellus toimii myös puhelimella.

GitHub Pagesin kautta sovelluksen voi avata suoraan osoitteesta
`https://lassisalminen.github.io/mauno-ruokinta/` (kun Pages on otettu käyttöön).

## Tietojen tallennus

Kaikki tiedot tallennetaan **vain omaan selaimeen** (`localStorage`). Mitään ei lähetetä
palvelimelle. Tämä tarkoittaa myös, että eri laitteiden ja käyttäjien tiedot eivät
synkronoidu keskenään.

## Tekniikka

Puhdas HTML + CSS + JavaScript yhdessä tiedostossa. Ainoa ulkoinen riippuvuus on
Nunito-fontti Google Fontsista.
