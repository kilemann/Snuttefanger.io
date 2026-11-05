# Snuttefanger: specification v2

A Windows app that downloads video and audio with yt-dlp and cuts files losslessly with FFmpeg. The app is for private use, but the code is in a public repository. It can also cut files that were not downloaded with the app.

## Decisions

| Topic | Choice | Reason |
|---|---|---|
| Project | New, with our own code | Decided by Kilemann. Bugs are fixed during testing. |
| License | MIT | Requires that we do not copy GPL code. LosslessCut and Parabolic are only used as inspiration. |
| Technology | Electron, TypeScript and React | Fast GUI development and good media support in Chromium. |
| Build | esbuild | Change from v1: the app needs no development server, and esbuild gives one simple build script. Vite can be added if needed. |
| Look | Tidy and dark | Fluent is not required, and the light theme was dropped. |
| Language | English and Norwegian | Decided by Kilemann in v0.3. The main process sends messages as keys, and the GUI translates them when they are shown. |
| Settings | JSON | SQLite is considered first for history in phase 4. |
| FFmpeg, yt-dlp and Deno | Downloaded on first start (shared FFmpeg build on Windows) | Not in the repository or the exe. SHA-256 is verified. yt-dlp is updated separately. |
| Packaging | Portable exe in GitHub Releases | No installer or code signing. SmartScreen may warn. |
| App updates | Notification only | Planned for phase 5. |

Hardware acceleration is postponed until re-encoding exists, and is not part of phase 1.

## Architecture

The main process owns everything that touches files and processes. The GUI runs isolated and talks to the main process through a narrow API.

| Service | Responsibility |
|---|---|
| `ProcessManager` | Starts tools without a shell and stops the whole process tree |
| `JobQueue` | Queue, limits, pause, resume, cancel and retry |
| `BinaryManager` | Finds, downloads and verifies tools |
| `SettingsService` | Validates and stores settings |
| `DownloaderService` | yt-dlp arguments and parsing of its output |
| `MediaProbeService` | ffprobe information about files |
| `ExportService` | Cutting and file names |
| `JoinService` | Joining audio files, lossless or re-encoded, with effects and preview |
| `WaveformService` | Peaks for the waveform, 100 per second |
| `ProjectStore` | Clips remembered per file |

Planned: `WaveformService` in phase 3 and `HistoryService` in phase 4. The timeline belongs in the GUI.

## Known technical facts

- **Pause:** yt-dlp has no real pause. The app stops the process and resumes from the partial file.
- **Preview:** Chromium does not play every format. Such files can be cut by typing times. FFmpeg-based preview is planned for phase 2.
- **Lossless cutting:** A video clip starts on the nearest keyframe before the selected start. The app says so when a clip is longer than selected.
- **Timestamps:** Cover art must be read from a separate input, otherwise FFmpeg keeps the original timestamps. Clips from MKV files lose the cover art.
- **Audio only:** The first audio track is copied into a container that holds the codec unchanged.
- **Audio formats:** FLAC and WAV from websites do not sound better than the source. The GUI says so.
- **YouTube:** yt-dlp uses Deno as its JavaScript runtime.
- **Merging:** Files must have the same codec parameters. This must be checked before export in phase 3.

## Phases

### Phase 1: foundation (v0.1)
App shell, queue, settings, tool installation, download of single videos, opening local files and lossless cut of one segment.

**Done when:** a URL can be downloaded, opened in the cutter and exported. A local file can be cut without a URL. Pause and resume work on Windows.

### Phase 2: cutter (v0.2 and later)
Done in v0.2 and v0.3: up to 10 clips from the same file as separate files, with video and audio or audio only chosen per clip. Remaining:
Timeline with zoom, video-only export, and preview of formats Chromium does not support.

### Phase 3: precision
Done in v0.4 and v0.5: audio format per clip with exact cuts when re-encoding, and joining of audio files with a compatibility check (lossless when possible). Video joining is postponed by Kilemann's decision. v0.6 added the waveform with zoom and snap to silence, remembered clips, and join effects (speed, silence removal, loudness, fades, crossfade) with preview. Remaining: precise mode for video. Smart cut is considered afterwards.

### Phase 4: downloader (v0.5)
Playlists, subtitles, history, cookies for videos that require sign-in, and resuming after a restart. Cookies must never end up in Git or logs.

### Phase 5: finishing (v1.0)
Notification of new versions, icon and bug fixes from testing.

## Testing

Unit and integration tests run on Windows in GitHub Actions. The integration test uses the real tools and a folder with æøå in its name. The packaged app is started on Windows to test tool installation from the GUI. Kilemann tests the rest of the GUI on Windows. Fixed test set: MP4 (H.264), MKV (HEVC), WebM, AVI, MP3 and FLAC.
