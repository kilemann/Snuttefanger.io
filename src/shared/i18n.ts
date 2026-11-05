// Tekster på engelsk og norsk. Hovedprosessen sender meldinger som nøkler (se msg), så GUI-et
// oversetter dem til språket som er valgt når de vises, også etter at språket er byttet.

export type Language = 'en' | 'nb';
export const LANGUAGES: { id: Language; name: string }[] = [{ id: 'en', name: 'English' }, { id: 'nb', name: 'Norsk' }];

const en = {
  'nav.download': 'Download', 'nav.cut': 'Cut', 'nav.join': 'Join', 'nav.queue': 'Queue', 'nav.settings': 'Settings',
  'app.menu': 'Main menu', 'app.about': 'About and help',
  'app.toolsBanner': 'Snuttefanger needs yt-dlp and FFmpeg before it can download and cut.', 'app.goToTools': 'Go to tools',

  'dl.title': 'Download', 'dl.address': 'Web address', 'dl.placeholder': 'Paste the address of a video',
  'dl.getInfo': 'Get info', 'dl.gettingInfo': 'Getting info', 'dl.type': 'Download', 'dl.typeLabel': 'Download type',
  'dl.videoAudio': 'Video and audio', 'dl.audioOnly': 'Audio only', 'dl.quality': 'Quality', 'dl.best': 'Best available',
  'dl.upTo': 'Up to {q}p', 'dl.fileFormat': 'File format', 'dl.audioFormat': 'Audio format',
  'dl.noteBig': '{fmt} takes more space but does not sound better than the source. Websites normally deliver lossy audio.',
  'dl.noteReencode': 'The audio is re-encoded if the source uses another format, which costs a little quality.',
  'dl.noteKeep': 'The audio is kept unchanged if the source already uses this format.',
  'dl.saveTo': 'Save to', 'dl.chooseFolder': 'Choose folder', 'dl.start': 'Download',
  'dl.hint': 'Get info to see the video and choose where to save it. Only download content you have the right to use.',

  'q.title': 'Queue', 'q.empty': 'Downloads and clips appear here when you start them.',
  'q.queued': 'Queued', 'q.running': 'Running', 'q.paused': 'Paused', 'q.done': 'Done', 'q.failed': 'Failed', 'q.canceled': 'Canceled',
  'q.open': 'Open in cutter', 'q.show': 'Show in folder', 'q.pause': 'Pause', 'q.resume': 'Resume', 'q.retry': 'Retry',
  'q.cancel': 'Cancel', 'q.remove': 'Remove from list', 'q.minLeft': '{m} min {s} s left', 'q.secLeft': '{s} s left',

  'cut.title': 'Cut', 'cut.drop': 'Drop a video or audio file here', 'cut.open': 'Open file', 'cut.openAnother': 'Open another file',
  'cut.noPreview': 'Preview is not supported for this format yet. You can still type start and end times and cut the file.',
  'cut.strip': 'Clip strip', 'cut.dragStart': 'Drag start', 'cut.dragEnd': 'Drag end', 'cut.play': 'Play', 'cut.pause': 'Pause',
  'cut.time': 'Playback time', 'cut.of': '{t} of {d}', 'cut.clips': 'Clips', 'cut.count': 'Number of clips',
  'cut.export1': 'Export clip', 'cut.exportN': 'Export {n} clips', 'cut.start': 'Start', 'cut.end': 'End', 'cut.length': 'Length',
  'cut.mode': 'Export', 'cut.av': 'Video and audio', 'cut.audio': 'Audio only', 'cut.clipN': 'Clip {n}',
  'cut.setStart': 'Set start', 'cut.setEnd': 'Set end', 'cut.setStartTip': 'Set start at the playhead', 'cut.setEndTip': 'Set end at the playhead', 'cut.startN': 'Start clip {n}', 'cut.endN': 'End clip {n}', 'cut.modeN': 'Export clip {n}', 'cut.format': 'Audio format', 'cut.formatN': 'Audio format clip {n}', 'cut.original': 'Original',
  'cut.noteFormat': 'Original keeps the audio exactly as it is, without re-encoding. MP3, M4A and Opus are re-encoded at high quality: a little quality is lost, but the files play almost everywhere. FLAC and WAV do not sound better than the source. Re-encoded clips are cut exactly at the selected times.',
  'cut.noteAv': 'Each clip becomes its own file that starts at 0, and the original file is not changed. Video and audio are copied without losing quality. Video clips start on the nearest keyframe before the selected start, so they can be slightly longer than selected.',
  'cut.noteAudio': 'Audio only copies the first audio track without re-encoding, into a format that fits it, such as M4A for AAC.',
  'cut.scClip': 'Shortcuts for the selected clip:', 'cut.scStart': 'start', 'cut.scEnd': 'end', 'cut.scPlayback': 'Playback:',
  'cut.scSpace': 'Space', 'cut.scPlay': 'play', 'cut.scSecond': 'one second, with', 'cut.scTen': 'ten seconds',
  'cut.aboutFile': 'About the file', 'cut.video': 'Video', 'cut.audioStream': 'Audio', 'cut.subtitles': 'Subtitles', 'cut.cover': 'Cover art',
  'cut.other': 'Other', 'cut.fps': '{n} fps', 'cut.channels': '{n} channels',

  'join.title': 'Join audio', 'join.drop': 'Drop audio files here, or add clips from the queue', 'join.add': 'Add files',
  'join.empty': 'Add at least two files. Video files can be used too: their first audio track is joined.',
  'join.up': 'Move up', 'join.down': 'Move down', 'join.remove': 'Remove', 'join.clear': 'Remove all', 'join.total': 'Total length {t}',
  'join.format': 'Audio format', 'join.start': 'Join {n} files', 'join.reading': 'Reading file',
  'join.lossless': 'The files have the same format and can be joined without re-encoding.',
  'join.mismatch': 'The files have different formats, so they must be re-encoded. Choose an audio format.',
  'join.note': 'Original joins without re-encoding. With MP3, AAC and Opus this can give a tiny click where the files meet. Choose a format to re-encode if you want seamless transitions.',
  'join.noteFormat': 'MP3, M4A and Opus are re-encoded at high quality and play almost everywhere. FLAC and WAV do not sound better than the source.',
  'join.noAudio': 'No audio', 'join.added': 'Added to Join', 'q.addToJoin': 'Add to Join',
  'set.title': 'Settings', 'set.language': 'Language', 'set.tools': 'Tools',
  'set.toolsNote': "The app downloads the tools from their publishers' GitHub pages and verifies the checksums. yt-dlp uses Deno for YouTube.",
  'set.missing': 'Missing', 'set.notWorking': 'Not working', 'set.custom': 'chosen by you', 'set.managed': 'installed by the app',
  'set.system': 'from the system', 'set.srcMissing': 'missing', 'set.chooseFile': 'Choose file', 'set.useDefault': 'Use default',
  'set.install': 'Install missing tools', 'set.update': 'Update yt-dlp', 'set.allInstalled': 'All tools are installed.',
  'set.folders': 'Folders', 'set.downloads': 'Downloads', 'set.clips': 'Clips', 'set.sameFolder': 'Same folder as the original file',
  'set.chooseFolder': 'Choose folder', 'set.useOriginal': 'Use original folder', 'set.defaults': 'Download defaults',
  'set.quality': 'Quality', 'set.videoFormat': 'Video format', 'set.audioFormat': 'Audio format', 'set.simultaneous': 'Simultaneous downloads',
  'set.thumbnail': 'Embed thumbnail in the file',

  'info.close': 'Close',

  'err.toolMissing': '{tool} is missing. Install the tools under Settings.',
  'err.unsupported': 'Automatic installation is not supported on this system.',
  'err.noChecksum': 'Could not find the checksum for {label}.',
  'err.badChecksum': 'The checksum for {label} does not match. The file was discarded.',
  'err.unpack': 'Unpacking {label} failed: {detail}', 'err.notInArchive': 'Could not find {tool} in the archive.',
  'err.fetch': 'Could not fetch {url} (HTTP {status}).', 'err.download': 'Could not download {label} (HTTP {status}).',
  'err.noDuration': 'The file has no readable duration.', 'err.read': 'Could not read the file: {detail}',
  'err.badUrl': 'Paste a valid web address.', 'err.httpOnly': 'Only addresses starting with http or https can be downloaded.',
  'err.playlist': 'This is a playlist. Playlists are not supported yet, so paste the address of a single video.',
  'err.ytdlpSilent': 'yt-dlp stopped without an error message.', 'err.timeout': 'The website did not respond within 90 seconds.',
  'err.noFile': 'The download finished, but yt-dlp reported no file.', 'err.stopped': 'Stopped',
  'err.badTimes': 'Start and end must be valid times.', 'err.outside': 'The clip must be within the length of the file.',
  'err.order': 'End must come after start.', 'err.noAudio': 'This file has no audio.',
  'err.cut': 'FFmpeg could not cut the file: {detail}', 'err.clipCount': 'Choose between 1 and {max} clips.',
  'err.joinNoAudio': '{name} has no audio.', 'err.joinCount': 'Choose between 2 and {max} files.',
  'err.joinMismatch': 'The files have different audio formats. Choose a format to re-encode to.', 'err.join': 'FFmpeg could not join the files: {detail}',
  'note.joinCopy': 'Joined without re-encoding.', 'note.joinEncode': 'Joined and re-encoded.', 'job.join': 'Join {n} files ({fmt})', 'file.joined': 'joined',
  'err.joinEffectsOriginal': 'Effects need re-encoding. Choose an audio format other than Original.',
  'err.crossfadeTooLong': 'The crossfade must be shorter than the shortest file ({s} s).',
  'set.updateFfmpeg': 'Update FFmpeg',
  'join.effects': 'Effects', 'join.speed': 'Speed', 'join.speedN': 'Speed for file {n}', 'join.setAll': 'Set all to', 'join.speedAll': 'Speed for all files', 'join.choose': 'Choose', 'join.trim': 'Remove silence at the start and end of each file',
  'join.normalize': 'Even out the volume', 'join.fadeIn': 'Fade in', 'join.fadeOut': 'Fade out', 'join.crossfade': 'Crossfade between files',
  'join.none': 'None', 'join.seconds': '{s} s', 'join.tags': 'Title and artist', 'join.titleField': 'Title', 'join.artist': 'Artist',
  'join.cover': 'Include cover art from the first file that has it (MP3, M4A and FLAC)',
  'join.effectsNote': 'Effects need re-encoding, so Original is not available while an effect is on.',
  'join.preview': 'Listen to the result', 'join.previewing': 'Making preview, {p} %', 'join.previewStop': 'Stop',
  'join.previewOld': 'The choices have changed since this preview was made.', 'join.length': 'Result about {t}',
  'cut.zoomIn': 'Zoom in', 'cut.zoomOut': 'Zoom out', 'cut.zoomFit': 'Show all', 'cut.snap': 'Snap to silence',
  'cut.snapTip': 'Start and end move to the quietest point within half a second', 'cut.waveLoading': 'Reading the waveform',
  'cut.zoomHint': 'Ctrl + scroll wheel zooms, the scroll wheel moves.', 'cut.restored': 'The clips from last time were restored.', 'cut.reset': 'Start over',
  'err.clipN': 'Clip {n}: {inner}', 'err.mode': 'Unknown export type.',
  'note.keyframe': 'The clip is {s} s longer than selected, because lossless cutting has to start on a keyframe.',
  'job.clip': 'Clip from {name}', 'job.clipOf': 'Clip {i} of {n} from {name}', 'job.audio': '{title} (audio, {fmt})', 'fmt.original': 'original',
  'inst.downloading': 'Downloading {label}', 'inst.unpacking': 'Unpacking {label}', 'inst.ready': 'The tools are ready.', 'inst.stopped': 'Installation stopped.',
  'dlg.media': 'Video and audio', 'dlg.all': 'All files', 'file.clip': 'clip', 'file.audioClip': 'audio clip', 'unknown': 'unknown',
};

