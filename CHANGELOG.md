# Endringslogg

Prosjektet bruker [semantisk versjonering](https://semver.org/lang/nb/).

## 0.2.0 (2026-11-05)

### Lagt til
- Velg 1 til 10 klipp fra samme fil. Hvert klipp eksporteres til sin egen fil.
- Infoknapp ved siden av versjonsnummeret, med hjelp og versjonshistorikk.

### Endret
- Appnavn og versjon står øverst til venstre.
- FLAC-klipp kodes på nytt som FLAC. Det er matematisk tapsfritt, og gir riktig lengde og tid fra 0.

### Rettet
- Klipp fra filer med omslagsbilde beholdt tidsstemplene fra originalen, så avspilling ikke startet på 0.

### Kjent begrensning
- Klipp fra MKV-filer får ikke med omslagsbildet.

## 0.1.0 (2026-11-04)

### Lagt til
- Nedlasting av enkeltvideoer med yt-dlp, med valg av kvalitet og format.
- Kø med pause, fortsett, avbryt og prøv igjen.
- Tapsfritt klipp av ett segment med FFmpeg.
- Åpning av lokale filer med filvelger eller dra og slipp.
- Forhåndsvisning, klippestripe og hurtigtaster.
- Installasjon av yt-dlp, FFmpeg og Deno med kontroll av sjekksum.
- Innstillinger for mapper, standardvalg og verktøystier.
- Portabelt Windows-bygg via GitHub Actions.
