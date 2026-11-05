# Snuttefanger

Last ned video og lyd, og klipp snutter tapsfritt. Windows-app bygd med Electron, yt-dlp og FFmpeg.

Status: versjon 0.1, første fase. Se [spesifikasjonen](docs/SPEC.md) og [endringsloggen](CHANGELOG.md).

## Bruke appen

1. Last ned `Snuttefanger-x.y.z-portable.exe` fra [Releases](https://github.com/kilemann/Snuttefanger.io/releases).
2. Start filen. Windows SmartScreen kan advare fordi appen ikke er kodesignert.
3. Gå til **Innstillinger** og velg **Installer det som mangler**. Appen henter yt-dlp, FFmpeg og Deno og kontrollerer sjekksummene.

## Utvikling

Krever Node.js 22.

```
npm install
npm start
npm test
npm run test:integration
npm run dist
```

Integrasjonstesten laster ned ekte verktøy, cirka 400 MB. `npm run dist` lager den portable exe-filen i `release/` og må kjøres på Windows.

Når `version` i `package.json` økes og pushes til `main`, bygger GitHub Actions exe-filen og lager releasen automatisk. Nettsiden lenker alltid til exe-filen i siste release.

## Opphavsrett

Videoer på YouTube og andre nettsteder kan være vernet av opphavsrett og vilkår. Du er selv ansvarlig for at du har rett til å laste ned og bruke innholdet.

## Lisens og verktøy

Koden har [MIT-lisens](LICENSE). yt-dlp, FFmpeg og Deno følger ikke med i repoet eller exe-filen. De lastes ned fra utgiverne og har egne lisenser. FFmpeg-bygget som hentes er GPL-lisensiert.
