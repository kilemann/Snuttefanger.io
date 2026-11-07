# Snuttefanger

Download video and audio, and cut clips without losing quality. A Windows app in English and Norwegian, built with Electron, yt-dlp and FFmpeg.

Status: version 0.3. See the [specification](docs/SPEC.md) and the [changelog](CHANGELOG.md).

## Using the app

1. Download the installer from the [download page](https://kilemann.github.io/Snuttefanger.io/) or from [Releases](https://github.com/kilemann/Snuttefanger.io/releases). It installs for your user without administrator rights. A ZIP version that runs without installing is also available.
2. Start it. Windows SmartScreen may warn you because the app is not code-signed. Choose More info, then Run anyway.
3. Go to **Settings** and choose **Install missing tools**. The app downloads yt-dlp, FFmpeg and Deno and verifies their checksums.

## Development

Requires Node.js 22.

```
npm install
npm start
npm test
npm run test:integration
npm run dist
```

The integration test downloads the real tools, about 400 MB. `npm run dist` builds the installer and the ZIP version in `release/` and must run on Windows.

When `version` in `package.json` is raised and pushed to `main`, GitHub Actions builds the installer and the ZIP version, tests the packaged and the installed app on Windows and creates the release. The download page always links to the exe in the latest release.

## Copyright

Videos on YouTube and other websites may be protected by copyright and terms of use. You are responsible for having the right to download and use the content.

## License and tools

The code is [MIT licensed](LICENSE). yt-dlp, FFmpeg and Deno are not included in the repository or the exe. They are downloaded from their publishers and have their own licenses. The FFmpeg build that is downloaded is GPL licensed.
