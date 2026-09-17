# Play Store listing material

Everything in this folder is generated, so it can be regenerated rather than
edited by hand:

    node scripts/make-icons.mjs             # icon-512.png, feature-graphic-1024x500.png
    npm run build && npx vite preview --port 4173 &
    node scripts/make-store-screenshots.mjs # screenshots/

| File | Where it goes | Play's requirement |
| --- | --- | --- |
| `icon-512.png` | Store listing → App icon | 512×512 PNG, full-bleed square. Play applies its own rounded mask, so this one is deliberately not rounded. |
| `feature-graphic-1024x500.png` | Store listing → Feature graphic | 1024×500, no transparency. |
| `screenshots/*.png` | Store listing → Phone screenshots | 1080×1920 each. Play wants at least two; there are five. |

## Listing text

**App name** (30 characters maximum — this is 28):

    FormReady: Exam Photo & Sign

The launcher label stays the shorter `FormReady`, because Android truncates
long labels under the icon. The two are separate fields and are allowed to
differ.

**Short description** (80 characters maximum):

    Exam photos, signatures and PDFs at the exact size the form asks for.

**Full description**:

    Applying for SSC, UPSC, IBPS or a state exam? Every form wants a photo and
    a signature at an exact pixel size and under an exact file size, and a
    rejected upload can cost you the application.

    FormReady makes files that fit, on your own phone.

    PICK YOUR EXAM
    Choose SSC CGL, UPSC CSE, IBPS PO, RRB NTPC, DSSSB or another listed exam
    and every document opens already set to the size that exam asks for. You
    can check and edit any number before the file is made — exam notifications
    change, and yours is the one that counts.

    PHOTOS
    Crop to the exact pixel size, land inside the size range, and see the
    requirement confirmed before you upload.

    SIGNATURES
    Photograph a signature or sign on the screen with a finger. FormReady
    trims the paper away, keeps the ink black where the form requires it, and
    hits both the size floor and the size ceiling.

    PDFs
    Compress a document to fit a stated limit while keeping it as sharp as
    that limit allows, merge several files into one, or split one into pages.

    NOTHING LEAVES YOUR PHONE
    FormReady has no servers and does not request internet permission, so it
    cannot send your files anywhere even if it wanted to. No account, no
    sign-in, no analytics, no advertising. Everything happens on your device,
    and it all works with the phone offline.

**Privacy policy URL** — after enabling GitHub Pages for the `docs/` folder:

    https://kush256.github.io/FormReady/privacy-policy.html
