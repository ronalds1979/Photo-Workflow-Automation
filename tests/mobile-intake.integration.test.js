import assert from 'node:assert/strict';
import { readFile, access, unlink } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { terminateOcrWorker } from '../server/ocr.js';

const sampleDirectory = process.env.OCR_SAMPLE_DIR || path.join(os.homedir(), 'Pictures');
const projectRoot = process.cwd();
const databaseUrl = process.env.DATABASE_URL;
const sampleSet = [
  { slot: 'front', fileName: 'A. I. Inteligencia artificial - Capa.jpg' },
  { slot: 'back', fileName: 'A. I. Inteligencia artificial - Contracapa.jpg' },
];

let samplesAvailable = true;
for (const sample of sampleSet) {
  try {
    await access(path.join(sampleDirectory, sample.fileName));
  } catch {
    samplesAvailable = false;
  }
}

test('mobile intake reads barcodes, enriches titles, and saves front/back covers without cover OCR', {
  skip: !samplesAvailable || !databaseUrl,
}, async () => {
  const uploadedPaths = [];
  let server;
  let prisma;

  try {
    const runtime = await import('../server/index.js');
    const app = runtime.app;
    prisma = runtime.prisma;
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const genresResponse = await fetch(`${baseUrl}/api/genres`);
    const genres = await genresResponse.json();
    assert.equal(genresResponse.status, 200, JSON.stringify(genres));
    assert.deepEqual(genres.map(({ id, name }) => [id, name]), [
      ['GEN01', 'Action'],
      ['GEN02', 'Adventure'],
      ['GEN03', 'Animation'],
      ['GEN04', 'Comedy'],
      ['GEN05', 'Crime'],
      ['GEN06', 'Documentary'],
      ['GEN07', 'Drama'],
      ['GEN08', 'Fantasy'],
      ['GEN09', 'Science Fiction'],
      ['GEN10', 'Horror'],
      ['GEN11', 'Musical'],
      ['GEN12', 'Romance'],
      ['GEN13', 'Thriller'],
      ['GEN14', 'War'],
      ['GEN15', 'Western'],
      ['GEN16', 'Biography'],
      ['GEN17', 'History'],
      ['GEN18', 'Family'],
    ]);

    const retiredCoverOcrResponse = await fetch(`${baseUrl}/api/ocr`, { method: 'POST' });
    assert.equal(retiredCoverOcrResponse.status, 404, 'cover text extraction is no longer an intake endpoint');
    const retiredBatchIntakeResponse = await fetch(`${baseUrl}/api/batch/intake`, { method: 'POST' });
    assert.equal(retiredBatchIntakeResponse.status, 404, 'batch cover OCR intake is no longer available');

    const uploadedCovers = {};
    for (const sample of sampleSet) {
      const imagePath = path.join(sampleDirectory, sample.fileName);
      const body = new FormData();
      body.append('slot', sample.slot);
      body.append('image', new Blob([await readFile(imagePath)], { type: 'image/jpeg' }), sample.fileName);

      const response = await fetch(`${baseUrl}/api/upload-cover`, { method: 'POST', body });
      const payload = await response.json();
      assert.equal(response.status, 201, JSON.stringify(payload));
      assert.equal(payload.file.slot, sample.slot);
      assert.ok(payload.file.path.startsWith('/uploads/'));
      assert.match(payload.file.filename, /\.jpg$/i, 'saved camera covers should use normalized JPEG images');
      uploadedCovers[sample.slot] = payload.file;
      uploadedPaths.push(path.join(process.cwd(), 'uploads', payload.file.filename));

      const storedImage = await fetch(`${baseUrl}${payload.file.path}`);
      assert.equal(storedImage.status, 200, `${sample.slot} image should be available after upload`);
      assert.ok((await storedImage.arrayBuffer()).byteLength > 0, 'uploaded image response should contain image data');
    }

    assert.ok(
      (await fetch(`${baseUrl}${uploadedCovers.front.path}`)).ok
      && (await fetch(`${baseUrl}${uploadedCovers.back.path}`)).ok,
      'front and back cover uploads should remain available for the saved edition',
    );

    const liveMetadataConfigured = Boolean(
      process.env.TMDB_READ_ACCESS_TOKEN
      || process.env.TMDB_API_KEY
      || process.env.OMDB_API_KEY
      || process.env.IMDB_API_KEY,
    );
    let liveMetadataMatch;
    if (liveMetadataConfigured) {
      const metadataResponse = await fetch(`${baseUrl}/api/search?query=${encodeURIComponent('A.I. Artificial Intelligence')}`);
      const metadataPayload = await metadataResponse.json();
      assert.equal(metadataResponse.status, 200, JSON.stringify(metadataPayload));
      liveMetadataMatch = metadataPayload.results.find(
        (result) => result.id === 644 || result.imdb_id === 'tt0212720',
      );
      assert.ok(liveMetadataMatch, 'live metadata should match A.I. Artificial Intelligence');
    }

    const barcodePhotoPath = path.join(sampleDirectory, 'Gladiator - Contracapa.jpg');
    await access(barcodePhotoPath);
    const barcodeBody = new FormData();
    barcodeBody.append(
      'image',
      new Blob([await readFile(barcodePhotoPath)], { type: 'image/jpeg' }),
      'Gladiator - Contracapa.jpg',
    );
    const barcodeResponse = await fetch(`${baseUrl}/api/barcode/read`, { method: 'POST', body: barcodeBody });
    const barcodeResult = await barcodeResponse.json();
    assert.equal(barcodeResponse.status, 200, JSON.stringify(barcodeResult));
    assert.equal(barcodeResult.barcode, '8414533007269');
    assert.equal(barcodeResult.source, 'zxing');
    assert.equal(barcodeResult.validated, true);

    const nonBarcodeBody = new FormData();
    nonBarcodeBody.append(
      'image',
      new Blob([await readFile(path.join(sampleDirectory, 'American Beauty - Capa.jpg'))], { type: 'image/jpeg' }),
      'American Beauty - Capa.jpg',
    );
    const nonBarcodeResponse = await fetch(`${baseUrl}/api/barcode/read`, { method: 'POST', body: nonBarcodeBody });
    const nonBarcodeResult = await nonBarcodeResponse.json();
    assert.equal(nonBarcodeResponse.status, 200, JSON.stringify(nonBarcodeResult));
    assert.equal(nonBarcodeResult.success, true);
    assert.equal(nonBarcodeResult.found, false);
    assert.match(nonBarcodeResult.message, /close, sharp photo/i);

    const invalidImageBody = new FormData();
    invalidImageBody.append(
      'image',
      new Blob(['not an image'], { type: 'image/jpeg' }),
      'broken-camera-photo.jpg',
    );
    const invalidImageResponse = await fetch(`${baseUrl}/api/barcode/read`, { method: 'POST', body: invalidImageBody });
    const invalidImageResult = await invalidImageResponse.json();
    assert.equal(invalidImageResponse.status, 500);
    assert.equal(invalidImageResult.success, false);
    assert.match(invalidImageResult.requestId, /^[0-9a-f-]{36}$/i);
    assert.match(invalidImageResult.message, /report reference/i);

    const ingestResponse = await fetch(`${baseUrl}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: liveMetadataMatch?.title || 'A. I. Inteligencia artificial',
        genreIds: ['GEN08', 'GEN09'],
        originalTitle: liveMetadataMatch?.original_title || liveMetadataMatch?.originalTitle || 'A.I. Artificial Intelligence',
        alternativeTitle: 'A.I. Inteligência Artificial',
        countryId: 'USA',
        originalLanguageId: 'LNG05',
        releaseYear: Number(String(liveMetadataMatch?.release_date || liveMetadataMatch?.releaseDate || '2001').slice(0, 4)),
        durationMinutes: 146,
        synopsis: liveMetadataMatch?.overview || 'David, um menino-robô programado para amar, é adotado por uma família humana e parte em busca da Fada Azul para se tornar real.',
        ageRating: 'PG-13',
        imdbId: liveMetadataMatch?.imdb_id || 'tt0212720',
        tmdbId: liveMetadataMatch?.id ? String(liveMetadataMatch.id) : '644',
        imdbUrl: liveMetadataMatch?.imdb_id ? `https://www.imdb.com/title/${liveMetadataMatch.imdb_id}/` : 'https://www.imdb.com/title/tt0212720/',
        tmdbUrl: liveMetadataMatch?.id ? `https://www.themoviedb.org/movie/${liveMetadataMatch.id}` : 'https://www.themoviedb.org/movie/644',
        formatId: 'FMT01',
        editionTypeId: 'ED02',
        distributorId: 'DST07',
        countryEditionId: 'BRA',
        editionYear: 2001,
        region: 'Região 4 (NTSC)',
        barcode: '7892110026512',
        discCount: 2,
        frontCoverPath: uploadedCovers.front.path,
        backCoverPath: uploadedCovers.back.path,
        purchasePrice: null,
        estimatedValue: null,
      }),
    });
    const ingestPayload = await ingestResponse.json();
    assert.equal(ingestResponse.status, 201, JSON.stringify(ingestPayload));

    const databaseResponse = await fetch(`${baseUrl}/api/movies`);
    const databaseMovies = await databaseResponse.json();
    assert.equal(databaseMovies.length, 1);
    const storedMovie = databaseMovies[0];
    assert.equal(storedMovie.title, liveMetadataMatch?.title || 'A. I. Inteligencia artificial');
    assert.equal(storedMovie.originalTitle, liveMetadataMatch?.original_title || liveMetadataMatch?.originalTitle || 'A.I. Artificial Intelligence');
    assert.equal(storedMovie.alternativeTitle, 'A.I. Inteligência Artificial');
    assert.equal(storedMovie.releaseYear, Number(String(liveMetadataMatch?.release_date || liveMetadataMatch?.releaseDate || '2001').slice(0, 4)));
    assert.equal(storedMovie.countryId, 'USA');
    assert.equal(storedMovie.originalLanguageId, 'LNG05');
    assert.equal(storedMovie.durationMinutes, 146);
    assert.deepEqual(storedMovie.genres.map(({ id }) => id).sort(), ['GEN08', 'GEN09']);
    assert.equal(storedMovie.imdbId, liveMetadataMatch?.imdb_id || 'tt0212720');
    assert.equal(storedMovie.tmdbId, liveMetadataMatch?.id ? String(liveMetadataMatch.id) : '644');
    assert.equal(storedMovie.editions.length, 1);
    assert.equal(storedMovie.editions[0].barcode, '7892110026512');
    assert.equal(storedMovie.editions[0].formatId, 'FMT01');
    assert.equal(storedMovie.editions[0].editionTypeId, 'ED02');
    assert.equal(storedMovie.editions[0].distributorId, 'DST07');
    assert.equal(storedMovie.editions[0].countryEditionId, 'BRA');
    assert.equal(storedMovie.editions[0].editionYear, 2001);
    assert.equal(storedMovie.editions[0].region, 'Região 4 (NTSC)');
    assert.equal(storedMovie.editions[0].discCount, 2);
    assert.equal(storedMovie.editions[0].frontCoverPath, uploadedCovers.front.path);
    assert.equal(storedMovie.editions[0].backCoverPath, uploadedCovers.back.path);

    const barcodeMetadataResponse = await fetch(`${baseUrl}/api/metadata/barcode?barcode=7892110026512`);
    const barcodeMetadata = await barcodeMetadataResponse.json();
    assert.equal(barcodeMetadataResponse.status, 200, JSON.stringify(barcodeMetadata));
    assert.equal(barcodeMetadata.success, true);
    assert.match(barcodeMetadata.source, /^catalog/);
    assert.ok(
      barcodeMetadata.results.some((result) => result.source === 'catalog' && result.title === storedMovie.title),
      'barcode lookup should resolve the edition to its catalog movie metadata',
    );
    const invalidBarcodeMetadataResponse = await fetch(`${baseUrl}/api/metadata/barcode?barcode=12345`);
    assert.equal(invalidBarcodeMetadataResponse.status, 400);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, options) => {
      const url = input instanceof URL ? input : new URL(typeof input === 'string' ? input : input.url);
      if (url.hostname === 'api.upcitemdb.com') {
        return new Response(JSON.stringify({
          code: 'OK',
          total: 1,
          items: [{ title: 'Barcode Lookup Test Film', description: 'Product found by its UPC.' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, options);
    };
    try {
      const externalBarcodeResponse = await fetch(`${baseUrl}/api/metadata/barcode?barcode=4006381333931`);
      const externalBarcodeMetadata = await externalBarcodeResponse.json();
      assert.equal(externalBarcodeResponse.status, 200, JSON.stringify(externalBarcodeMetadata));
      assert.equal(externalBarcodeMetadata.source, 'upcitemdb');
      assert.equal(externalBarcodeMetadata.results[0].title, 'Barcode Lookup Test Film');
    } finally {
      globalThis.fetch = originalFetch;
    }

    const exportResponse = await fetch(`${baseUrl}/api/export`);
    const exportedCatalog = await exportResponse.json();
    assert.equal(exportedCatalog.currency, 'EUR');
    assert.equal(exportedCatalog.movies.length, 1);
    assert.equal(exportedCatalog.movies[0].editions[0].barcode, '7892110026512');

    const invalidIngestResponse = await fetch(`${baseUrl}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Must not be partially saved', discCount: 'not-a-number' }),
    });
    assert.equal(invalidIngestResponse.status, 400);
    assert.equal((await invalidIngestResponse.json()).message, 'Disc count must be a non-negative whole number.');
    const invalidIdentifierResponse = await fetch(`${baseUrl}/api/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Must not be partially saved', formatId: 1 }),
    });
    assert.equal(invalidIdentifierResponse.status, 400);
    assert.equal((await invalidIdentifierResponse.json()).message, 'formatId must be a text identifier.');
    const moviesAfterInvalidRequests = await (await fetch(`${baseUrl}/api/movies`)).json();
    assert.equal(moviesAfterInvalidRequests.length, 1, 'invalid input must not create a partial catalog record');

    const updateResponse = await fetch(`${baseUrl}/api/movies/${storedMovie.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        editionId: storedMovie.editions[0].id,
        title: 'A.I. Artificial Intelligence (Edited)',
        originalTitle: storedMovie.originalTitle,
        alternativeTitle: storedMovie.alternativeTitle,
        countryId: storedMovie.countryId,
        originalLanguageId: storedMovie.originalLanguageId,
        releaseYear: storedMovie.releaseYear,
        releaseDate: storedMovie.releaseDate,
        ageRating: storedMovie.ageRating,
        synopsis: storedMovie.synopsis,
        notes: 'Updated movie notes',
        favorite: true,
        genreIds: ['GEN04', 'GEN12'],
        watchedStatus: 'watched',
        formatId: storedMovie.editions[0].formatId,
        editionTypeId: storedMovie.editions[0].editionTypeId,
        distributorId: storedMovie.editions[0].distributorId,
        countryEditionId: storedMovie.editions[0].countryEditionId,
        editionYear: storedMovie.editions[0].editionYear,
        region: storedMovie.editions[0].region,
        barcode: storedMovie.editions[0].barcode,
        catalogNumber: storedMovie.editions[0].catalogNumber,
        discCount: storedMovie.editions[0].discCount,
        condition: storedMovie.editions[0].condition,
        purchasePrice: 12.5,
        estimatedValue: storedMovie.editions[0].estimatedValue,
        locationId: storedMovie.editions[0].locationId,
        collectionId: storedMovie.editions[0].collectionId,
        editionNotes: 'Updated edition notes',
        steelbook: storedMovie.editions[0].steelbook,
        slipcover: storedMovie.editions[0].slipcover,
        digibook: storedMovie.editions[0].digibook,
        booklet: storedMovie.editions[0].booklet,
        posterIncluded: storedMovie.editions[0].posterIncluded,
      }),
    });
    const updatedPayload = await updateResponse.json();
    assert.equal(updateResponse.status, 200, JSON.stringify(updatedPayload));
    assert.equal(updatedPayload.movie.title, 'A.I. Artificial Intelligence (Edited)');
    assert.equal(updatedPayload.movie.favorite, true);
    assert.deepEqual((await (await fetch(`${baseUrl}/api/movies`)).json())[0].genres.map(({ id }) => id).sort(), ['GEN04', 'GEN12']);
    assert.equal(updatedPayload.edition.purchasePrice, 12.5);
    assert.equal(updatedPayload.edition.frontCoverPath, uploadedCovers.front.path, 'omitted cover paths must be preserved');
    assert.equal(updatedPayload.edition.backCoverPath, uploadedCovers.back.path, 'omitted cover paths must be preserved');

    const invalidEditionUpdate = await fetch(`${baseUrl}/api/movies/${storedMovie.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editionId: 9999, title: 'Must not update the movie' }),
    });
    assert.equal(invalidEditionUpdate.status, 404);
    const invalidUpdate = await fetch(`${baseUrl}/api/movies/${storedMovie.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editionId: storedMovie.editions[0].id, title: 'Must not update the movie', discCount: -1 }),
    });
    assert.equal(invalidUpdate.status, 400);
    const invalidTitleUpdate = await fetch(`${baseUrl}/api/movies/${storedMovie.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editionId: storedMovie.editions[0].id, title: 123 }),
    });
    assert.equal(invalidTitleUpdate.status, 400);
    const invalidGenreUpdate = await fetch(`${baseUrl}/api/movies/${storedMovie.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ editionId: storedMovie.editions[0].id, title: 'Must not update the movie', genreIds: ['UNKNOWN'] }),
    });
    assert.equal(invalidGenreUpdate.status, 400);
    const finalCatalog = await (await fetch(`${baseUrl}/api/movies`)).json();
    assert.equal(finalCatalog.length, 1, 'editing must not change the number of catalog movies');
    assert.equal(finalCatalog[0].editions.length, 1, 'editing must update, not duplicate, the selected edition');
    assert.equal(finalCatalog[0].title, 'A.I. Artificial Intelligence (Edited)', 'invalid updates must leave the saved movie intact');
    assert.deepEqual(finalCatalog[0].genres.map(({ id }) => id).sort(), ['GEN04', 'GEN12'], 'invalid updates must preserve genre selections');

    for (const title of ['Zulu Sort Test', 'Alpha Sort Test']) {
      const response = await fetch(`${baseUrl}/api/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      assert.equal(response.status, 201, `sort fixture ${title} should be created`);
    }
    const sortedMovies = await (await fetch(`${baseUrl}/api/movies`)).json();
    const sortedTitles = sortedMovies.map(({ title }) => title);
    assert.ok(sortedTitles.indexOf('Alpha Sort Test') < sortedTitles.indexOf('Zulu Sort Test'), 'movie list should be alphabetized by title');
    const sortedEditions = await (await fetch(`${baseUrl}/api/editions`)).json();
    const sortedEditionTitles = sortedEditions.map(({ movie }) => movie.title);
    assert.ok(sortedEditionTitles.indexOf('Alpha Sort Test') < sortedEditionTitles.indexOf('Zulu Sort Test'), 'edition list should be alphabetized by movie title');

  } finally {
    if (server) {
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
    if (prisma) {
      await prisma.$disconnect();
    }
    await terminateOcrWorker();
    await Promise.all(uploadedPaths.map((uploadedPath) => unlink(uploadedPath).catch(() => undefined)));
  }
});
