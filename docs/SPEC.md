# Snuttefanger: spesifikasjon v2

Windows-app for å laste ned video og lyd med yt-dlp og klippe filer tapsfritt med FFmpeg. Appen er for privat bruk, men koden ligger i et offentlig repo. Den kan også klippe filer som ikke er lastet ned med appen.

## Beslutninger

| Tema | Valg | Grunn |
|---|---|---|
| Prosjekt | Nytt, med egen kode | Besluttet av Kilemann. Feil rettes under testing. |
| Lisens | MIT | Krever at vi ikke kopierer GPL-kode. LosslessCut og Parabolic brukes bare som idékilder. |
| Teknologi | Electron, TypeScript og React | Gir rask GUI-utvikling og god mediestøtte i Chromium. |
| Bygg | esbuild | Avvik fra v1: appen trenger ingen utviklingsserver, og esbuild gir ett enkelt byggeskript. Vite kan legges til ved behov. |
| Utseende | Ryddig og mørkt | Fluent er ikke et krav, og lyst tema er tatt ut. |
| Innstillinger | JSON | SQLite vurderes først for historikk i fase 4. |
| FFmpeg, yt-dlp og Deno | Lastes ned ved første oppstart | Ligger ikke i repoet eller i exe-filen. SHA-256 kontrolleres. yt-dlp oppdateres separat. |
| Pakking | Portabel exe via GitHub Releases | Ingen installasjonsprogram eller kodesignering. SmartScreen kan advare. |
| Oppdatering av appen | Bare varsel | Kommer i fase 5. |

Maskinvareakselerasjon er utsatt til omkoding finnes, og er ikke med i fase 1.

## Arkitektur

Hovedprosessen eier alt som rører filer og prosesser. GUI-et kjører isolert og snakker med hovedprosessen gjennom et smalt API.

| Tjeneste | Ansvar |
|---|---|
| `ProcessManager` | Starter verktøy uten skall og stopper hele prosesstreet |
| `JobQueue` | Kø, grenser, pause, fortsett, avbryt og prøv igjen |
| `BinaryManager` | Finner, laster ned og kontrollerer verktøy |
| `SettingsService` | Validerer og lagrer innstillinger |
| `DownloaderService` | yt-dlp-argumenter og tolking av svar |
| `MediaProbeService` | ffprobe-informasjon om filer |
| `ExportService` | Klipping og filnavn |

Kommer senere: `WaveformService` i fase 3 og `HistoryService` i fase 4. Tidslinjen hører hjemme i GUI-et.

## Kjente tekniske forhold

- **Pause:** yt-dlp har ingen ekte pause. Appen stopper prosessen og fortsetter på delfilen.
- **Forhåndsvisning:** Chromium spiller ikke alle formater. I fase 1 kan slike filer klippes ved å skrive inn tider. FFmpeg-basert forhåndsvisning kommer i fase 2.
- **Tapsfri klipping:** Klippet starter på nærmeste keyframe før valgt start. Appen sier fra når klippet blir lengre enn valgt.
- **Lydformater:** FLAC og WAV fra nettsteder gir ikke bedre lyd enn kilden. GUI-et viser dette.
- **YouTube:** yt-dlp bruker Deno som JavaScript-runtime.
- **Sammenslåing:** Filer må ha samme kodekparametere. Dette må kontrolleres før eksport i fase 3.

## Faser

### Fase 1: grunnmur (v0.1)
Appskall, kø, innstillinger, verktøyinstallasjon, nedlasting av enkeltvideoer, åpning av lokale filer og tapsfritt klipp av ett segment.

**Godkjent når:** en URL kan lastes ned, åpnes i klipperen og eksporteres. En lokal fil kan klippes uten URL. Pause og fortsett virker på Windows.

### Fase 2: klipper (v0.2 og videre)
Ferdig i v0.2.0: opptil 10 klipp fra samme fil, som egne filer. Gjenstår:
Tidslinje med zoom, lydutdrag, eksport av bare video eller bare lyd, og forhåndsvisning av formater Chromium ikke støtter.

### Fase 3: presisjon (v0.3)
Bølgeform, presis modus med full omkoding, sammenslåing med kompatibilitetskontroll og bedre eksportvalg. Smart cut vurderes etterpå.

### Fase 4: nedlaster (v0.4)
Spillelister, undertekster, historikk, cookies for innloggede videoer og gjenopptak etter omstart. Cookies skal aldri havne i Git eller logger.

### Fase 5: ferdigstilling (v1.0)
Varsel om nye versjoner, ikon og feilretting fra testing.

## Testing

Enhetstester og integrasjonstester kjører på Windows i GitHub Actions. Integrasjonstesten bruker ekte verktøy og en mappe med æøå. GUI-et testes av Kilemann på Windows. Fast testsett: MP4 (H.264), MKV (HEVC), WebM, AVI, MP3 og FLAC.
