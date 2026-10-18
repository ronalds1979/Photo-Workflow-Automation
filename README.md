# Film Collection

Film Collection is a single-user catalog for physical movie editions. The service binds to all network interfaces so the owner can use it from a phone on the same trusted local network. It is not intended to be exposed to the public internet.

## Run locally

1. Install the current Node.js LTS release.
2. Run `npm install`.
3. Copy `.env.example` to `.env`, then set any API keys you use.
4. Run `npm run db:push` once to initialize the SQLite database.
5. Run `npm run dev`.
6. Open `http://localhost:5173/` on the computer, or the computer's LAN IP with port `5173` on a phone connected to the same network.

Movie intake follows three steps. First, **Scan barcode** opens the phone camera and **Choose barcode photo** selects a barcode image. The scanner reads supported retail codes, checks EAN/UPC digits, and looks up the exact code in the local catalog and available product/movie metadata providers. Alternatively, enter a title and choose **Look up metadata**. Review the matches and apply the correct movie metadata before continuing; if the code or title has no provider match, correct it or enter the movie details manually.

Second, **Capture front/back cover** opens the phone camera and **Choose front/back cover from photos** opens the photo library. Each image is saved immediately as an orientation-corrected JPEG and previewed; cover images are stored with the edition and are not OCR-scanned for text or barcodes. The upload-retry copy is persisted in browser IndexedDB in case the camera handoff reloads the page. If a cover is upside down, use **Rotate 180°** below its preview. Replacing or rotating a cover keeps the last successfully saved image until its replacement succeeds; failed uploads retain the chosen file and offer a retry action.

Third, enter any remaining movie or physical-edition details and save. Both front and back cover photos must be saved before the edition can be added to the collection. A barcode image can still use OCR as a fallback for reading digits; this is separate from cover-photo storage and does not extract movie text from the covers.

Catalog fields use searchable name-based suggestions for movie and edition countries, original language, age rating, condition, and disc region. Movie genres are stored as linked catalog values (GEN01–GEN18) and can be selected in the movie form or used to filter the collection. Common formats, edition types, watched states, and movie cuts use pick-lists. You can type a custom value when a suggestion is missing. Distributor, collection, and storage location are free-text names because these are personal catalog values; external IMDb/TMDb identifiers and links are grouped under an optional advanced section.

The navigation includes a Home button for the dashboard. Dashboard movie entries and catalog/edition lists display the Portuguese alternative title first and are alphabetized by that displayed title; the Spanish and original titles remain visible as supporting text in the collection. The dashboard summary cards open the corresponding catalog table. In the Collection library, choose Movies, Editions, Favorites, or Unwatched to change the view; search checks the movie title, original title, and alternative title, and the genre filter narrows the results. Switch from **List** to **Posters** for horizontally browsable, genre-grouped carousels that use each edition's front cover or fall back to the TMDb poster. Selecting a poster opens the movie and its physical edition for editing. **Save changes** updates the existing movie and edition without creating duplicates, and keeps saved cover photos unless you replace them.

The responsive interface keeps desktop navigation and the full collection table on larger screens. Phones and small tablets use a persistent Home/Add movie/Collection navigation bar, stacked intake forms, touch-sized controls, and compact collection cards; the poster carousels remain horizontally swipeable. All views use the same catalog, filters, edit forms, and save actions.

If a camera scan returns a server error, the intake page now displays the HTTP status and a short response diagnostic; server-side image-processing failures include a reference ID for matching the local API log. The barcode decoder bounds its working image dimensions to avoid excessive memory use with high-resolution phone photos.

TMDb accepts either `TMDB_API_KEY` (v3 query-key authentication) or `TMDB_READ_ACCESS_TOKEN` (Bearer authentication); if both are set, the Read Access Token is preferred. OMDb is the IMDb-linked data source used by this application; the application does not scrape IMDb pages. Keep credentials only in the local, git-ignored `.env` file and restart the server after editing it.

Prices are entered and exported as EUR.

## Manual backup and export

The **Export catalog JSON** button on the Collection page downloads a portable JSON export of movie and edition metadata.

For a complete backup, including cover images:

1. Stop the app with `Ctrl+C` in the terminal running `npm run dev`.
2. Copy `prisma/film_catalog.db` and the complete `uploads` folder to a dated backup folder or external drive. Keep the JSON export as an additional readable copy of the catalog.
3. Store the backup somewhere separate from this computer. Treat it as private collection data.

To restore a full backup, stop the app, replace `prisma/film_catalog.db` and `uploads` with the saved copies, then run `npm run dev` again. Keep the original files until the restored collection and cover images have been checked.

## Image and metadata integration tests

Run `npm test` for the project test suite. Image integration tests use local sample DVD covers from the current user's `Pictures` folder when those samples are present. Set `OCR_SAMPLE_DIR` to a different folder containing the named test samples to run them elsewhere:

```powershell
$env:OCR_SAMPLE_DIR = 'C:\path\to\sample-covers'
npm run test:ocr
```

The tests look for `A. I. Inteligencia artificial - Capa.jpg`, `A. I. Inteligencia artificial - Contracapa.jpg`, `American Beauty - Capa.jpg`, and `Gladiator - Capa.jpg`. The samples are not copied into the project. Tests check barcode reading, front/back photo uploads, metadata lookup, and catalog storage. OCR unit coverage is retained only for the scanner's barcode-digit fallback; cover uploads are not OCR-processed by the intake workflow. To include a live lookup with the credentials in `.env`, run:

```powershell
$env:OCR_SAMPLE_DIR = 'C:\Users\ronal\Pictures'
node --env-file=.env tests/run-e2e.js
```