type Key = keyof typeof en;

const nb: Record<Key, string> = {
  'nav.download': 'Last ned', 'nav.cut': 'Klipp', 'nav.join': 'Skjøt', 'nav.queue': 'Kø', 'nav.settings': 'Innstillinger',
  'app.menu': 'Hovedmeny', 'app.about': 'Om appen og hjelp',
  'app.toolsBanner': 'Snuttefanger trenger yt-dlp og FFmpeg før den kan laste ned og klippe.', 'app.goToTools': 'Gå til verktøy',

  'dl.title': 'Last ned', 'dl.address': 'Nettadresse', 'dl.placeholder': 'Lim inn adressen til en video',
  'dl.getInfo': 'Hent info', 'dl.gettingInfo': 'Henter info', 'dl.type': 'Last ned', 'dl.typeLabel': 'Hva som lastes ned',
  'dl.videoAudio': 'Video og lyd', 'dl.audioOnly': 'Bare lyd', 'dl.quality': 'Kvalitet', 'dl.best': 'Beste tilgjengelige',
  'dl.upTo': 'Opptil {q}p', 'dl.fileFormat': 'Filformat', 'dl.audioFormat': 'Lydformat',
  'dl.noteBig': '{fmt} tar mer plass, men gir ikke bedre lyd enn kilden. Nettsteder leverer normalt tapsbeheftet lyd.',
  'dl.noteReencode': 'Lyden omkodes hvis kilden har et annet format, og det gir et lite kvalitetstap.',
  'dl.noteKeep': 'Lyden beholdes uendret hvis kilden allerede har dette formatet.',
  'dl.saveTo': 'Lagres i', 'dl.chooseFolder': 'Velg mappe', 'dl.start': 'Last ned',
  'dl.hint': 'Hent info for å se videoen og velge hvor den skal lagres. Last bare ned innhold du har rett til å bruke.',

  'q.title': 'Kø', 'q.empty': 'Nedlastinger og klipp vises her når du starter dem.',
  'q.queued': 'I kø', 'q.running': 'Pågår', 'q.paused': 'Pauset', 'q.done': 'Ferdig', 'q.failed': 'Feilet', 'q.canceled': 'Avbrutt',
  'q.open': 'Åpne i klipperen', 'q.show': 'Vis i mappe', 'q.pause': 'Pause', 'q.resume': 'Fortsett', 'q.retry': 'Prøv igjen',
  'q.cancel': 'Avbryt', 'q.remove': 'Fjern fra listen', 'q.minLeft': '{m} min {s} s igjen', 'q.secLeft': '{s} s igjen',

  'cut.title': 'Klipp', 'cut.drop': 'Slipp en video- eller lydfil her', 'cut.open': 'Åpne fil', 'cut.openAnother': 'Åpne en annen fil',
  'cut.noPreview': 'Forhåndsvisning støttes ikke for dette formatet ennå. Du kan fortsatt skrive inn start og slutt og klippe filen.',
  'cut.strip': 'Klippestripe', 'cut.dragStart': 'Dra start', 'cut.dragEnd': 'Dra slutt', 'cut.play': 'Spill av', 'cut.pause': 'Pause',
  'cut.time': 'Avspillingstid', 'cut.of': '{t} av {d}', 'cut.clips': 'Klipp', 'cut.count': 'Antall klipp',
  'cut.export1': 'Eksporter klipp', 'cut.exportN': 'Eksporter {n} klipp', 'cut.start': 'Start', 'cut.end': 'Slutt', 'cut.length': 'Lengde',
  'cut.mode': 'Eksport', 'cut.av': 'Video og lyd', 'cut.audio': 'Bare lyd', 'cut.clipN': 'Klipp {n}',
  'cut.setStart': 'Sett start', 'cut.setEnd': 'Sett slutt', 'cut.setStartTip': 'Sett start der avspillingen står', 'cut.setEndTip': 'Sett slutt der avspillingen står', 'cut.startN': 'Start klipp {n}', 'cut.endN': 'Slutt klipp {n}', 'cut.modeN': 'Eksport klipp {n}', 'cut.format': 'Lydformat', 'cut.formatN': 'Lydformat klipp {n}', 'cut.original': 'Original',
  'cut.noteFormat': 'Original beholder lyden nøyaktig som den er, uten omkoding. MP3, M4A og Opus kodes om med høy kvalitet: litt kvalitet går tapt, men filene spilles nesten overalt. FLAC og WAV gir ikke bedre lyd enn kilden. Omkodede klipp kuttes nøyaktig på valgte tider.',
  'cut.noteAv': 'Hvert klipp blir en egen fil som starter på 0, og originalfilen endres ikke. Video og lyd kopieres uten kvalitetstap. Videoklipp starter på nærmeste keyframe før valgt start, så de kan bli litt lengre enn valgt.',
  'cut.noteAudio': 'Bare lyd kopierer første lydspor uten omkoding, til et format som passer, for eksempel M4A for AAC.',
  'cut.scClip': 'Hurtigtaster for valgt klipp:', 'cut.scStart': 'start', 'cut.scEnd': 'slutt', 'cut.scPlayback': 'Avspilling:',
  'cut.scSpace': 'Mellomrom', 'cut.scPlay': 'spill av', 'cut.scSecond': 'ett sekund, med', 'cut.scTen': 'ti sekunder',
  'cut.aboutFile': 'Om filen', 'cut.video': 'Video', 'cut.audioStream': 'Lyd', 'cut.subtitles': 'Undertekst', 'cut.cover': 'Omslagsbilde',
  'cut.other': 'Annet', 'cut.fps': '{n} bilder/s', 'cut.channels': '{n} kanaler',

  'join.title': 'Skjøt lyd', 'join.drop': 'Slipp lydfiler her, eller legg til klipp fra køen', 'join.add': 'Legg til filer',
  'join.empty': 'Legg til minst to filer. Videofiler kan også brukes: da skjøtes første lydspor.',
  'join.up': 'Flytt opp', 'join.down': 'Flytt ned', 'join.remove': 'Fjern', 'join.clear': 'Fjern alle', 'join.total': 'Samlet lengde {t}',
  'join.format': 'Lydformat', 'join.start': 'Skjøt {n} filer', 'join.reading': 'Leser filen',
  'join.lossless': 'Filene har samme format og kan skjøtes uten omkoding.',
  'join.mismatch': 'Filene har ulike formater, så de må kodes om. Velg et lydformat.',
  'join.note': 'Original skjøter uten omkoding. Med MP3, AAC og Opus kan det gi et lite klikk der filene møtes. Velg et format å kode om til hvis du vil ha sømløse overganger.',
  'join.noteFormat': 'MP3, M4A og Opus kodes om med høy kvalitet og spilles nesten overalt. FLAC og WAV gir ikke bedre lyd enn kilden.',
  'join.noAudio': 'Ingen lyd', 'join.added': 'Lagt til i Skjøt', 'q.addToJoin': 'Legg til i Skjøt',
  'set.title': 'Innstillinger', 'set.language': 'Språk', 'set.tools': 'Verktøy',
  'set.toolsNote': 'Appen laster ned verktøyene fra utgivernes GitHub-sider og kontrollerer sjekksummene. yt-dlp bruker Deno for YouTube.',
  'set.missing': 'Mangler', 'set.notWorking': 'Virker ikke', 'set.custom': 'valgt av deg', 'set.managed': 'installert av appen',
  'set.system': 'fra systemet', 'set.srcMissing': 'mangler', 'set.chooseFile': 'Velg fil', 'set.useDefault': 'Bruk standard',
  'set.install': 'Installer det som mangler', 'set.update': 'Oppdater yt-dlp', 'set.allInstalled': 'Alle verktøy er installert.',
  'set.folders': 'Mapper', 'set.downloads': 'Nedlastinger', 'set.clips': 'Klipp', 'set.sameFolder': 'Samme mappe som originalfilen',
  'set.chooseFolder': 'Velg mappe', 'set.useOriginal': 'Bruk originalmappen', 'set.defaults': 'Standardvalg for nedlasting',
  'set.quality': 'Kvalitet', 'set.videoFormat': 'Videoformat', 'set.audioFormat': 'Lydformat', 'set.simultaneous': 'Samtidige nedlastinger',
  'set.thumbnail': 'Bygg inn miniatyrbilde i filen',

  'info.close': 'Lukk',

  'err.toolMissing': '{tool} mangler. Installer verktøyene under Innstillinger.',
  'err.unsupported': 'Automatisk installasjon støttes ikke på dette systemet.',
  'err.noChecksum': 'Fant ikke sjekksum for {label}.',
  'err.badChecksum': 'Sjekksummen for {label} stemmer ikke. Filen er forkastet.',
  'err.unpack': 'Utpakking av {label} feilet: {detail}', 'err.notInArchive': 'Fant ikke {tool} i arkivet.',
  'err.fetch': 'Kunne ikke hente {url} (HTTP {status}).', 'err.download': 'Kunne ikke laste ned {label} (HTTP {status}).',
  'err.noDuration': 'Filen har ingen lesbar varighet.', 'err.read': 'Kunne ikke lese filen: {detail}',
  'err.badUrl': 'Lim inn en gyldig nettadresse.', 'err.httpOnly': 'Bare adresser som starter med http eller https kan lastes ned.',
  'err.playlist': 'Dette er en spilleliste. Spillelister støttes ikke ennå, så lim inn adressen til én video.',
  'err.ytdlpSilent': 'yt-dlp stoppet uten feilmelding.', 'err.timeout': 'Nettstedet svarte ikke innen 90 sekunder.',
  'err.noFile': 'Nedlastingen ble ferdig, men yt-dlp oppga ingen fil.', 'err.stopped': 'Stoppet',
  'err.badTimes': 'Start og slutt må være gyldige tider.', 'err.outside': 'Klippet må ligge innenfor filens lengde.',
  'err.order': 'Slutt må komme etter start.', 'err.noAudio': 'Filen har ingen lyd.',
  'err.cut': 'FFmpeg klarte ikke å klippe filen: {detail}', 'err.clipCount': 'Velg mellom 1 og {max} klipp.',
  'err.joinNoAudio': '{name} har ingen lyd.', 'err.joinCount': 'Velg mellom 2 og {max} filer.',
  'err.joinMismatch': 'Filene har ulike lydformater. Velg et format å kode om til.', 'err.join': 'FFmpeg klarte ikke å skjøte filene: {detail}',
  'note.joinCopy': 'Skjøtet uten omkoding.', 'note.joinEncode': 'Skjøtet og kodet om.', 'job.join': 'Skjøt {n} filer ({fmt})', 'file.joined': 'skjøtet',
  'err.joinEffectsOriginal': 'Effekter krever omkoding. Velg et annet lydformat enn Original.',
  'err.crossfadeTooLong': 'Krysstoningen må være kortere enn den korteste filen ({s} s).',
  'set.updateFfmpeg': 'Oppdater FFmpeg',
  'join.effects': 'Effekter', 'join.speed': 'Hastighet', 'join.speedN': 'Hastighet for fil {n}', 'join.setAll': 'Sett alle til', 'join.speedAll': 'Hastighet for alle filer', 'join.choose': 'Velg', 'join.trim': 'Fjern stillhet i starten og slutten av hver fil',
  'join.normalize': 'Utjevn lydnivået', 'join.fadeIn': 'Fade inn', 'join.fadeOut': 'Fade ut', 'join.crossfade': 'Krysstoning mellom filene',
  'join.none': 'Ingen', 'join.seconds': '{s} s', 'join.tags': 'Tittel og artist', 'join.titleField': 'Tittel', 'join.artist': 'Artist',
  'join.cover': 'Ta med omslagsbilde fra første fil som har det (MP3, M4A og FLAC)',
  'join.effectsNote': 'Effekter krever omkoding, så Original er ikke tilgjengelig når en effekt er på.',
  'join.preview': 'Lytt til resultatet', 'join.previewing': 'Lager forhåndsvisning, {p} %', 'join.previewStop': 'Stopp',
  'join.previewOld': 'Valgene er endret siden denne forhåndsvisningen ble laget.', 'join.length': 'Resultatet blir ca. {t}',
  'cut.zoomIn': 'Zoom inn', 'cut.zoomOut': 'Zoom ut', 'cut.zoomFit': 'Vis alt', 'cut.snap': 'Fest til stillhet',
  'cut.snapTip': 'Start og slutt flyttes til det stilleste punktet innenfor et halvt sekund', 'cut.waveLoading': 'Leser bølgeformen',
  'cut.zoomHint': 'Ctrl + musehjul zoomer, musehjulet flytter.', 'cut.restored': 'Klippene fra forrige gang er hentet frem.', 'cut.reset': 'Start på nytt',
  'err.clipN': 'Klipp {n}: {inner}', 'err.mode': 'Ukjent eksporttype.',
  'note.keyframe': 'Klippet ble {s} s lengre enn valgt, fordi tapsfri klipping må starte på en keyframe.',
  'job.clip': 'Klipp fra {name}', 'job.clipOf': 'Klipp {i} av {n} fra {name}', 'job.audio': '{title} (lyd, {fmt})', 'fmt.original': 'original',
  'inst.downloading': 'Laster ned {label}', 'inst.unpacking': 'Pakker ut {label}', 'inst.ready': 'Verktøyene er klare.', 'inst.stopped': 'Installasjonen stoppet.',
  'dlg.media': 'Video og lyd', 'dlg.all': 'Alle filer', 'file.clip': 'klipp', 'file.audioClip': 'lydklipp', 'unknown': 'ukjent',
};

