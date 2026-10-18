import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AppBar,
  Autocomplete,
  Box,
  Button,
  Card,
  CardActionArea,
  CardActions,
  CardContent,
  CardMedia,
  BottomNavigation,
  BottomNavigationAction,
  Chip,
  Checkbox,
  CircularProgress,
  Container,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import AddCircleOutlineRounded from '@mui/icons-material/AddCircleOutlineRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import LibraryAddRoundedIcon from '@mui/icons-material/LibraryAddRounded';
import MovieRounded from '@mui/icons-material/MovieRounded';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import RotateRightRounded from '@mui/icons-material/RotateRightRounded';
import SearchIcon from '@mui/icons-material/Search';

const API_BASE = '/api';

const formatOptions = [
  { id: 'FMT01', label: 'DVD' },
  { id: 'FMT02', label: 'Blu-ray' },
  { id: 'FMT03', label: '4K UHD' },
  { id: 'FMT04', label: 'Combo' },
];
const editionTypeOptions = [
  { id: 'ED01', label: 'Standard' },
  { id: 'ED02', label: 'Special Edition' },
  { id: 'ED03', label: "Collector's Edition" },
  { id: 'ED04', label: 'Limited Edition' },
  { id: 'ED05', label: 'Box Set' },
  { id: 'ED06', label: 'Steelbook' },
  { id: 'ED07', label: 'Digibook' },
];
const watchedOptions = ['unwatched', 'watched', 'favorite', 'collector'];
const ageRatingOptions = ['G', 'PG', 'PG-13', 'R', 'NC-17', 'U', '12', '12A', '15', '16', '18', 'Not rated'];
const countryOptions = [
  { id: 'USA', name: 'United States' },
  { id: 'GBR', name: 'United Kingdom' },
  { id: 'BRA', name: 'Brazil' },
  { id: 'PRT', name: 'Portugal' },
  { id: 'ESP', name: 'Spain' },
  { id: 'FRA', name: 'France' },
  { id: 'DEU', name: 'Germany' },
  { id: 'ITA', name: 'Italy' },
  { id: 'JPN', name: 'Japan' },
  { id: 'KOR', name: 'South Korea' },
  { id: 'CHN', name: 'China' },
  { id: 'IND', name: 'India' },
  { id: 'CAN', name: 'Canada' },
  { id: 'AUS', name: 'Australia' },
  { id: 'MEX', name: 'Mexico' },
  { id: 'ARG', name: 'Argentina' },
  { id: 'CHL', name: 'Chile' },
  { id: 'SWE', name: 'Sweden' },
  { id: 'NOR', name: 'Norway' },
  { id: 'DNK', name: 'Denmark' },
  { id: 'NLD', name: 'Netherlands' },
  { id: 'BEL', name: 'Belgium' },
  { id: 'CHE', name: 'Switzerland' },
  { id: 'AUT', name: 'Austria' },
  { id: 'POL', name: 'Poland' },
  { id: 'RUS', name: 'Russia' },
  { id: 'TUR', name: 'Turkey' },
  { id: 'GRC', name: 'Greece' },
  { id: 'IRL', name: 'Ireland' },
  { id: 'NZL', name: 'New Zealand' },
];
const languageOptions = [
  { id: 'en', name: 'English' },
  { id: 'pt', name: 'Portuguese' },
  { id: 'es', name: 'Spanish' },
  { id: 'fr', name: 'French' },
  { id: 'de', name: 'German' },
  { id: 'it', name: 'Italian' },
  { id: 'ja', name: 'Japanese' },
  { id: 'ko', name: 'Korean' },
  { id: 'zh', name: 'Chinese' },
  { id: 'hi', name: 'Hindi' },
  { id: 'ru', name: 'Russian' },
  { id: 'sv', name: 'Swedish' },
  { id: 'da', name: 'Danish' },
  { id: 'nl', name: 'Dutch' },
  { id: 'pl', name: 'Polish' },
  { id: 'ar', name: 'Arabic' },
  { id: 'he', name: 'Hebrew' },
  { id: 'th', name: 'Thai' },
];
const movieVersionOptions = ['Theatrical cut', "Director's cut", 'Extended cut', 'Unrated cut', 'Restored version', 'Alternate version'];
const conditionOptions = ['Mint', 'Like new', 'Excellent', 'Very good', 'Good', 'Acceptable', 'Poor'];
const regionOptions = ['Region 0 / All', 'Region 1', 'Region 2', 'Region 3', 'Region 4', 'Region 5', 'Region 6', 'Region 7', 'Region 8', 'Region A', 'Region B', 'Region C'];
const pendingCoversStorageKey = 'film-collection-pending-covers';
const pendingCoverDatabaseName = 'film-collection-intake';
const pendingCoverStoreName = 'pending-covers';
type Summary = {
  totalMovies: number;
  totalEditions: number;
  favorites: number;
  unwatched: number;
};

