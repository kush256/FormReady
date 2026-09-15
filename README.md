# FormReady

FormReady prepares photos, signatures and PDFs for online forms — exact pixel
dimensions, exact file sizes, merged/split/compressed PDFs — entirely on the
device. No document ever leaves the phone.

## Product structure (locked)

- **Smart Photo** — flagship guided workflow: pick a target (a passport-photo
  preset or a custom width/height/max-size), take or choose a photo, frame it
  with pan/zoom cropping, and FormReady compresses it to fit exactly.
- **Quick Tools** (six, no more):
  1. Signature Maker
  2. Image to PDF
  3. Resize Photo
  4. Compress PDF
  5. Merge PDF
  6. Split PDF

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4 (design tokens in `src/index.css`)
- React Router (`HashRouter`, so it works from a `file://`/Capacitor origin)
- Capacitor 8 for the Android shell, camera/gallery access, filesystem writes
  and the native share sheet
- `pdf-lib` for PDF creation/merge/split, `pdfjs-dist` for page
  rendering/thumbnails — both run in the WebView, no server involved

All processing (image cropping/resizing/compression, PDF build/merge/split/
compression) happens with the Canvas API, `pdf-lib` and `pdfjs-dist` in the
WebView. The app requests no `INTERNET` permission and makes no network
calls.

## Development

```bash
npm install
npm run dev        # web dev server
npm run build       # type-check + production web build
npm run lint         # oxlint
```

## Android

```bash
npm run build
npx cap sync android
npx cap open android   # or: cd android && ./gradlew assembleDebug
```

App id: `com.formready.app`. Icons/splash live under
`android/app/src/main/res/`; a 512×512 Play Store icon is in
`store-assets/icon-512.png`.

CI (`.github/workflows/android-build.yml`) type-checks, builds the web
bundle, and assembles a debug APK on every push/PR.

## Core libraries

- `src/lib/image.ts` — crop rendering, binary-search JPEG/WEBP compression to
  a byte budget, background whitening for signatures
- `src/lib/pdf.ts` — image→PDF, merge, page extraction, and size-targeted PDF
  compression (rasterizes pages at decreasing scale/quality until the file
  fits the target — the standard on-device approach for a guaranteed size
  cap; text stops being selectable on rasterized pages)
- `src/lib/picker.ts` — camera capture (native Capacitor Camera plugin, or a
  browser file input as a dev fallback) and gallery/document pickers
- `src/lib/file.ts` — save-and-share via Capacitor Filesystem + Share, with a
  plain browser download fallback for web testing
- `src/components/ImageCropper.tsx` — pan/pinch/wheel crop tool used by Smart
  Photo, Signature Maker and Resize Photo
