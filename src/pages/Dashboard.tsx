import { useEffect, useState, useMemo } from 'react';
import { Box, Button, Card, CardActionArea, CardActions, CardContent, CardMedia, Chip, CircularProgress, Container, FormControl, Grid, IconButton, InputAdornment, InputLabel, List, ListItem, ListItemText, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography, Alert } from '@mui/material';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import LibraryAddRoundedIcon from '@mui/icons-material/LibraryAddRounded';
import PhotoCamera from '@mui/icons-material/PhotoCamera';
import SearchIcon from '@mui/icons-material/Search';
import EditRounded from '@mui/icons-material/EditRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { Summary, Movie, Genre, Edition } from '../types';
import { API_BASE } from '../utils/helpers';
import { formatOptions, watchedOptions } from '../utils/constants';

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

export function DashboardPage() {
  const [summary, setSummary] = useState<Summary>({ totalMovies: 0, totalEditions: 0, favorites: 0, unwatched: 0 });
  const [movies, setMovies] = useState<Movie[]>([]);
  const alphabetizedMovies = useMemo(
    () => [...movies].sort((left, right) => (left.alternativeTitle || left.title).localeCompare(right.alternativeTitle || right.title, undefined, { sensitivity: 'base' })),
    [movies],
  );

  useEffect(() => {
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

    void fetchSummary();
    void fetchMovies();
  }, []);

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
