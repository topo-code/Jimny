# Jimny maršruta lapa

Atsevišķa telefona lietotne (PWA) darba dienu, odometra un uzpilžu uzskaitei un mēneša degvielas atskaitei Excel formātā.

- Dati glabājas tikai telefonā. Rezerves kopiju saglabā sadaļā Iestatījumi.
- No rīta ievadi odometra km, pie uzpildes litrus un summu, vakarā spied "Beigt dienu" (mēneša pēdējā darba dienā ar km).
- Sadaļā Pārskats — nobraukums un izmaksas pa mēnešiem, gada Excel.
- Mēneša beigās: Google Maps → Laika skala → Eksportēt, tad lietotnē Mēnesis → Ielādēt Timeline failu → Izveidot Excel.

Mainot failus, `sw.js` palielini `VERSION`, lai telefons ielādētu jauno versiju.
