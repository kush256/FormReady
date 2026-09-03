# FormReady

FormReady prepares PDFs, photos, and signatures for official forms and
applications — compress, merge, and split PDFs; auto-fit biometric/passport
photos; resize photos to exact dimensions; make a clean digital signature;
and turn scans/photos into a PDF. Everything runs **entirely on-device**:
there's no server, no account, and no analytics.

## Run locally

**Prerequisites:** [Android Studio](https://developer.android.com/studio)
(Koala or newer), JDK 17+.

1. Open Android Studio, choose **Open**, and select this project's directory.
2. Let Android Studio sync Gradle (it will download the Gradle/AGP versions
   pinned in `gradle/wrapper/gradle-wrapper.properties` and `gradle/libs.versions.toml`).
3. Run the `app` configuration on an emulator or physical device (minSdk 24).

Debug builds sign with `debug.keystore` at the project root. If that file is
missing, Android Studio (or `./gradlew`) will generate a fresh one
automatically the first time you build.

## Release builds

The `release` build type signs with an upload keystore supplied via
environment variables (see `app/build.gradle.kts`):

```
KEYSTORE_PATH=/path/to/your-upload-key.jks
STORE_PASSWORD=...
KEY_PASSWORD=...
```

Generate an upload key with `keytool -genkeypair -v -keystore my-upload-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`,
then keep that keystore and its passwords somewhere safe — Google Play uses
it to verify every future update to this app.

## Project structure

- `app/src/main/java/com/example/ui/screens` — one file per feature flow
  (Compress/Merge/Split PDF, Smart Photo, Resize Photo, Signature Maker,
  Image to PDF), each a set of Jetpack Compose screens.
- `app/src/main/java/com/example/viewmodel/FormReadyViewModel.kt` — all app
  state and orchestration.
- `app/src/main/java/com/example/util/{PdfProcessor,PhotoProcessor,BitmapLoader,FileHelper}.kt` —
  the actual on-device PDF/image processing. Merging and splitting copy pages
  with [PDFBox-Android](https://github.com/TomRoush/PdfBox-Android) so text stays
  selectable and nothing is re-rendered; compression deliberately rasterizes
  (via Android's `PdfRenderer`) and re-encodes pages as JPEG, which is the only
  step that trades quality for size. `BitmapLoader` bounds every decode so large
  camera images cannot exhaust the heap, and applies EXIF rotation.
- `app/src/main/java/com/example/data` — a small Room database that tracks
  recently prepared documents for the Home screen's history list.

## Privacy

See [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md) — also shown in-app under
**About & Privacy** on the Home screen.
