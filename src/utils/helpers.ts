import { UploadedCover } from '../types';

export const API_BASE = '/api';
export const pendingCoversStorageKey = 'film-collection-pending-covers';
export const pendingCoverDatabaseName = 'film-collection-intake';
export const pendingCoverStoreName = 'pending-covers';

export const emptyMovieForm = {
  title: '',
  originalTitle: '',
  alternativeTitle: '',
  countryId: '',
  originalLanguageId: '',
  releaseYear: '',
  releaseDate: '',
  ageRating: '',
  synopsis: '',
  notes: '',
  favorite: false,
  genreIds: [] as string[],
  watchedStatus: 'unwatched',
  watchedDate: '',
  formatId: 'FMT01',
  editionTypeId: 'ED01',
  movieVersionId: '',
  distributorId: '',
  countryEditionId: '',
  locationId: '',
  collectionId: '',
  barcode: '',
  catalogNumber: '',
  editionYear: '',
  condition: 'Excellent',
  region: 'Region A',
  purchasePrice: '',
  estimatedValue: '',
  editionNotes: '',
  imdbId: '',
  tmdbId: '',
  imdbUrl: '',
  tmdbUrl: '',
  posterPath: '',
  discCount: '',
  steelbook: false,
  slipcover: false,
  digibook: false,
  booklet: false,
  posterIncluded: false,
};

export const prepareMobileImage = async (file: File, purpose: 'cover' | 'barcode') => {
  const supportedFormats = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
  const isBrowserCompatible = supportedFormats.includes(file.type.toLowerCase());
  const fallbackMessage = purpose === 'cover'
    ? 'Choose a JPEG photo, or change the phone camera setting to JPEG/Most Compatible and capture the cover again.'
    : 'Choose a JPEG photo or reduce camera resolution and try again.';

  if (typeof createImageBitmap !== 'function') {
    if (!isBrowserCompatible || file.size > 18 * 1024 * 1024) {
      throw new Error(`This camera photo is too large or uses a format this browser cannot prepare. ${fallbackMessage}`);
    }
    return file;
  }

  let imageSource: CanvasImageSource;
  let imageWidth: number;
  let imageHeight: number;
  let releaseImage = () => {};
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    imageSource = bitmap;
    imageWidth = bitmap.width;
    imageHeight = bitmap.height;
    releaseImage = () => bitmap.close();
  } catch {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = objectUrl;
      await image.decode();
      imageSource = image;
      imageWidth = image.naturalWidth;
      imageHeight = image.naturalHeight;
      releaseImage = () => URL.revokeObjectURL(objectUrl);
    } catch {
      URL.revokeObjectURL(objectUrl);
      throw new Error(`The camera photo format (${file.type || 'unknown'}) could not be opened. ${fallbackMessage}`);
    }
  }

  try {
    if (isBrowserCompatible && file.size <= 18 * 1024 * 1024 && imageWidth * imageHeight <= 12_000_000) {
      return file;
    }

    const scale = Math.min(1, 4000 / Math.max(imageWidth, imageHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(imageWidth * scale));
    canvas.height = Math.max(1, Math.round(imageHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error(`Could not prepare the camera photo. ${fallbackMessage}`);
    }
    context.drawImage(imageSource, 0, 0, canvas.width, canvas.height);

    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error(`Could not convert the camera photo to a supported format. ${fallbackMessage}`));
      }, 'image/jpeg', 0.96);
    });
    if (jpeg.size > 18 * 1024 * 1024) {
      throw new Error(`The prepared camera photo is still too large to upload. ${fallbackMessage}`);
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'barcode-photo';
    return new File([jpeg], `${baseName}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    releaseImage();
  }
};

export const rotateImage180 = async (image: Blob, filename: string) => {
  let imageSource: CanvasImageSource | undefined;
  let imageWidth = 0;
  let imageHeight = 0;
  let releaseImage = () => {};
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(image, { imageOrientation: 'from-image' });
      imageSource = bitmap;
      imageWidth = bitmap.width;
      imageHeight = bitmap.height;
      releaseImage = () => bitmap.close();
    } catch {
      imageSource = undefined;
    }
  }
  if (!imageSource) {
    const objectUrl = URL.createObjectURL(image);
    const element = new Image();
    element.src = objectUrl;
    try {
      await element.decode();
      imageSource = element;
      imageWidth = element.naturalWidth;
      imageHeight = element.naturalHeight;
      releaseImage = () => URL.revokeObjectURL(objectUrl);
    } catch (error) {
      URL.revokeObjectURL(objectUrl);
      throw error;
    }
  }

  try {
    if (!imageSource) {
      throw new Error('Could not decode the saved cover image.');
    }
    const scale = Math.min(1, 4000 / Math.max(imageWidth, imageHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(imageWidth * scale));
    canvas.height = Math.max(1, Math.round(imageHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not rotate this cover in the browser.');
    }
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate(Math.PI);
    context.drawImage(imageSource, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);

    const rotatedImage = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not create the rotated cover image.'));
      }, 'image/jpeg', 0.96);
    });
    const baseName = filename.replace(/\.[^.]+$/, '') || 'cover';
    return new File([rotatedImage], `${baseName}-rotated.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } finally {
    releaseImage();
  }
};

export const withPendingCoverStore = async <T,>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => new Promise((resolve, reject) => {
  const openRequest = indexedDB.open(pendingCoverDatabaseName, 1);
  openRequest.onupgradeneeded = () => {
    openRequest.result.createObjectStore(pendingCoverStoreName);
  };
  openRequest.onerror = () => reject(openRequest.error || new Error('Could not open browser storage for the captured cover.'));
  openRequest.onsuccess = () => {
    const database = openRequest.result;
    const transaction = database.transaction(pendingCoverStoreName, mode);
    const request = operation(transaction.objectStore(pendingCoverStoreName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not access the saved camera photo.'));
    transaction.onabort = () => reject(transaction.error || new Error('Browser storage aborted while saving the camera photo.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  };
});

export const persistPendingCover = async (slot: 'front' | 'back', file: File) => {
  await withPendingCoverStore('readwrite', (store) => store.put(file, slot));
};

export const readPendingCovers = async () => {
  const [front, back] = await Promise.all([
    withPendingCoverStore('readonly', (store) => store.get('front')),
    withPendingCoverStore('readonly', (store) => store.get('back')),
  ]);
  return [front, back] as [File | undefined, File | undefined];
};

export const removePendingCover = async (slot: 'front' | 'back') => {
  await withPendingCoverStore('readwrite', (store) => store.delete(slot));
};

export const coverReference = (coverPath: string): UploadedCover => ({
  filename: coverPath.split('/').pop() || '',
  path: coverPath,
});

export function isValidRetailBarcode(value: string) {
  const digitsOnly = value.replace(/\s+/g, '');
  if (!/^\d+$/.test(digitsOnly) || ![8, 12, 13, 14].includes(digitsOnly.length)) {
    return false;
  }

  const digits = digitsOnly.split('').map(Number);
  const checkDigit = digits.pop();
  const weightedSum = digits.reverse().reduce(
    (sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1),
    0,
  );

  return (10 - (weightedSum % 10)) % 10 === checkDigit;
}
