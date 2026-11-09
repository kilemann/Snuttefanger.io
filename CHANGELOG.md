# Changelog

The project uses [semantic versioning](https://semver.org/).

## 0.8.0 (2026-11-09)

### Added
- Quick download can download video as well as MP3. Choose under Download as. Video uses the file format chosen under Settings (MP4 by default).
- Open in Cut when the download is done: the file opens in Cut by itself, ready to cut. If several finish at the same time, the last one pasted is opened.

### Changed
- Quick MP3 is now called Quick download. The choices are remembered.

## 0.7.1 (2026-11-08)

### Added
- Quick MP3 at the top of Download: paste a link and the audio is downloaded as MP3 right away to the chosen folder, without Get info. The box is cleared so the next link can be pasted at once.

### Changed
- Downloads in the queue get the video title as soon as yt-dlp knows it, instead of the web address.

## 0.7.0 (2026-11-07)

### Added
- Installer for Windows. It installs for your user only, without administrator rights, with shortcuts on the desktop and in the Start menu. There is also a ZIP version that runs without installing.
- Notice when a new version of Snuttefanger is available, with Download and Not now. It can be turned off under Settings.
- Reminder when yt-dlp is more than 30 days old, with a button to update it.
- New app icon: film strip, cassette and scissors.
- Export and add to Join: the clips are exported and added to Join in order when they are done.
- Undo and redo in Cut, with buttons or Ctrl+Z and Ctrl+Y.
- Names for clips. A name becomes the file name.

### Changed
- The app starts much faster. The portable exe unpacked 110 MB every time it started, and is replaced by the installer and the ZIP version.

## 0.6.1 (2026-11-05)

### Changed
- Speed in Join is chosen for each file, so one file can play at 1x and the next at 1.25x. "Speed for all files" sets the same speed for every file at once.

## 0.6.0 (2026-11-05)

### Added
- Waveform in the Cut tab, with zoom (buttons or Ctrl + scroll wheel) and scrolling when zoomed in.
- Snap to silence: start and end move to the quietest point within half a second when set with the keys, the buttons or the handles.
- The clips for each file are remembered and restored the next time you open it, with a button to start over.
- Join effects: speed 0.5x to 2x without changing the pitch, remove silence at the start and end of each file, even out the volume (EBU R128), fade in, fade out and crossfade between files.
- Title, artist and cover art on joined files. Cover art is taken from the first file that has it (MP3, M4A and FLAC).
- Listen to the result in Join before exporting. The preview is made the same way as the export.
- Update FFmpeg button under Settings.

### Changed
- On Windows the app uses the shared FFmpeg build. It takes about 190 MB instead of 340 MB on disk and is about 90 MB to download. Choose Update FFmpeg under Settings to switch an existing installation.

## 0.5.0 (2026-11-05)

### Added
- New Join menu for audio. Add audio files, or video files whose first audio track is used, put them in order and join them into one file.
- Files with the same codec, sample rate and channels are joined without re-encoding. Otherwise the app explains why and re-encodes to the format you choose (MP3 by default).
- "Add to Join" button on finished audio clips and downloads in the queue.

## 0.4.0 (2026-11-05)

### Added
- Choose the audio format for each audio clip: Original (no re-encoding), MP3, M4A, Opus, FLAC or WAV. This also works when cutting audio files, for example FLAC to MP3.
- Re-encoded audio clips are cut exactly at the selected times. MP3 uses LAME V0, M4A uses AAC at 256 kbit/s and Opus uses 192 kbit/s.
- MP3, M4A and FLAC clips keep the cover art.

## 0.3.0 (2026-11-05)

### Added
- Choose Video and audio or Audio only for each clip in the Cut tab. Audio only copies the first audio track without re-encoding into a matching container, for example M4A for AAC and OPUS for Opus.
- English and Norwegian. Choose the language under Settings. The first time, the app follows the Windows language. Messages, job titles and clip file names follow the choice.
- The download page has a language switch.
- The settings page says "All tools are installed" when there is nothing to install.

### Changed
- The download choices (video and audio, or audio only) are visible before you get info.
- The documentation is in English.
- Clip files are named "(clip …)" and "(audio clip …)" in English, and "(klipp …)" and "(lydklipp …)" in Norwegian.

## 0.2.0 (2026-11-05)

### Added
- Choose 1 to 10 clips from the same file. Each clip is exported to its own file.
- Info button next to the version number, with help and version history.

### Changed
- App name and version are shown at the top left.
- FLAC clips are re-encoded as FLAC. This is mathematically lossless and gives the right length and a start at 0.

### Fixed
- Clips from files with cover art kept the timestamps of the original, so playback did not start at 0.

### Known limitation
- Clips from MKV files do not keep the cover art.

## 0.1.0 (2026-11-04)

### Added
- Download single videos with yt-dlp, with a choice of quality and format.
- Queue with pause, resume, cancel and retry.
- Lossless cut of one segment with FFmpeg.
- Open local files with the file picker or drag and drop.
- Preview, clip strip and keyboard shortcuts.
- Installation of yt-dlp, FFmpeg and Deno with checksum verification.
- Settings for folders, defaults and tool paths.
- Portable Windows build in GitHub Actions.
