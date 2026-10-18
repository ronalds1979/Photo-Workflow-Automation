import sharp from 'sharp';
import { createWorker, PSM } from 'tesseract.js';
import {
  BinaryBitmap,
  Code128Reader,
  Code39Reader,
  EAN13Reader,
  HybridBinarizer,
  ITFReader,
  RGBLuminanceSource,
} from '@zxing/library';

let workerPromise;

const getWorker = () => {
  workerPromise ??= createWorker('eng+por+spa').then(async (worker) => {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.AUTO,
      preserve_interword_spaces: '1',
    });
    return worker;
  });

  return workerPromise;
};

export const preprocessBarcodeImage = async (imagePath) => {
  const image = sharp(imagePath, { failOn: 'error' })
    .rotate()
    .resize({
      width: 2400,
      height: 3200,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .flatten({ background: '#ffffff' })
    .grayscale()
    .normalize()
    .sharpen({ sigma: 1.2 })
    .png();

  return image.toBuffer();
};

export const detectBarcode = async (imagePath) => {
  const readers = [
    EAN13Reader,
    Code128Reader,
    Code39Reader,
    ITFReader,
  ];
  const orientedImage = await sharp(imagePath, { failOn: 'error' })
    .rotate()
    .resize({ width: 4000, height: 3200, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  for (const angle of [0, 90, 180, 270]) {
    const { data, info } = await sharp(orientedImage, { failOn: 'error' })
      .rotate(angle)
      .grayscale()
      .normalize()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const luminanceSource = new RGBLuminanceSource(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
    );
    const bitmap = new BinaryBitmap(new HybridBinarizer(luminanceSource));

    for (const Reader of readers) {
      try {
        const result = new Reader().decode(bitmap);
        return { value: result.getText(), format: result.getBarcodeFormat().toString() };
      } catch (error) {
        if (!['NotFoundException', 'FormatException', 'ChecksumException'].includes(error?.name)) {
          throw error;
        }
      }
    }
  }

  return null;
};

export const recognizeBarcode = async (imagePath) => {
  const detectedBarcode = await detectBarcode(imagePath);
  if (detectedBarcode) {
    return {
      barcode: detectedBarcode.value,
      barcodeFormat: detectedBarcode.format,
      barcodeSource: 'zxing',
      barcodeValidated: isValidRetailBarcode(detectedBarcode.value),
    };
  }

  const processedImage = await preprocessBarcodeImage(imagePath);
  const worker = await getWorker();
  const { data } = await worker.recognize(processedImage);
  const barcode = extractBarcodeCandidates(data.text || '')[0] || '';

  return {
    barcode,
    barcodeFormat: barcode ? 'OCR_TEXT' : null,
    barcodeSource: barcode ? 'ocr' : null,
    barcodeValidated: isValidRetailBarcode(barcode),
  };
};

export const extractBarcodeCandidates = (text) => {
  const matches = [...(text || '').matchAll(/(?:\d[\s-]*){8,17}/g)]
    .map((match) => match[0].replace(/\D/g, ''))
    .filter((value) => [8, 12, 13, 14].includes(value.length) && isValidRetailBarcode(value));

  return Array.from(new Set(matches));
};

export const isValidRetailBarcode = (value) => {
  if (!/^\d+$/.test(value) || ![8, 12, 13, 14].includes(value.length)) {
    return false;
  }

  const digits = value.split('').map(Number);
  const checkDigit = digits.pop();
  const weightedSum = digits
    .reverse()
    .reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1), 0);

  return (10 - (weightedSum % 10)) % 10 === checkDigit;
};

export const terminateOcrWorker = async () => {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = undefined;
  }
};
