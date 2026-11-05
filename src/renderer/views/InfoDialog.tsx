import { useEffect, useRef } from 'react';
import type { Language } from '../../shared/i18n';
import { getLanguage, t } from '../i18n';

interface Content { title: string; intro: (v: string) => string; sections: [string, string[]][]; versionsTitle: string; versions: [string, string][] }

const CONTENT: Record<Language, Content> = {
  en: {
    title: 'About Snuttefanger',
    intro: (v) => `Version ${v}. Snuttefanger downloads video and audio, and cuts files without losing quality.`,
    sections: [
      ['Downloading', [
        'Paste an address under Download and select Get info.',
        'Choose Video and audio or Audio only, then quality, format and folder, and select Download.',
        'Follow the download under Queue. There you can pause, resume or cancel.',
      ]],
      ['Cutting', [
        'Open a file under Cut, drop a file on the window, or select Open in cutter under Queue.',
        'Choose the number of clips, from 1 to 10. Each clip becomes its own file.',
        'Choose Video and audio or Audio only for each clip. Audio only copies the first audio track without re-encoding.',
        'For audio clips, choose the audio format. Original keeps the audio unchanged. MP3, M4A and Opus play almost everywhere, but cost a little quality.',
        'Select the clip you are working on, and set start and end with the buttons, the keys or the strip.',
        'The waveform shows where there is sound. Zoom with the + and − buttons or Ctrl + scroll wheel. Snap to silence moves start and end to the quietest point nearby.',
        'The clips are remembered for each file until you choose Start over.',
        'The original file is never changed. Clips are saved next to it, or in the folder chosen under Settings.',
      ]],
      ['Joining audio', [
        'Add files under Join, or select Add to Join on finished audio clips in the queue.',
        'Put the files in order with the arrows, choose the audio format and select Join.',
        'Files with the same format are joined without re-encoding. Otherwise they are re-encoded to the format you choose.',
        'Choose the speed for each file next to it in the list, or for all files at once under Effects.',
        'Effects: speed, remove silence, even out the volume, fade and crossfade. Effects always need re-encoding.',
        'Select Listen to the result to hear the result before you export it.',
      ]],
      ['Good to know', [
        'Lossless cutting of video has to start on a keyframe, so a clip can be slightly longer than selected. The queue tells you when this happens.',
        'Clips from MKV files do not keep the cover art.',
        'FLAC and WAV from websites do not sound better than the source.',
        'The app gets yt-dlp, FFmpeg and Deno itself under Settings. Update yt-dlp there if downloads stop working.',
        'You can switch between English and Norwegian under Settings.',
        'Only download content you have the right to use.',
      ]],
      ['Keyboard shortcuts in the cutter', [
        'Space: play or pause.',
        'I and O: set start and end of the selected clip.',
        'Left and right arrow: one second. With Shift: ten seconds.',
      ]],
    ],
    versionsTitle: 'Versions',
    versions: [
      ['v0.6.1', 'Speed in Join is chosen for each file.'],
      ['v0.6.0', 'Waveform with zoom and snap to silence. Clips are remembered. Join effects, title and artist, and listening before export. Smaller FFmpeg.'],
      ['v0.5.0', 'New Join menu: join audio files into one, without re-encoding when the formats match.'],
      ['v0.4.0', 'Choose the audio format for each audio clip: Original, MP3, M4A, Opus, FLAC or WAV.'],
      ['v0.3.0', 'Choose Video and audio or Audio only for each clip. Download choices are visible right away. English and Norwegian.'],
      ['v0.2.0', 'Choose 1 to 10 clips from the same file. Clips start at 0 even when the file has cover art. Info button.'],
      ['v0.1.0', 'First version: download, queue and lossless cutting.'],
    ],
  },
  nb: {
    title: 'Om Snuttefanger',
    intro: (v) => `Versjon ${v}. Snuttefanger laster ned video og lyd, og klipper filer uten kvalitetstap.`,
    sections: [
      ['Slik laster du ned', [
        'Lim inn en adresse under Last ned, og velg Hent info.',
        'Velg Video og lyd eller Bare lyd, deretter kvalitet, format og mappe, og velg Last ned.',
        'Følg nedlastingen under Kø. Der kan du pause, fortsette eller avbryte.',
      ]],
      ['Slik klipper du', [
        'Åpne en fil under Klipp, slipp en fil i vinduet, eller velg Åpne i klipperen under Kø.',
        'Velg antall klipp, fra 1 til 10. Hvert klipp blir en egen fil.',
        'Velg Video og lyd eller Bare lyd for hvert klipp. Bare lyd kopierer første lydspor uten omkoding.',
        'For lydklipp velger du lydformat. Original beholder lyden uendret. MP3, M4A og Opus spilles nesten overalt, men koster litt kvalitet.',
        'Merk hvilket klipp du jobber med, og sett start og slutt med knappene, tastene eller stripen.',
        'Bølgeformen viser hvor det er lyd. Zoom med knappene + og − eller Ctrl + musehjul. Fest til stillhet flytter start og slutt til det stilleste punktet i nærheten.',
        'Klippene huskes for hver fil til du velger Start på nytt.',
        'Originalfilen endres aldri. Klippene lagres ved siden av den, eller i mappen du har valgt under Innstillinger.',
      ]],
      ['Slik skjøter du lyd', [
        'Legg til filer under Skjøt, eller velg Legg til i Skjøt på ferdige lydklipp i køen.',
        'Sett filene i rekkefølge med pilene, velg lydformat og velg Skjøt.',
        'Filer med samme format skjøtes uten omkoding. Ellers kodes de om til formatet du velger.',
        'Velg hastighet for hver fil ved siden av den i listen, eller for alle filene samtidig under Effekter.',
        'Effekter: hastighet, fjern stillhet, utjevn lydnivå, fade og krysstoning. Effekter krever alltid omkoding.',
        'Velg Lytt til resultatet for å høre resultatet før du eksporterer.',
      ]],
      ['Godt å vite', [
        'Tapsfri klipping av video må starte på en keyframe, så klippet kan bli litt lengre enn valgt. Køen viser når det skjer.',
        'Klipp fra MKV-filer får ikke med omslagsbildet.',
        'FLAC og WAV fra nettsteder gir ikke bedre lyd enn kilden.',
        'Appen henter yt-dlp, FFmpeg og Deno selv under Innstillinger. Oppdater yt-dlp der hvis nedlasting slutter å virke.',
        'Du kan bytte mellom norsk og engelsk under Innstillinger.',
        'Last bare ned innhold du har rett til å bruke.',
      ]],
      ['Hurtigtaster i klipperen', [
        'Mellomrom: spill av eller pause.',
        'I og O: sett start og slutt for valgt klipp.',
        'Venstre og høyre pil: ett sekund. Med Shift: ti sekunder.',
      ]],
    ],
    versionsTitle: 'Versjoner',
    versions: [
      ['v0.6.1', 'Hastighet i Skjøt velges for hver fil.'],
      ['v0.6.0', 'Bølgeform med zoom og fest til stillhet. Klippene huskes. Effekter, tittel og artist, og lytting før eksport i Skjøt. Mindre FFmpeg.'],
      ['v0.5.0', 'Ny Skjøt-meny: skjøt lydfiler til én fil, uten omkoding når formatene er like.'],
      ['v0.4.0', 'Velg lydformat for hvert lydklipp: Original, MP3, M4A, Opus, FLAC eller WAV.'],
      ['v0.3.0', 'Velg Video og lyd eller Bare lyd for hvert klipp. Valgene for nedlasting vises med en gang. Norsk og engelsk.'],
      ['v0.2.0', 'Velg 1 til 10 klipp fra samme fil. Klipp starter på 0 også når filen har omslagsbilde. Infoknapp.'],
      ['v0.1.0', 'Første versjon: nedlasting, kø og tapsfritt klipp.'],
    ],
  },
};

export function InfoDialog({ version, onClose }: { version: string; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const c = CONTENT[getLanguage()];
  return (
    <dialog className="info-dialog" ref={ref} aria-labelledby="info-title" onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="info-head">
        <h2 id="info-title">{c.title}</h2>
        <button className="btn" onClick={onClose}>{t('info.close')}</button>
      </div>
      <div className="info-body">
        <p>{c.intro(version)}</p>
        {c.sections.map(([heading, items]) => (
          <div key={heading}>
            <h3>{heading}</h3>
            <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        ))}
        <h3>{c.versionsTitle}</h3>
        <div className="versions">
          {c.versions.map(([v, text]) => <div key={v} style={{ display: 'contents' }}><b>{v}</b><span>{text}</span></div>)}
        </div>
      </div>
    </dialog>
  );
}