export type TextKey = Key;
type Vars = Record<string, string | number>;
const TABLES: Record<Language, Record<Key, string>> = { en, nb };
const MARK = '\u0001';

export function isLanguage(v: unknown): v is Language { return v === 'en' || v === 'nb'; }

/** Windows-språk nb, nn eller no gir norsk. Alt annet gir engelsk. */
export function languageFromLocale(locale: string): Language {
  return /^(nb|nn|no)\b/i.test(locale) ? 'nb' : 'en';
}

/** En melding som kan oversettes senere. Brukes for feil, notater og titler fra hovedprosessen. */
export function msg(key: Key, vars: Vars = {}): string {
  return `${MARK}${key}${MARK}${JSON.stringify(vars)}`;
}

export function translate(lang: Language, key: Key, vars: Vars = {}): string {
  const template = TABLES[lang][key] ?? en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    if (v === undefined) return `{${name}}`;
    if (typeof v === 'number') return v.toLocaleString(lang === 'nb' ? 'nb-NO' : 'en-GB', { maximumFractionDigits: 1 });
    return translateMessage(lang, v);
  });
}

/** Oversetter en melding laget med msg. Annen tekst, for eksempel feil fra yt-dlp, vises som den er. */
export function translateMessage(lang: Language, text: string): string {
  const m = text.match(/\u0001([\w.]+)\u0001(\{.*\})$/s);
  if (!m || !(m[1] in en)) return text;
  try { return translate(lang, m[1] as Key, JSON.parse(m[2])); } catch { return text; }
}
