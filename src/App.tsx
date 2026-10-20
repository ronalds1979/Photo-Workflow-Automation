import { useLocation, useNavigate, Route, Routes, Link as RouterLink } from 'react-router-dom';
import { AppBar, Box, Button, Stack, Toolbar, Typography, BottomNavigation, BottomNavigationAction } from '@mui/material';
import HomeRounded from '@mui/icons-material/HomeRounded';
import AddCircleOutlineRounded from '@mui/icons-material/AddCircleOutlineRounded';
import MovieRounded from '@mui/icons-material/MovieRounded';

import { DashboardPage } from './pages/Dashboard';
import { AddMoviePage } from './pages/AddMovie';
import { CollectionPage } from './pages/Collection';

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

export default App;
