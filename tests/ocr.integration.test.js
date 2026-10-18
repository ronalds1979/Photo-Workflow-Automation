import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { recognizeBarcode, terminateOcrWorker } from '../server/ocr.js';

const sampleDirectory = process.env.OCR_SAMPLE_DIR || path.join(os.homedir(), 'Pictures');
const barcodeSamples = [
  {
    fileName: 'A. I. Inteligencia artificial - Contracapa.jpg',
    barcode: '7892110026512',
  },
  {
    fileName: 'Gladiator - Contracapa.jpg',
    barcode: '8414533007269',
  },
];

const availableSamples = [];
for (const sample of barcodeSamples) {
  const filePath = path.join(sampleDirectory, sample.fileName);
  try {
    await access(filePath);
    availableSamples.push({ ...sample, filePath });
  } catch {
    // The integration suite remains portable without local sample photos.
  }
}

test('barcode scanner sample set is available', { skip: availableSamples.length === 0 }, () => {
  assert.ok(availableSamples.length > 0);
});

for (const sample of availableSamples) {
  test(`barcode scanner reads ${sample.barcode}`, async () => {
    const result = await recognizeBarcode(sample.filePath);
    assert.equal(result.barcode, sample.barcode);
    assert.equal(result.barcodeValidated, true);
    assert.ok(['zxing', 'ocr'].includes(result.barcodeSource));
    assert.equal('text' in result, false, 'barcode scanning must not expose cover text');
  });
}

after(async () => {
  await terminateOcrWorker();
});
