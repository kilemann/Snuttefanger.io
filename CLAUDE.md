# Snuttefanger
Windows-app (Electron + React + TypeScript) som laster ned video og lyd med yt-dlp og klipper uten kvalitetstap med FFmpeg. Engelsk og norsk grensesnitt.
Kode i `src/main`, `src/preload`, `src/renderer`, `src/shared`. Spesifikasjon i `docs/SPEC.md`. `index.html` i rot er nedlastingssiden.

## Regler for alt arbeid i dette repoet
- Svar brukeren på norsk. Commit-meldinger på norsk, med versjon først (f.eks. «Appnavn 1.4.0: kort beskrivelse»).
- Hver endring får nytt versjonsnummer (MAJOR.MINOR.PATCH) og en linje i endringsloggen. Versjonen skal være lik på alle stedene under.
- Lever rett på `main` når resultatet er godt nok og testene er grønne. Kjør `git fetch origin main` og rebase før push.
- Testdrevet utvikling (TDD) bare når brukeren ber om det. Eksisterende tester kjøres alltid før push.
- Tekniske påstander skal sjekkes mot dokumentasjon eller kilde, ikke gjettes.
- Nedlastingssiden (`index.html`) står på samlesida (kilemann.github.io). Både den og appen skal vise navn, versjon og en (i)-knapp øverst til venstre, med bruksanvisning og versjonsliste i info-vinduet.
- Nedlastingssiden publiseres med GitHub Pages fra `main`.
- README og spesifikasjon er på engelsk. Tekster i appen finnes på engelsk og norsk (`src/shared/i18n.ts`, `src/renderer/i18n.ts`).

## Versjon står her
- `package.json` (`version`). Hevet versjon pushet til `main` får GitHub Actions til å bygge installasjonsfil og ZIP og lage release
- `CHANGELOG.md`
- Versjonslista i info-vinduet: `src/renderer/views/InfoDialog.tsx` (både engelsk og norsk) og `index.html` (nedlastingssiden, begge språk)

## Tester
`npm test` (Node 22, etter `npm install`): bygger og kjører enhetstestene. `npm run test:integration` laster ned de ekte verktøyene (ca. 400 MB). `npm run dist` må kjøres på Windows.
