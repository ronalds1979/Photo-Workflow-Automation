export type Summary = {
  totalMovies: number;
  totalEditions: number;
  favorites: number;
  unwatched: number;
};

export type Movie = {
  id: number;
  title: string;
  originalTitle?: string | null;
  alternativeTitle?: string | null;
  releaseYear?: number | null;
  releaseDate?: string | null;
  countryId?: string | null;
  durationMinutes?: number | null;
  synopsis?: string | null;
  originalLanguageId?: string | null;
  ageRating?: string | null;
  favorite?: boolean;
  watchedStatus?: string | null;
  rewatchFlag?: boolean;
  watchedDate?: string | null;
  notes?: string | null;
  posterPath?: string | null;
  imdbId?: string | null;
  tmdbId?: string | null;
  imdbUrl?: string | null;
  tmdbUrl?: string | null;
  genres?: Genre[];
  editions?: Edition[];
};

export type Genre = {
  id: string;
  name: string;
};

export type Edition = {
  id: number;
  movieId: number;
  formatId?: string | null;
  editionTypeId?: string | null;
  movieVersionId?: string | null;
  distributorId?: string | null;
  countryEditionId?: string | null;
  editionYear?: number | null;
  region?: string | null;
  barcode?: string | null;
  catalogNumber?: string | null;
  steelbook?: boolean;
  slipcover?: boolean;
  digibook?: boolean;
  booklet?: boolean;
  posterIncluded?: boolean;
  discCount?: number | null;
  condition?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  estimatedValue?: number | null;
  locationId?: string | null;
  collectionId?: string | null;
  frontCoverPath?: string | null;
  backCoverPath?: string | null;
  spineImagePath?: string | null;
  notes?: string | null;
};

export type SearchResult = {
  title: string;
  original_title?: string | null;
  originalTitle?: string | null;
  release_date?: string | null;
  releaseDate?: string | null;
  overview?: string | null;
  backdrop_path?: string | null;
  poster_path?: string | null;
  imdb_id?: string | null;
  tmdbId?: string | null;
  tmdbUrl?: string | null;
  movieId?: number;
  id?: number;
  source?: string;
  Genre?: string[];
};

export type UploadedCover = {
  filename: string;
  path: string;
};

export type BarcodeScanStatus = {
  severity: 'info' | 'success' | 'warning' | 'error';
  message: string;
};

export type CoverUploadStatus = {
  severity: 'info' | 'success' | 'warning' | 'error';
  message: string;
};
