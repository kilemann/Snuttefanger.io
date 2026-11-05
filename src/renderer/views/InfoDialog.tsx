import { useEffect, useRef } from 'react';

const VERSIONS: [string, string][] = [
  ['v0.2.0', 'Velg 1 til 10 klipp fra samme fil. Klipp starter nå på 0 også når filen har omslagsbilde. Infoknapp.'],
  ['v0.1.0', 'Første versjon: nedlasting, kø og tapsfritt klipp.'],
];

export function InfoDialog({ version, onClose }: { version: string; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog className="info-dialog" ref={ref} aria-labelledby="info-title" onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="info-head">
        <h2 id="info-title">Om Snuttefanger</h2>
        <button className="btn" onClick={onClose}>Lukk</button>
      </div>
      <div className="info-body">
        <p>Versjon {version}. Snuttefanger laster ned video og lyd, og klipper filer uten kvalitetstap.</p>
        <h3>Slik laster du ned</h3>
        <ul>
          <li>Lim inn en adresse under Last ned, og velg Hent info.</li>
          <li>Velg kvalitet, format og mappe, og velg Last ned.</li>
          <li>Følg nedlastingen under Kø. Der kan du pause, fortsette eller avbryte.</li>
        </ul>
        <h3>Slik klipper du</h3>
        <ul>
          <li>Åpne en fil under Klipp, slipp en fil i vinduet, eller velg Åpne i klipperen under Kø.</li>
          <li>Velg antall klipp, fra 1 til 10. Hvert klipp blir en egen fil.</li>
          <li>Merk hvilket klipp du jobber med, og sett start og slutt med knappene, tastene eller stripen.</li>
          <li>Originalfilen endres aldri. Klippene lagres ved siden av den, eller i mappen du har valgt under Innstillinger.</li>
        </ul>
        <h3>Godt å vite</h3>
        <ul>
          <li>Tapsfri klipping av video må starte på en keyframe, så klippet kan bli litt lengre enn valgt. Køen viser når det skjer.</li>
          <li>Klipp fra MKV-filer får ikke med omslagsbildet.</li>
          <li>FLAC og WAV fra nettsteder gir ikke bedre lyd enn kilden.</li>
          <li>Appen henter yt-dlp, FFmpeg og Deno selv under Innstillinger. Oppdater yt-dlp der hvis nedlasting slutter å virke.</li>
          <li>Last bare ned innhold du har rett til å bruke.</li>
        </ul>
        <h3>Hurtigtaster i klipperen</h3>
        <ul>
          <li>Mellomrom: spill av eller pause.</li>
          <li>I og O: sett start og slutt for valgt klipp.</li>
          <li>Venstre og høyre pil: ett sekund. Med Shift: ti sekunder.</li>
        </ul>
        <h3>Versjoner</h3>
        <div className="versions">
          {VERSIONS.map(([v, text]) => <div key={v} style={{ display: 'contents' }}><b>{v}</b><span>{text}</span></div>)}
        </div>
      </div>
    </dialog>
  );
}
