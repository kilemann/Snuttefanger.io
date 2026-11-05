# Changelog

The project uses [semantic versioning](https://semver.org/).

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