type Movie = {
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

type Genre = {
  id: string;
  name: string;
};

type Edition = {
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

type SearchResult = {
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

type UploadedCover = {
  filename: string;
  path: string;
};

type BarcodeScanStatus = {
  severity: 'info' | 'success' | 'warning' | 'error';
  message: string;
};

type CoverUploadStatus = {
  severity: 'info' | 'success' | 'warning' | 'error';
  message: string;
};

const prepareMobileImage = async (file: File, purpose: 'cover' | 'barcode') => {
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

const rotateImage180 = async (image: Blob, filename: string) => {
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

const withPendingCoverStore = async <T,>(
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

const persistPendingCover = async (slot: 'front' | 'back', file: File) => {
  await withPendingCoverStore('readwrite', (store) => store.put(file, slot));
};

const readPendingCovers = async () => {
  const [front, back] = await Promise.all([
    withPendingCoverStore('readonly', (store) => store.get('front')),
    withPendingCoverStore('readonly', (store) => store.get('back')),
  ]);
  return [front, back] as [File | undefined, File | undefined];
};

const removePendingCover = async (slot: 'front' | 'back') => {
  await withPendingCoverStore('readwrite', (store) => store.delete(slot));
};

const coverReference = (coverPath: string): UploadedCover => ({
  filename: coverPath.split('/').pop() || '',
  path: coverPath,
});

const emptyMovieForm = {
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
  watchedDate: '', // Added watched date field 18/10/2026
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

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const mobileNavValue = location.pathname.startsWith('/add-movie') || location.pathname.startsWith('/edit-movie')
    ? '/add-movie'
    : location.pathname.startsWith('/collection')
      ? '/collection'
      : '/';

  return (
    <Box sx={{ minHeight: '100vh', pb: { xs: 'calc(68px + env(safe-area-inset-bottom))', md: 0 }, background: 'linear-gradient(180deg, #0c1628 0%, #0d1b2d 100%)', color: '#edf4ff' }}>
      <AppBar position="sticky" sx={{ top: 0, backdropFilter: 'blur(8px)', background: 'rgba(12,22,40,0.92)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar sx={{ minHeight: { xs: 56, sm: 64 }, px: { xs: 2, sm: 3 } }}>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, fontWeight: 700, fontSize: { xs: '1.1rem', sm: '1.25rem' } }}>
            Film Collection
          </Typography>
          <Stack direction="row" spacing={0.5} sx={{ display: { xs: 'none', md: 'flex' } }}>
            <Button color="inherit" component={RouterLink} to="/" startIcon={<HomeRounded />}>Home</Button>
            <Button color="inherit" component={RouterLink} to="/add-movie" startIcon={<AddCircleOutlineRounded />}>Add movie</Button>
            <Button color="inherit" component={RouterLink} to="/collection" startIcon={<MovieRounded />}>Collection</Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/add-movie" element={<AddMoviePage />} />
        <Route path="/edit-movie/:movieId" element={<AddMoviePage />} />
        <Route path="/collection" element={<CollectionPage />} />
      </Routes>
      <BottomNavigation
        showLabels
        value={mobileNavValue}
        onChange={(_event, value: string) => navigate(value)}
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          zIndex: (theme) => theme.zIndex.appBar,
          bottom: 0,
          left: 0,
          right: 0,
          height: 'calc(64px + env(safe-area-inset-bottom))',
          pb: 'env(safe-area-inset-bottom)',
          background: 'rgba(12,22,40,0.96)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          backdropFilter: 'blur(12px)',
          '& .MuiBottomNavigationAction-root': { minWidth: 0, minHeight: 56, color: 'rgba(237,244,255,0.68)' },
          '& .Mui-selected': { color: '#8ab4ff' },
        }}
      >
        <BottomNavigationAction label="Home" value="/" icon={<HomeRounded />} />
        <BottomNavigationAction label="Add movie" value="/add-movie" icon={<AddCircleOutlineRounded />} />
        <BottomNavigationAction label="Collection" value="/collection" icon={<MovieRounded />} />
      </BottomNavigation>
    </Box>
  );
}

function DashboardPage() {
  const [summary, setSummary] = useState<Summary>({ totalMovies: 0, totalEditions: 0, favorites: 0, unwatched: 0 });
  const [movies, setMovies] = useState<Movie[]>([]);
  const alphabetizedMovies = useMemo(
    () => [...movies].sort((left, right) => (left.alternativeTitle || left.title).localeCompare(right.alternativeTitle || right.title, undefined, { sensitivity: 'base' })),
    [movies],
  );

  useEffect(() => {
    void fetchSummary();
    void fetchMovies();
  }, []);

  const fetchSummary = async () => {
    const response = await fetch(`${API_BASE}/summary`);
    const payload = (await response.json()) as Summary;
    setSummary(payload);
  };

  const fetchMovies = async () => {
    const response = await fetch(`${API_BASE}/movies`);
    const payload = (await response.json()) as Movie[];
    setMovies(payload);
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, sm: 4 }, px: { xs: 1.5, sm: 3 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 800 }}>
            Collection overview
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Catalog physical editions with barcode lookup, live metadata, and cover photos.
          </Typography>
        </Box>

        <Grid container spacing={2}>
          <StatCard title="Movies" value={summary.totalMovies} subtitle="View all catalog titles" icon={<DashboardRoundedIcon />} to="/collection?view=movies" />
          <StatCard title="Editions" value={summary.totalEditions} subtitle="View all physical editions" icon={<LibraryAddRoundedIcon />} to="/collection?view=editions" />
          <StatCard title="Favorites" value={summary.favorites} subtitle="View favorite titles" icon={<PhotoCamera />} to="/collection?view=favorites" />
          <StatCard title="Unwatched" value={summary.unwatched} subtitle="View titles to watch" icon={<SearchIcon />} to="/collection?view=unwatched" />
        </Grid>

        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                Intake workflow
              </Typography>
              <List>
                {[
                  'Scan or enter the barcode',
                  'Search by title and enrich metadata',
                  'Review and confirm the movie match',
                  'Add front and back cover photos',
                  'Enter physical-edition details',
                  'Save the completed edition',
                ].map((step, index) => (
                  <ListItem key={step} sx={{ borderBottom: index === 5 ? undefined : '1px solid rgba(255,255,255,0.08)' }}>
                    <ListItemText primary={`${index + 1}. ${step}`} secondary="Workflow stage" />
                  </ListItem>
                ))}
              </List>
            </Paper>
          </Grid>

          <Grid item xs={12} md={4}>
            <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
              <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
                Movies A-Z
              </Typography>
              <Stack spacing={2}>
                {alphabetizedMovies.slice(0, 4).map((movie) => (
                  <Box key={movie.id} sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, p: 1.8 }}>
                    <Typography fontWeight={700}>{movie.alternativeTitle || movie.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {movie.title}{movie.releaseYear ? ` · ${movie.releaseYear}` : ''} · {movie.watchedStatus || 'unwatched'}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Stack>
    </Container>
  );
}

function AddMoviePage() {
  const { movieId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEditing = Boolean(movieId);
  const wasEditingRef = useRef(isEditing);
  const [form, setForm] = useState(emptyMovieForm);
  const [frontCover, setFrontCover] = useState<File | null>(null);
  const [backCover, setBackCover] = useState<File | null>(null);
  const [rotatingCovers, setRotatingCovers] = useState<{ front?: boolean; back?: boolean }>({});
  const [uploadedCovers, setUploadedCovers] = useState<{ front?: UploadedCover; back?: UploadedCover }>(() => {
    try {
      const saved = sessionStorage.getItem(pendingCoversStorageKey);
      if (!saved) return {};
      const parsed = JSON.parse(saved) as { front?: UploadedCover; back?: UploadedCover };
      const isValidCover = (cover: UploadedCover | undefined) => (
        Boolean(
          cover
          && typeof cover.filename === 'string'
          && typeof cover.path === 'string'
          && cover.path === `/uploads/${cover.filename}`
          && !cover.filename.includes('..')
          && !/[\\/]/.test(cover.filename),
        )
      );
      return {
        ...(isValidCover(parsed.front) ? { front: parsed.front } : {}),
        ...(isValidCover(parsed.back) ? { back: parsed.back } : {}),
      };
    } catch {
      return {};
    }
  });
  const [uploadingCovers, setUploadingCovers] = useState<{ front: boolean; back: boolean }>({ front: false, back: false });
  const [coverUploadStatus, setCoverUploadStatus] = useState<{ front?: CoverUploadStatus; back?: CoverUploadStatus }>({});
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isReadingBarcode, setIsReadingBarcode] = useState(false);
  const [barcodeScanStatus, setBarcodeScanStatus] = useState<BarcodeScanStatus | null>(null);
  const [isLookingUpMetadata, setIsLookingUpMetadata] = useState(false);
  const [isLoadingMovie, setIsLoadingMovie] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [editingEditionId, setEditingEditionId] = useState<number | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [genreError, setGenreError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadGenres = async () => {
      try {
        const response = await fetch(`${API_BASE}/genres`);
        const payload = await response.json() as Genre[] | { message?: string };
        if (!response.ok) {
          throw new Error(!Array.isArray(payload) ? payload.message || 'Could not load genres.' : 'Could not load genres.');
        }
        if (!Array.isArray(payload)) throw new Error('The genre list returned an invalid response.');
        if (!cancelled) setGenres(payload);
      } catch (error) {
        if (!cancelled) setGenreError(error instanceof Error ? error.message : 'Could not load genres.');
      }
    };
    void loadGenres();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isEditing) return;
    if (uploadedCovers.front || uploadedCovers.back) {
      sessionStorage.setItem(pendingCoversStorageKey, JSON.stringify(uploadedCovers));
    } else {
      sessionStorage.removeItem(pendingCoversStorageKey);
    }
  }, [isEditing, uploadedCovers]);

  useEffect(() => {
    if (!movieId) {
      setIsLoadingMovie(false);
      if (wasEditingRef.current) {
        setForm(emptyMovieForm);
        setUploadedCovers({});
        setFrontCover(null);
        setBackCover(null);
        setEditingEditionId(null);
        setStatusMessage(null);
      }
      wasEditingRef.current = false;
      return;
    }
    wasEditingRef.current = true;
    let cancelled = false;

    const loadMovieForEdit = async () => {
      setIsLoadingMovie(true);
      try {
        const response = await fetch(`${API_BASE}/movies`);
        const movies = await response.json() as Movie[];
        if (!response.ok) throw new Error('Could not load the collection entry for editing.');
        const movie = movies.find((item) => item.id === Number(movieId));
        if (!movie) throw new Error('This movie was not found in the collection.');
        const requestedEdition = searchParams.get('editionId');
        const requestedEditionId = requestedEdition ? Number(requestedEdition) : null;
        const edition = requestedEditionId
          ? movie.editions?.find((item) => item.id === requestedEditionId)
          : movie.editions?.[0];
        if (requestedEditionId && !edition) throw new Error('The selected edition was not found for this movie.');
        if (!edition) throw new Error('This movie has no physical edition to edit.');
        if (cancelled) return;

        setEditingEditionId(edition.id);
        setForm({
          ...emptyMovieForm,
          title: movie.title || '',
          originalTitle: movie.originalTitle || '',
          alternativeTitle: movie.alternativeTitle || '',
          countryId: movie.countryId || '',
          originalLanguageId: movie.originalLanguageId || '',
          releaseYear: movie.releaseYear ? String(movie.releaseYear) : '',
          releaseDate: movie.releaseDate || '',
          ageRating: movie.ageRating || '',
          synopsis: movie.synopsis || '',
          notes: movie.notes || '',
          favorite: Boolean(movie.favorite),
          watchedStatus: movie.watchedStatus || 'unwatched',
          watchedDate: movie.watchedDate || '',
          genreIds: (movie.genres || []).map((genre) => genre.id),
          formatId: edition.formatId || '',
          editionTypeId: edition.editionTypeId || '',
          movieVersionId: edition.movieVersionId || '',
          distributorId: edition.distributorId || '',
          countryEditionId: edition.countryEditionId || '',
          locationId: edition.locationId || '',
          collectionId: edition.collectionId || '',
          barcode: edition.barcode || '',
          catalogNumber: edition.catalogNumber || '',
          editionYear: edition.editionYear ? String(edition.editionYear) : '',
          condition: edition.condition || '',
          region: edition.region || '',
          purchasePrice: edition.purchasePrice === null || edition.purchasePrice === undefined ? '' : String(edition.purchasePrice),
          estimatedValue: edition.estimatedValue === null || edition.estimatedValue === undefined ? '' : String(edition.estimatedValue),
          editionNotes: edition.notes || '',
          imdbId: movie.imdbId || '',
          tmdbId: movie.tmdbId || '',
          imdbUrl: movie.imdbUrl || '',
          tmdbUrl: movie.tmdbUrl || '',
          posterPath: movie.posterPath || '',
          discCount: edition.discCount ? String(edition.discCount) : '',
          steelbook: Boolean(edition.steelbook),
          slipcover: Boolean(edition.slipcover),
          digibook: Boolean(edition.digibook),
          booklet: Boolean(edition.booklet),
          posterIncluded: Boolean(edition.posterIncluded),
        });
        setUploadedCovers({
          ...(edition.frontCoverPath ? { front: coverReference(edition.frontCoverPath) } : {}),
          ...(edition.backCoverPath ? { back: coverReference(edition.backCoverPath) } : {}),
        });
      } catch (error) {
        if (!cancelled) {
          setStatusMessage(error instanceof Error ? error.message : 'Could not load this movie for editing.');
        }
      } finally {
        if (!cancelled) setIsLoadingMovie(false);
      }
    };

    void loadMovieForEdit();
    return () => {
      cancelled = true;
    };
  }, [isEditing, movieId, searchParams]);

  const updateForm = (field: string, value: string | boolean | string[]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleCoverSelected = async (slot: 'front' | 'back', file: File | null) => {
    if (!file) {
      return;
    }

    if (slot === 'front') {
      setFrontCover(file);
    } else {
      setBackCover(file);
    }
    setUploadingCovers((current) => ({ ...current, [slot]: true }));
    setCoverUploadStatus((current) => ({
      ...current,
      [slot]: {
        severity: 'info',
        message: `Preparing ${file.name || 'camera image'} · ${(file.size / (1024 * 1024)).toFixed(1)} MB for upload. Your last saved cover remains available until this one succeeds.`,
      },
    }));
    setStatusMessage(`Preparing and saving the ${slot} cover photo...`);

    try {
      await persistPendingCover(slot, file);
      const preparedImage = await prepareMobileImage(file, 'cover');
      if (slot === 'front') {
        setFrontCover(preparedImage);
      } else {
        setBackCover(preparedImage);
      }

      const data = new FormData();
      data.append('slot', slot);
      data.append('image', preparedImage);

      const response = await fetch(`${API_BASE}/upload-cover`, {
        method: 'POST',
        body: data,
      });
      const responseText = await response.text();
      let result: {
        success?: boolean;
        message?: string;
        file?: { slot?: string; filename?: string; path?: string };
      };
      try {
        result = JSON.parse(responseText) as typeof result;
      } catch {
        const diagnostic = responseText
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160);
        throw new Error(`${slot === 'front' ? 'Front' : 'Back'} cover upload returned HTTP ${response.status}, not JSON. ${diagnostic || 'The server returned an empty response.'}`);
      }
      const uploadedFile = result.file;

      if (
        !response.ok
        || !result.success
        || uploadedFile?.slot !== slot
        || typeof uploadedFile.filename !== 'string'
        || typeof uploadedFile.path !== 'string'
      ) {
        throw new Error(result.message || `Could not upload the ${slot} cover.`);
      }

      const savedCoverUrl = `${API_BASE.replace(/\/api$/, '')}${uploadedFile.path}`;
      const savedPreview = await fetch(savedCoverUrl, { method: 'HEAD', cache: 'no-store' });
      if (!savedPreview.ok || !savedPreview.headers.get('content-type')?.startsWith('image/')) {
        throw new Error(`${slot === 'front' ? 'Front' : 'Back'} photo uploaded, but the saved server copy could not be verified. Try capturing it again.`);
      }

      const savedCover = { filename: uploadedFile.filename, path: uploadedFile.path };
      try {
        const existing = JSON.parse(sessionStorage.getItem(pendingCoversStorageKey) || '{}') as { front?: UploadedCover; back?: UploadedCover };
        sessionStorage.setItem(pendingCoversStorageKey, JSON.stringify({ ...existing, [slot]: savedCover }));
      } catch {
        setCoverUploadStatus((current) => ({
          ...current,
          [slot]: {
            severity: 'warning',
            message: 'Photo is saved on the server, but this browser could not retain its draft after a page reload. Keep this page open until you save the movie.',
          },
        }));
      }

      setUploadedCovers((current) => ({
        ...current,
        [slot]: savedCover,
      }));
      try {
        await removePendingCover(slot);
      } catch (error) {
        console.error(`Could not clear the completed ${slot} cover draft`, error);
      }
      setCoverUploadStatus((current) => ({
        ...current,
        [slot]: {
          severity: 'success',
          message: `${slot === 'front' ? 'Front' : 'Back'} cover photo saved and verified.`,
        },
      }));
      setStatusMessage(`${slot === 'front' ? 'Front' : 'Back'} cover photo saved and verified.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not prepare or upload the ${slot} cover.`;
      setCoverUploadStatus((current) => ({
        ...current,
        [slot]: { severity: 'error', message },
      }));
      setStatusMessage(message);
    } finally {
      setUploadingCovers((current) => ({ ...current, [slot]: false }));
    }
  };

  const handleRotateCover = async (slot: 'front' | 'back') => {
    const cover = uploadedCovers[slot];
    if (!cover) return;

    setRotatingCovers((current) => ({ ...current, [slot]: true }));
    try {
      const imageResponse = await fetch(`${API_BASE.replace(/\/api$/, '')}${cover.path}`, { cache: 'no-store' });
      if (!imageResponse.ok || !imageResponse.headers.get('content-type')?.startsWith('image/')) {
        throw new Error(`Could not load the saved ${slot} cover to rotate it.`);
      }
      const rotatedImage = await rotateImage180(await imageResponse.blob(), `${slot}-cover.jpg`);
      await handleCoverSelected(slot, rotatedImage);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not rotate the ${slot} cover.`;
      setCoverUploadStatus((current) => ({
        ...current,
        [slot]: { severity: 'error', message },
      }));
      setStatusMessage(message);
    } finally {
      setRotatingCovers((current) => ({ ...current, [slot]: false }));
    }
  };

  useEffect(() => {
    if (isEditing) return;
    let cancelled = false;
    void readPendingCovers()
      .then(async ([front, back]) => {
        if (cancelled) return;
        if (front) await handleCoverSelected('front', front);
        if (cancelled) return;
        if (back) await handleCoverSelected('back', back);
      })
      .catch((error) => {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Could not restore a pending camera photo.';
          setStatusMessage(`A captured cover could not be restored after returning from the camera: ${message}`);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isEditing]);

  const handleBarcodeImage = async (file: File | null) => {
    if (!file) {
      return;
    }

    setIsReadingBarcode(true);
    setBarcodeScanStatus({
      severity: 'info',
      message: `Photo received (${file.name}, ${(file.size / (1024 * 1024)).toFixed(1)} MB). Preparing and reading barcode...`,
    });

    try {
      const preparedImage = await prepareMobileImage(file, 'barcode');
      const data = new FormData();
      data.append('image', preparedImage);
      const response = await fetch(`${API_BASE}/barcode/read`, { method: 'POST', body: data });
      const responseText = await response.text();
      let result: {
        success?: boolean;
        found?: boolean;
        barcode?: string;
        format?: string | null;
        source?: string | null;
        validated?: boolean;
        message?: string;
      };
      try {
        result = JSON.parse(responseText) as typeof result;
      } catch {
        const responseHint = responseText
          .replace(/<script[\s\S]*?<\/script>/gi, ' ')
          .replace(/<style[\s\S]*?<\/style>/gi, ' ')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 180);
        const contentType = response.headers.get('content-type') || 'unknown content type';
        throw new Error(
          `Barcode service returned HTTP ${response.status} (${contentType}) instead of JSON. ${responseHint || 'The server returned an empty response.'} Check that the app server is running, then retry or choose the photo from your gallery.`,
        );
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || `Barcode reading failed (HTTP ${response.status}).`);
      }
      if (!result.found || !result.barcode) {
        const message = result.message || 'No barcode was found.';
        setBarcodeScanStatus({
          severity: 'warning',
          message: `${message} Fill the frame with the barcode, avoid glare, and try again—or choose a photo or enter the digits manually.`,
        });
        return;
      }

      updateForm('barcode', result.barcode);
      setBarcodeScanStatus({
        severity: 'success',
        message: `Barcode captured: ${result.barcode}${result.validated ? ' (checksum valid)' : ' (please verify the digits)'} · ${result.source || result.format || 'image scan'}.`,
      });
      await handleLookupMetadata(result.barcode);
    } catch (error) {
      setBarcodeScanStatus({
        severity: 'error',
        message: error instanceof Error ? error.message : 'Barcode reading failed. Choose another image or enter the digits manually.',
      });
    } finally {
      setIsReadingBarcode(false);
    }
  };

  const handleLookupMetadata = async (barcodeReference?: string) => {
    const barcode = (barcodeReference ?? form.barcode).trim();
    const lookupQueries = Array.from(new Set([
      form.title.trim(),
      form.originalTitle.trim(),
    ].filter(Boolean)));

    if (!lookupQueries.length && !barcode) {
      setStatusMessage('Enter a movie title or barcode before looking up metadata.');
      return;
    }

    setIsLookingUpMetadata(true);
    setStatusMessage(barcode ? 'Looking up this barcode in the catalog and live product metadata...' : 'Searching live TMDb and IMDb-linked metadata...');

    try {
      if (barcode) {
        const response = await fetch(`${API_BASE}/metadata/barcode?barcode=${encodeURIComponent(barcode)}`);
        const payload = await response.json() as {
          results?: SearchResult[];
          message?: string;
          source?: string;
        };
        if (!response.ok) {
          throw new Error(payload.message || `Barcode metadata lookup failed (HTTP ${response.status}).`);
        }
        if (payload.results?.length) {
          setSearchResults(payload.results);
          setStatusMessage(`${payload.message || `Barcode match found via ${payload.source || 'metadata lookup'}.`} Review a match before applying it.`);
          return;
        }
        if (!lookupQueries.length) {
          setSearchResults([]);
          setStatusMessage(payload.message || `No metadata match was found for barcode ${barcode}. Enter a movie title to search TMDb and IMDb.`);
          return;
        }
      }

      for (const query of lookupQueries) {
        const response = await fetch(`${API_BASE}/search?query=${encodeURIComponent(query)}`);
        const payload = (await response.json()) as { results?: SearchResult[]; message?: string };
        if (!response.ok) {
          throw new Error(payload.message || `Metadata lookup failed (HTTP ${response.status}).`);
        }
        if (payload.results?.length) {
          setSearchResults(payload.results);
          setStatusMessage(`Live metadata matches found for “${query}”. Review a match before applying it.`);
          return;
        }
      }

      setSearchResults([]);
      setStatusMessage('No live metadata matches were found. Check the barcode or title and try again, or enter the details manually.');
    } catch (error) {
      setSearchResults([]);
      setStatusMessage(error instanceof Error ? error.message : 'Metadata lookup failed.');
    } finally {
      setIsLookingUpMetadata(false);
    }
  };

  const applyMetadata = (result: SearchResult) => {
    const year = result.release_date || result.releaseDate || '';
    const parsedYear = year ? String(year).slice(0, 4) : '';

    setForm((current) => ({
      ...current,
      title: result.title || current.title,
      originalTitle: result.original_title || result.originalTitle || current.originalTitle,
      releaseYear: parsedYear || current.releaseYear,
      releaseDate: year || current.releaseDate,
      synopsis: result.overview || current.synopsis,
      imdbId: result.imdb_id || current.imdbId,
      tmdbId: result.tmdbId || (result.id ? String(result.id) : current.tmdbId),
      imdbUrl: result.imdb_id ? `https://www.imdb.com/title/${result.imdb_id}/` : current.imdbUrl,
      tmdbUrl: result.tmdbUrl || (result.id ? `https://www.themoviedb.org/movie/${result.id}` : current.tmdbUrl),
      posterPath: result.poster_path
        ? result.poster_path.startsWith('http')
          ? result.poster_path
          : `https://image.tmdb.org/t/p/w500${result.poster_path}`
        : current.posterPath,
    }));

    setStatusMessage(`Metadata from ${result.source || 'source'} applied to the entry.`);
  };

  const resetIntake = () => {
    setForm(emptyMovieForm);
    setUploadedCovers({});
    setFrontCover(null);
    setBackCover(null);
    setCoverUploadStatus({});
    setBarcodeScanStatus(null);
    setSearchResults([]);
    setStatusMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      (frontCover && !uploadedCovers.front)
      || (backCover && !uploadedCovers.back)
      || uploadingCovers.front
      || uploadingCovers.back
      || rotatingCovers.front
      || rotatingCovers.back
    ) {
      setStatusMessage('Wait for the selected cover images to finish uploading or rotating before saving.');
      return;
    }
    if (!isEditing && (!uploadedCovers.front || !uploadedCovers.back)) {
      setStatusMessage('Add and save both the front and back cover photos before saving this movie.');
      return;
    }

    const body = {
      ...(isEditing && editingEditionId ? { editionId: editingEditionId } : {}),
      ...form,
      releaseYear: Number(form.releaseYear) || null,
      editionYear: Number(form.editionYear) || null,
      purchasePrice: form.purchasePrice ? Number(form.purchasePrice) : null,
      estimatedValue: form.estimatedValue ? Number(form.estimatedValue) : null,
      favorite: Boolean(form.favorite),
      genreIds: form.genreIds,
      steelbook: Boolean(form.steelbook),
      slipcover: Boolean(form.slipcover),
      digibook: Boolean(form.digibook),
      booklet: Boolean(form.booklet),
      posterIncluded: Boolean(form.posterIncluded),
      ...(uploadedCovers.front ? { frontCoverPath: uploadedCovers.front.path } : {}),
      ...(uploadedCovers.back ? { backCoverPath: uploadedCovers.back.path } : {}),
    };

    setIsSaving(true);
    try {
      const response = await fetch(isEditing ? `${API_BASE}/movies/${movieId}` : `${API_BASE}/ingest`, {
        method: isEditing ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || (isEditing ? 'Unable to save changes.' : 'Unable to save the movie.'));
      }
      if (isEditing) {
        navigate('/collection');
        return;
      }
      setStatusMessage('Movie and edition saved to your collection.');
      setForm(emptyMovieForm);
      setUploadedCovers({});
      setSearchResults([]);
      setFrontCover(null);
      setBackCover(null);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to save this entry.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingMovie) {
    return (
      <Container maxWidth="md" sx={{ py: 8 }}>
        <Stack alignItems="center" spacing={2}>
          <CircularProgress />
          <Typography color="text.secondary">Loading movie and edition details…</Typography>
        </Stack>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Paper sx={{ p: { xs: 1.75, sm: 3 }, borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
        <Typography variant="h4" sx={{ mb: 2, fontWeight: 800 }}>
          {isEditing ? `Edit ${form.title || 'movie'}` : 'Capture and catalog a physical movie'}
        </Typography>
        <Alert severity="info" sx={{ mb: 3 }}>
          {isEditing
            ? 'Update the movie and selected physical edition. Existing cover photos are kept unless you replace them.'
            : 'Identify the movie with its barcode or title, review live metadata, then add its cover photos and edition details before saving.'}
        </Alert>

        <Box component="form" onSubmit={handleSubmit}>
          <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2, background: 'rgba(11,19,33,0.9)' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>1. Identify the movie</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Scan the package barcode or search by title. Review a matching catalog/API result before adding photos.
            </Typography>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Movie title" value={form.title} onChange={(event) => updateForm('title', event.target.value)} required />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Original title" value={form.originalTitle} onChange={(event) => updateForm('originalTitle', event.target.value)} />
              </Grid>
              <Grid item xs={12} md={5}>
                <TextField
                  fullWidth
                  label="Barcode"
                  value={form.barcode}
                  onChange={(event) => updateForm('barcode', event.target.value)}
                  helperText={form.barcode ? (isValidRetailBarcode(form.barcode) ? 'Retail barcode check digit is valid.' : 'Check the digits; checksum validation does not recognize this as a standard retail code.') : 'Scan the barcode on the packaging or enter it manually.'}
                />
              </Grid>
              <Grid item xs={12} md={7}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button component="label" variant="outlined" disabled={isReadingBarcode} startIcon={isReadingBarcode ? <CircularProgress size={18} /> : <PhotoCamera />} sx={{ flex: 1 }}>
                    {isReadingBarcode ? 'Reading barcode...' : 'Scan barcode'}
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0] || null;
                        event.currentTarget.value = '';
                        void handleBarcodeImage(file);
                      }}
                    />
                  </Button>
                  <Button component="label" variant="text" disabled={isReadingBarcode} sx={{ flex: 1 }}>
                    Choose barcode photo
                    <input
                      hidden
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0] || null;
                        event.currentTarget.value = '';
                        void handleBarcodeImage(file);
                      }}
                    />
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => void handleLookupMetadata()}
                    disabled={isLookingUpMetadata || isReadingBarcode}
                    startIcon={isLookingUpMetadata ? <CircularProgress size={18} /> : <SearchIcon />}
                    sx={{ flex: 1 }}
                  >
                    {isLookingUpMetadata ? 'Searching...' : 'Look up metadata'}
                  </Button>
                </Stack>
              </Grid>
            </Grid>
            {barcodeScanStatus && (
              <Alert severity={barcodeScanStatus.severity} sx={{ mt: 2 }}>
                {barcodeScanStatus.message}
              </Alert>
            )}
            {statusMessage && (
              <Alert severity={statusMessage.includes('could not') || statusMessage.includes('Could not') || statusMessage.includes('Unable') || statusMessage.includes('failed') || statusMessage.includes('Failed') || statusMessage.includes('No metadata') ? 'error' : 'info'} sx={{ mt: 2 }}>
                {statusMessage}
              </Alert>
            )}
            {searchResults.length > 0 && (
              <Stack spacing={2} sx={{ mt: 2 }}>
                <Typography variant="subtitle1" fontWeight={700}>Review metadata matches</Typography>
                {[...searchResults].sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' })).map((result, index) => (
                  <Paper key={`${result.title}-${index}`} sx={{ p: 2, borderRadius: 2, background: 'rgba(18,28,46,0.9)' }}>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between">
                      <Box>
                        <Typography fontWeight={700}>{result.title}</Typography>
                        <Typography variant="body2" color="text.secondary">
                          {result.original_title || result.originalTitle || 'Original title unavailable'} · {result.release_date || result.releaseDate || 'Release date unavailable'}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                          {result.overview || 'No overview available.'}
                        </Typography>
                      </Box>
                      <Button variant="outlined" onClick={() => applyMetadata(result)} sx={{ alignSelf: { md: 'center' }, flexShrink: 0 }}>
                        Use metadata
                      </Button>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            )}
          </Paper>

          <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2, background: 'rgba(11,19,33,0.9)' }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5 }}>2. Add cover photos</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              After identifying the movie, capture or choose its front and back cover. Photos are saved with the edition; no text is extracted from them.
            </Typography>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <UploadField
                label="Front cover"
                value={frontCover}
                uploading={uploadingCovers.front}
                uploaded={Boolean(uploadedCovers.front)}
                uploadedPath={uploadedCovers.front?.path}
                uploadStatus={coverUploadStatus.front}
                rotating={Boolean(rotatingCovers.front)}
                onChange={(file) => void handleCoverSelected('front', file)}
                onRetry={() => void handleCoverSelected('front', frontCover)}
                onRotate={() => void handleRotateCover('front')}
              />
              <UploadField
                label="Back cover"
                value={backCover}
                uploading={uploadingCovers.back}
                uploaded={Boolean(uploadedCovers.back)}
                uploadedPath={uploadedCovers.back?.path}
                uploadStatus={coverUploadStatus.back}
                rotating={Boolean(rotatingCovers.back)}
                onChange={(file) => void handleCoverSelected('back', file)}
                onRetry={() => void handleCoverSelected('back', backCover)}
                onRotate={() => void handleRotateCover('back')}
              />
            </Stack>
          </Paper>
          <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>3. Confirm edition details and save</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Typography variant="subtitle1" fontWeight={700}>Movie details</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth disabled={!genres.length || Boolean(genreError)}>
                <InputLabel id="movie-genres-label">Genres</InputLabel>
                <Select
                  labelId="movie-genres-label"
                  multiple
                  label="Genres"
                  value={form.genreIds}
                  onChange={(event) => {
                    const value = event.target.value;
                    updateForm('genreIds', typeof value === 'string' ? value.split(',') : value);
                  }}
                  renderValue={(selected) => (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                      {selected.map((id) => <Chip key={id} label={genres.find((genre) => genre.id === id)?.name || id} size="small" />)}
                    </Box>
                  )}
                >
                  {genres.map((genre) => (
                    <MenuItem key={genre.id} value={genre.id}>{genre.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {genreError && <Alert severity="error" sx={{ mt: 1 }}>{genreError}</Alert>}
              {!genreError && !genres.length && <Typography variant="caption" color="text.secondary">Loading genres...</Typography>}
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Alternative title" value={form.alternativeTitle} onChange={(event) => updateForm('alternativeTitle', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <NameOptionField
                label="Movie country"
                value={form.countryId}
                options={countryOptions}
                helperText="Search by country name, or type a country."
                onChange={(value) => updateForm('countryId', value)}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <NameOptionField
                label="Original language"
                value={form.originalLanguageId}
                options={languageOptions}
                helperText="Search by language name, or type a language."
                onChange={(value) => updateForm('originalLanguageId', value)}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Release year" type="number" value={form.releaseYear} onChange={(event) => updateForm('releaseYear', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Release date" type="date" InputLabelProps={{ shrink: true }} value={form.releaseDate} onChange={(event) => updateForm('releaseDate', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <SuggestionField label="Age rating" value={form.ageRating} options={ageRatingOptions} onChange={(value) => updateForm('ageRating', value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControlLabel
                control={<Checkbox checked={form.favorite} onChange={(event) => updateForm('favorite', event.target.checked)} />}
                label="Favorite"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth multiline minRows={3} label="Synopsis" value={form.synopsis} onChange={(event) => updateForm('synopsis', event.target.value)} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth multiline minRows={2} label="Movie notes" value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} />
            </Grid>
            <Grid item xs={12}>
              <Typography variant="subtitle1" fontWeight={700} sx={{ mt: 1 }}>Physical edition</Typography>
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Edition year" type="number" value={form.editionYear} onChange={(event) => updateForm('editionYear', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Catalog number" value={form.catalogNumber} onChange={(event) => updateForm('catalogNumber', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Disc count" type="number" value={form.discCount} onChange={(event) => updateForm('discCount', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Format</InputLabel>
                <Select label="Format" value={form.formatId} onChange={(event) => updateForm('formatId', event.target.value)}>
                  {formatOptions.map((option) => (
                    <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Edition type</InputLabel>
                <Select label="Edition type" value={form.editionTypeId} onChange={(event) => updateForm('editionTypeId', event.target.value)}>
                  {editionTypeOptions.map((option) => (
                    <MenuItem key={option.id} value={option.id}>{option.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Watched status</InputLabel>
                <Select label="Watched status" value={form.watchedStatus} onChange={(event) => updateForm('watchedStatus', event.target.value)}>
                  {watchedOptions.map((option) => (
                    <MenuItem key={option} value={option}>{option}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <SuggestionField label="Condition" value={form.condition} options={conditionOptions} onChange={(value) => updateForm('condition', value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <NameOptionField
                label="Edition country"
                value={form.countryEditionId}
                options={countryOptions}
                helperText="Country where this edition was released."
                onChange={(value) => updateForm('countryEditionId', value)}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Distributor" placeholder="e.g. Warner Bros." value={form.distributorId} onChange={(event) => updateForm('distributorId', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <SuggestionField label="Movie version" value={form.movieVersionId} options={movieVersionOptions} onChange={(value) => updateForm('movieVersionId', value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Collection name" placeholder="e.g. Sci-fi shelf" value={form.collectionId} onChange={(event) => updateForm('collectionId', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField fullWidth label="Storage location" placeholder="e.g. Living room · Shelf 2" value={form.locationId} onChange={(event) => updateForm('locationId', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <SuggestionField label="DVD / Blu-ray region" value={form.region} options={regionOptions} onChange={(value) => updateForm('region', value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Purchase price" type="number" value={form.purchasePrice} onChange={(event) => updateForm('purchasePrice', event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start">€</InputAdornment> }} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField fullWidth label="Estimated value" type="number" value={form.estimatedValue} onChange={(event) => updateForm('estimatedValue', event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start">€</InputAdornment> }} />
            </Grid>
            <Grid item xs={12}>
              <Accordion sx={{ width: '100%', background: 'rgba(11,19,33,0.75)' }}>
                <AccordionSummary expandIcon={<ExpandMoreRounded />}>
                  <Box>
                    <Typography fontWeight={600}>External IDs and links (optional)</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Usually filled automatically when you apply a metadata match.
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={4}>
                      <TextField fullWidth label="IMDb title ID" placeholder="e.g. tt0133093" value={form.imdbId} onChange={(event) => updateForm('imdbId', event.target.value)} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField fullWidth label="IMDb link" placeholder="https://www.imdb.com/title/..." value={form.imdbUrl} onChange={(event) => updateForm('imdbUrl', event.target.value)} />
                    </Grid>
                    <Grid item xs={12} md={4}>
                      <TextField fullWidth label="TMDb link" placeholder="https://www.themoviedb.org/movie/..." value={form.tmdbUrl} onChange={(event) => updateForm('tmdbUrl', event.target.value)} />
                    </Grid>
                  </Grid>
                </AccordionDetails>
              </Accordion>
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth multiline minRows={2} label="Edition notes" value={form.editionNotes} onChange={(event) => updateForm('editionNotes', event.target.value)} />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                fullWidth
                type="date"
                label="Watched date"
                InputLabelProps={{ shrink: true }}
                value={form.watchedDate}
                onChange={(event) => updateForm('watchedDate', event.target.value)}
              />
            </Grid>
          </Grid>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Button type="submit" variant="contained" size="large" disabled={isSaving || !genres.length || Boolean(genreError) || (isEditing && !editingEditionId) || uploadingCovers.front || uploadingCovers.back || rotatingCovers.front || rotatingCovers.back} startIcon={isSaving ? <CircularProgress size={18} /> : undefined}>
              {isSaving ? 'Saving...' : isEditing ? 'Save changes' : 'Save to collection'}
            </Button>
            {isEditing
              ? <Button variant="outlined" size="large" onClick={() => navigate('/collection')}>Cancel</Button>
              : <Button variant="outlined" size="large" onClick={resetIntake}>Reset form</Button>}
          </Stack>
        </Box>
      </Paper>
    </Container>
  );
}

function CollectionPage() {
  const [movies, setMovies] = useState<Movie[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [genreError, setGenreError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [genreFilter, setGenreFilter] = useState('all');
  const [displayMode, setDisplayMode] = useState<'table' | 'carousel'>('table');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const collectionView = searchParams.get('view') || 'movies';

  useEffect(() => {
    let cancelled = false;
    const loadMovies = async () => {
      try {
        const response = await fetch(`${API_BASE}/movies`);
        if (!response.ok) throw new Error(`The collection could not be loaded (HTTP ${response.status}).`);
        const payload = await response.json() as Movie[];
        if (!Array.isArray(payload)) throw new Error('The collection API returned an invalid response.');
        if (!cancelled) setMovies(payload);
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'The collection could not be loaded.');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void loadMovies();
    const loadGenres = async () => {
      try {
        const response = await fetch(`${API_BASE}/genres`);
        const payload = await response.json() as Genre[] | { message?: string };
        if (!response.ok) {
          throw new Error(!Array.isArray(payload) ? payload.message || 'Film genres could not be loaded.' : 'Film genres could not be loaded.');
        }
        if (!Array.isArray(payload)) throw new Error('The genre list returned an invalid response.');
        if (!cancelled) setGenres(payload);
      } catch (error) {
        if (!cancelled) setGenreError(error instanceof Error ? error.message : 'Film genres could not be loaded.');
      }
    };
    void loadGenres();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredMovies = useMemo(() => movies.filter((movie) => {
      const normalizedSearch = searchTerm.trim().toLowerCase();
      const matchesSearch = !normalizedSearch || [
        movie.title,
        movie.originalTitle,
        movie.alternativeTitle,
        movie.notes,
        ...(movie.editions || []).flatMap((edition) => [edition.barcode, edition.catalogNumber, edition.distributorId]),
      ].some((value) => value?.toLowerCase().includes(normalizedSearch));
      const matchesStatus = statusFilter === 'all' || movie.watchedStatus === statusFilter;
      const matchesFavorite = collectionView !== 'favorites' || Boolean(movie.favorite);
      const matchesUnwatched = collectionView !== 'unwatched' || (movie.watchedStatus || 'unwatched') === 'unwatched';
      const matchesGenre = genreFilter === 'all' || movie.genres?.some((genre) => genre.id === genreFilter) === true;
      return matchesSearch && matchesStatus && matchesFavorite && matchesUnwatched && matchesGenre;
    }), [collectionView, genreFilter, movies, searchTerm, statusFilter]);

  const displayedRows = useMemo(() => filteredMovies.flatMap((movie) => {
    const editions = movie.editions || [];
    if (collectionView === 'editions') {
      return editions.map((edition) => ({ movie, edition }));
    }
    return [{ movie, edition: editions[0] }];
  }).sort((left, right) => {
    const titleOrder = (left.movie.alternativeTitle || left.movie.title)
      .localeCompare(right.movie.alternativeTitle || right.movie.title, undefined, { sensitivity: 'base' });
    if (titleOrder !== 0) return titleOrder;
    return (left.edition?.editionYear || 0) - (right.edition?.editionYear || 0)
      || (left.edition?.id || 0) - (right.edition?.id || 0);
  }), [collectionView, filteredMovies]);

  const carouselShelves = useMemo(() => {
    if (genreFilter !== 'all') {
      const selectedGenre = genres.find((genre) => genre.id === genreFilter);
      return selectedGenre ? [{ genre: selectedGenre, movies: filteredMovies }] : [];
    }
    return genres
      .map((genre) => ({
        genre,
        movies: filteredMovies.filter((movie) => movie.genres?.some((movieGenre) => movieGenre.id === genre.id)),
      }))
      .filter((shelf) => shelf.movies.length > 0);
  }, [filteredMovies, genreFilter, genres]);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 2.5, sm: 4 }, px: { xs: 1.5, sm: 3 } }}>
      <Stack spacing={3}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={2}>
          <Box>
            <Typography variant="h4" sx={{ fontWeight: 800 }}>Collection library</Typography>
            <Typography variant="body2" color="text.secondary">
              {displayMode === 'carousel'
                ? 'Browse cover art by genre. Select a movie to open its details.'
                : 'Select a movie row to edit its details and physical edition.'}
            </Typography>
          </Box>
          <Button component="a" href={`${API_BASE}/export`} download="film-collection-export.json" variant="outlined">
            Export catalog JSON
          </Button>
        </Stack>

        <Paper sx={{ p: { xs: 1.5, sm: 2 }, borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
          <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="center">
            <TextField
              sx={{ flex: { xs: '1 1 100%', md: '1 1 280px' }, minWidth: 0 }}
              label="Search title, original title, or alternative title"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }}
            />
            <FormControl sx={{ width: { xs: 'calc(50% - 6px)', sm: 180 }, minWidth: 0, flexGrow: { xs: 1, sm: 0 } }}>
              <InputLabel>Watched status</InputLabel>
              <Select label="Watched status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <MenuItem value="all">All</MenuItem>
                {watchedOptions.map((option) => (
                  <MenuItem key={option} value={option}>{option}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl sx={{ width: { xs: 'calc(50% - 6px)', sm: 180 }, minWidth: 0, flexGrow: { xs: 1, sm: 0 } }} disabled={!genres.length}>
              <InputLabel>Genre</InputLabel>
              <Select label="Genre" value={genreFilter} onChange={(event) => setGenreFilter(event.target.value)}>
                <MenuItem value="all">All genres</MenuItem>
                {genres.map((genre) => (
                  <MenuItem key={genre.id} value={genre.id}>{genre.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl sx={{ width: { xs: 'calc(50% - 6px)', sm: 180 }, minWidth: 0, flexGrow: { xs: 1, sm: 0 } }}>
              <InputLabel>Show</InputLabel>
              <Select
                label="Show"
                value={collectionView}
                onChange={(event) => {
                  const nextView = event.target.value;
                  setSearchParams({ view: nextView });
                  if (nextView === 'editions') setDisplayMode('table');
                }}
              >
                <MenuItem value="movies">Movies</MenuItem>
                <MenuItem value="editions">Editions</MenuItem>
                <MenuItem value="favorites">Favorites</MenuItem>
                <MenuItem value="unwatched">Unwatched</MenuItem>
              </Select>
            </FormControl>
            {collectionView !== 'editions' && (
              <Stack direction="row" spacing={1} sx={{ flexShrink: 0, width: { xs: '100%', md: 'auto' } }}>
                <Button
                  variant={displayMode === 'table' ? 'contained' : 'outlined'}
                  onClick={() => setDisplayMode('table')}
                  aria-pressed={displayMode === 'table'}
                  sx={{ flex: 1 }}
                >
                  List
                </Button>
                <Button
                  variant={displayMode === 'carousel' ? 'contained' : 'outlined'}
                  onClick={() => setDisplayMode('carousel')}
                  aria-pressed={displayMode === 'carousel'}
                  sx={{ flex: 1 }}
                >
                  Posters
                </Button>
              </Stack>
            )}
          </Stack>
          {genreError && <Alert severity="error" sx={{ mt: 2 }}>{genreError}</Alert>}
        </Paper>

        {displayMode === 'carousel' && collectionView !== 'editions' ? (
          <Stack spacing={3} aria-label="Movies by genre">
            {isLoading && (
              <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ py: 6 }}>
                <CircularProgress size={20} />
                <Typography color="text.secondary">Loading your collection...</Typography>
              </Stack>
            )}
            {loadError && <Alert severity="error">{loadError}</Alert>}
            {!isLoading && !loadError && carouselShelves.map(({ genre, movies: shelfMovies }) => (
              <MovieCarouselRow
                key={genre.id}
                genre={genre}
                movies={shelfMovies}
                onSelect={(movie) => navigate(`/edit-movie/${movie.id}${movie.editions?.[0] ? `?editionId=${movie.editions[0].id}` : ''}`)}
              />
            ))}
            {!isLoading && !loadError && !carouselShelves.length && (
              <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
                <Typography color="text.secondary">No movies match these filters.</Typography>
              </Paper>
            )}
          </Stack>
        ) : (
        <>
          <CollectionMobileCards
            rows={displayedRows}
            isLoading={isLoading}
            loadError={loadError}
            onSelect={(movie, edition) => navigate(`/edit-movie/${movie.id}${edition ? `?editionId=${edition.id}` : ''}`)}
          />
          <TableContainer component={Paper} sx={{ display: { xs: 'none', md: 'block' }, borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Movie</TableCell>
                <TableCell>Genre</TableCell>
                <TableCell>Year</TableCell>
                <TableCell>Edition</TableCell>
                <TableCell>Barcode</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    <Stack direction="row" justifyContent="center" alignItems="center" spacing={1}>
                      <CircularProgress size={18} />
                      <span>Loading your collection...</span>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}
              {loadError && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <Alert severity="error">{loadError}</Alert>
                  </TableCell>
                </TableRow>
              )}
              {displayedRows.map(({ movie, edition }) => (
                <TableRow
                  key={`${movie.id}-${edition?.id || 'movie'}`}
                  hover
                  onClick={() => navigate(`/edit-movie/${movie.id}${edition ? `?editionId=${edition.id}` : ''}`)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Typography fontWeight={700}>{movie.alternativeTitle || movie.title}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[movie.title, movie.originalTitle].filter(Boolean).join(' · ') || 'Movie title unavailable'}
                    </Typography>
                  </TableCell>
                  <TableCell>{(movie.genres || []).map((genre) => genre.name).join(', ') || '—'}</TableCell>
                  <TableCell>{movie.releaseYear || '—'}</TableCell>
                  <TableCell>{edition ? `${formatLabel(edition.formatId)} · ${edition.editionYear || 'Year n/a'}` : 'No edition'}</TableCell>
                  <TableCell>{edition?.barcode || '—'}</TableCell>
                  <TableCell>
                    {movie.favorite ? 'Favorite' : movie.watchedStatus || 'unwatched'}
                    {movie.watchedDate ? ` · ${movie.watchedDate}` : ''}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      startIcon={<EditRounded />}
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(`/edit-movie/${movie.id}${edition ? `?editionId=${edition.id}` : ''}`);
                      }}
                    >
                      Edit
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && !loadError && !displayedRows.length && (
                <TableRow>
                  <TableCell colSpan={7} align="center">No catalog entries match these filters.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </TableContainer>
        </>
        )}
      </Stack>
    </Container>
  );
}

function CollectionMobileCards({ rows, isLoading, loadError, onSelect }: {
  rows: Array<{ movie: Movie; edition?: Edition }>;
  isLoading: boolean;
  loadError: string | null;
  onSelect: (movie: Movie, edition?: Edition) => void;
}) {
  if (isLoading) {
    return (
      <Stack direction="row" justifyContent="center" alignItems="center" spacing={1} sx={{ display: { xs: 'flex', md: 'none' }, py: 5 }}>
        <CircularProgress size={20} />
        <Typography color="text.secondary">Loading your collection...</Typography>
      </Stack>
    );
  }

  if (loadError) {
    return <Alert severity="error" sx={{ display: { xs: 'flex', md: 'none' } }}>{loadError}</Alert>;
  }

  if (!rows.length) {
    return (
      <Paper sx={{ display: { xs: 'block', md: 'none' }, p: 3, textAlign: 'center', borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
        <Typography color="text.secondary">No catalog entries match these filters.</Typography>
      </Paper>
    );
  }

  return (
    <Stack spacing={1.5} sx={{ display: { xs: 'flex', md: 'none' } }} aria-label="Collection movie list">
      {rows.map(({ movie, edition }) => (
        <Card key={`${movie.id}-${edition?.id || 'movie'}`} sx={{ overflow: 'hidden', background: 'rgba(18,28,46,0.96)' }}>
          <CardActionArea onClick={() => onSelect(movie, edition)} sx={{ textAlign: 'left' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>
                    {movie.alternativeTitle || movie.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25, overflowWrap: 'anywhere' }}>
                    {[movie.title, movie.originalTitle].filter(Boolean).join(' · ') || 'Movie title unavailable'}
                  </Typography>
                </Box>
                {movie.favorite && <Chip size="small" color="secondary" label="Favorite" />}
              </Stack>
              <Stack spacing={0.75} sx={{ mt: 1.5 }}>
                <Typography variant="body2">
                  {movie.releaseYear || 'Year unavailable'} · {movie.watchedStatus || 'unwatched'}
                  {movie.watchedDate ? ` · Watched: ${movie.watchedDate}` : ''}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {(movie.genres || []).map((genre) => genre.name).join(', ') || 'No genre'}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                  {edition
                    ? `${formatLabel(edition.formatId)}${edition.editionYear ? ` · ${edition.editionYear}` : ''}${edition.barcode ? ` · ${edition.barcode}` : ''}`
                    : 'No physical edition'}
                </Typography>
              </Stack>
            </CardContent>
          </CardActionArea>
          <CardActions sx={{ justifyContent: 'flex-end', px: 1.5, pt: 0 }}>
            <Button size="small" startIcon={<EditRounded />} onClick={() => onSelect(movie, edition)}>
              Edit details
            </Button>
          </CardActions>
        </Card>
      ))}
    </Stack>
  );
}

function MovieCarouselRow({ genre, movies, onSelect }: {
  genre: Genre;
  movies: Movie[];
  onSelect: (movie: Movie) => void;
}) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const sortedMovies = useMemo(
    () => [...movies].sort((left, right) => (left.alternativeTitle || left.title)
      .localeCompare(right.alternativeTitle || right.title, undefined, { sensitivity: 'base' })),
    [movies],
  );

  return (
    <Paper sx={{ p: { xs: 1.5, sm: 2.5 }, borderRadius: 3, background: 'rgba(18,28,46,0.9)' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6" fontWeight={700}>{genre.name}</Typography>
        <Stack direction="row">
          <IconButton
            aria-label={`Scroll ${genre.name} movies left`}
            onClick={() => carouselRef.current?.scrollBy({ left: -420, behavior: 'smooth' })}
          >
            <ChevronLeftRounded />
          </IconButton>
          <IconButton
            aria-label={`Scroll ${genre.name} movies right`}
            onClick={() => carouselRef.current?.scrollBy({ left: 420, behavior: 'smooth' })}
          >
            <ChevronRightRounded />
          </IconButton>
        </Stack>
      </Stack>
      <Box
        ref={carouselRef}
        role="list"
        aria-label={`${genre.name} movies`}
        sx={{
          display: 'flex',
          gap: 1.5,
          overflowX: 'auto',
          scrollBehavior: 'smooth',
          scrollSnapType: 'x mandatory',
          pb: 1,
          '&::-webkit-scrollbar': { height: 8 },
          '&::-webkit-scrollbar-thumb': { backgroundColor: 'rgba(138,180,255,0.35)', borderRadius: 4 },
        }}
      >
        {sortedMovies.map((movie) => (
          <MoviePosterCard key={movie.id} movie={movie} onSelect={onSelect} />
        ))}
      </Box>
    </Paper>
  );
}

function MoviePosterCard({ movie, onSelect }: {
  movie: Movie;
  onSelect: (movie: Movie) => void;
}) {
  const coverPath = movie.editions?.find((edition) => edition.frontCoverPath)?.frontCoverPath;
  const primaryImage = coverPath || movie.posterPath || '';
  const fallbackImage = coverPath && movie.posterPath && coverPath !== movie.posterPath ? movie.posterPath : '';
  const [imagePath, setImagePath] = useState(primaryImage);

  useEffect(() => {
    setImagePath(primaryImage);
  }, [primaryImage]);

  const imageUrl = imagePath;

  return (
    <Card
      role="listitem"
      sx={{
        width: { xs: 150, sm: 180 },
        minWidth: { xs: 150, sm: 180 },
        flexShrink: 0,
        overflow: 'hidden',
        scrollSnapAlign: 'start',
        background: '#101b2d',
        transition: 'transform 180ms ease, box-shadow 180ms ease',
        '&:hover': { transform: 'scale(1.04)', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' },
      }}
    >
      <Button
        onClick={() => onSelect(movie)}
        aria-label={`Open details for ${movie.alternativeTitle || movie.title}`}
        sx={{
          display: 'block',
          width: '100%',
          p: 0,
          textAlign: 'left',
          color: 'inherit',
          '&:hover': { background: 'transparent' },
        }}
      >
        {imageUrl ? (
          <CardMedia
            component="img"
            image={imageUrl}
            alt={`${movie.alternativeTitle || movie.title} cover`}
            onError={() => {
              if (fallbackImage && imagePath !== fallbackImage) setImagePath(fallbackImage);
              else setImagePath('');
            }}
            sx={{ aspectRatio: '2 / 3', objectFit: 'cover', background: 'rgba(255,255,255,0.04)' }}
          />
        ) : (
          <Box
            sx={{
              aspectRatio: '2 / 3',
              display: 'grid',
              placeItems: 'center',
              p: 2,
              textAlign: 'center',
              color: 'text.secondary',
              background: 'linear-gradient(145deg, rgba(138,180,255,0.18), rgba(18,28,46,0.9))',
            }}
          >
            <Typography variant="h6" fontWeight={700}>{movie.alternativeTitle || movie.title}</Typography>
          </Box>
        )}
        <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.5 } }}>
          <Typography fontWeight={700} noWrap title={movie.alternativeTitle || movie.title}>
            {movie.alternativeTitle || movie.title}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {movie.releaseYear || 'Year unavailable'} · {movie.genres?.map((genre) => genre.name).join(', ') || 'Unclassified'}
          </Typography>
        </CardContent>
      </Button>
    </Card>
  );
}

function formatLabel(formatId?: string | null) {
  return formatOptions.find((option) => option.id === formatId)?.label || formatId || 'Format n/a';
}

function StatCard({ title, value, subtitle, icon, to }: { title: string; value: number; subtitle: string; icon: React.ReactNode; to: string }) {
  return (
    <Grid item xs={6} sm={6} md={3}>
      <Paper
        component={RouterLink}
        to={to}
        sx={{ p: { xs: 1.25, sm: 2.5 }, borderRadius: 3, color: 'inherit', textDecoration: 'none', background: 'rgba(18,28,46,0.9)', display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2 }, minHeight: { xs: 92, sm: 112 }, cursor: 'pointer', '&:hover': { background: 'rgba(34,49,74,0.95)', transform: 'translateY(-2px)' }, transition: 'transform 150ms ease, background 150ms ease' }}
      >
        <Box sx={{ width: { xs: 34, sm: 48 }, height: { xs: 34, sm: 48 }, flexShrink: 0, borderRadius: 2, display: 'grid', placeItems: 'center', background: 'rgba(138,180,255,0.12)', color: '#8ab4ff' }}>
          {icon}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>{value}</Typography>
          <Typography variant="body2" color="text.secondary">{title}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>{subtitle}</Typography>
        </Box>
      </Paper>
    </Grid>
  );
}

type NamedOption = { id: string; name: string };

function NameOptionField({ label, value, options, helperText, onChange }: {
  label: string;
  value: string;
  options: NamedOption[];
  helperText: string;
  onChange: (value: string) => void;
}) {
  const selectedOption = options.find((option) => option.id === value || option.name === value);

  return (
    <Autocomplete<NamedOption, false, false, true>
      freeSolo
      options={options}
      value={selectedOption || (value || null)}
      getOptionLabel={(option) => (typeof option === 'string' ? option : option.name)}
      isOptionEqualToValue={(option, selected) => typeof selected !== 'string' && option.id === selected.id}
      onChange={(_event, selection) => {
        onChange(typeof selection === 'string' ? selection : selection?.id || '');
      }}
      onInputChange={(_event, input, reason) => {
        if (reason === 'input' || reason === 'clear') onChange(input);
      }}
      renderInput={(params) => <TextField {...params} label={label} helperText={helperText} />}
    />
  );
}

function SuggestionField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <Autocomplete<string, false, false, true>
      freeSolo
      options={options}
      value={value || null}
      onChange={(_event, selection) => onChange(selection || '')}
      onInputChange={(_event, input, reason) => {
        if (reason === 'input' || reason === 'clear') onChange(input);
      }}
      renderInput={(params) => <TextField {...params} label={label} />}
    />
  );
}

function UploadField({ label, value, uploading, uploaded, uploadedPath, uploadStatus, rotating, onChange, onRetry, onRotate }: {
  label: string;
  value: File | null;
  uploading: boolean;
  uploaded: boolean;
  uploadedPath?: string;
  uploadStatus?: CoverUploadStatus;
  rotating: boolean;
  onChange: (file: File | null) => void;
  onRetry: () => void;
  onRotate: () => void;
}) {
  const busy = uploading || rotating;
  return (
    <Box sx={{ minWidth: { xs: '100%', md: 220 }, flex: 1 }}>
      <Stack spacing={1}>
        <Button
          component="label"
          variant="outlined"
          disabled={busy}
          sx={{ width: '100%', py: 2.5, borderStyle: 'dashed', borderRadius: 3 }}
          startIcon={busy ? <CircularProgress size={18} /> : <PhotoCamera />}
        >
          {uploading ? `Preparing ${label.toLowerCase()}...` : rotating ? `Rotating ${label.toLowerCase()}...` : `Capture ${label.toLowerCase()}`}
          <input
            hidden
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] || null;
              event.currentTarget.value = '';
              if (file) {
                onChange(file);
              }
            }}
          />
        </Button>
        <Button
          component="label"
          variant="text"
          disabled={busy}
          sx={{ width: '100%' }}
        >
          Choose {label.toLowerCase()} from photos
          <input
            hidden
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] || null;
              event.currentTarget.value = '';
              if (file) {
                onChange(file);
              }
            }}
          />
        </Button>
      </Stack>
      {value && !uploading && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, textAlign: 'center', overflowWrap: 'anywhere' }}>
          {value.name}
        </Typography>
      )}
      <Typography variant="caption" color={uploaded ? 'success.main' : 'text.secondary'} sx={{ display: 'block', mt: 0.75, textAlign: 'center' }}>
        {uploading ? 'Preparing and saving the photo...' : uploaded ? 'Saved on the catalog server · ready to include' : 'Capture or choose a photo to include with this edition'}
      </Typography>
      {uploadStatus && (
        <Alert severity={uploadStatus.severity} sx={{ mt: 1, py: 0, overflowWrap: 'anywhere' }}>
          {uploadStatus.message}
        </Alert>
      )}
      {uploadStatus?.severity === 'error' && value && (
        <Button fullWidth size="small" onClick={onRetry} sx={{ mt: 0.5 }}>
          Retry {label.toLowerCase()} upload
        </Button>
      )}
      {uploadedPath && (
        <>
          <Button
            fullWidth
            size="small"
            disabled={busy}
            startIcon={rotating ? <CircularProgress size={16} /> : <RotateRightRounded />}
            onClick={onRotate}
            sx={{ mt: 0.5 }}
          >
            {rotating ? 'Rotating and saving...' : 'Rotate 180°'}
          </Button>
          <Box
            component="img"
            src={uploadedPath}
            alt={`${label} saved preview`}
            sx={{ display: 'block', width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 2, mt: 1, background: 'rgba(0,0,0,0.2)' }}
          />
        </>
      )}
    </Box>
  );
}

function isValidRetailBarcode(value: string) {
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

export default App;
