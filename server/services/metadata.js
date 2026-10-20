export const toTmdbResult = (item) => ({
  id: item.id,
  title: item.title || item.name || 'Untitled',
  original_title: item.original_title || item.originalTitle || null,
  originalTitle: item.original_title || item.originalTitle || null,
  release_date: item.release_date || item.first_air_date || null,
  releaseDate: item.release_date || item.first_air_date || null,
  overview: item.overview || item.synopsis || '',
  poster_path: item.poster_path || null,
  backdrop_path: item.backdrop_path || null,
  imdb_id: item.imdb_id || null,
  source: 'tmdb',
});

export const lookupMetadata = async (query) => {
  const results = [];
  const tmdbReadAccessToken = process.env.TMDB_READ_ACCESS_TOKEN || '';
  const tmdbApiKey = process.env.TMDB_API_KEY || '';
  const omdbApiKey = process.env.OMDB_API_KEY || process.env.IMDB_API_KEY || '';
  const failedProviders = [];

  if (tmdbReadAccessToken || tmdbApiKey) {
    try {
      const tmdbUrl = new URL('https://api.themoviedb.org/3/search/movie');
      tmdbUrl.searchParams.set('query', query);

      const headers = { accept: 'application/json' };
      if (tmdbReadAccessToken) {
        headers.authorization = `Bearer ${tmdbReadAccessToken}`;
      } else {
        tmdbUrl.searchParams.set('api_key', tmdbApiKey);
      }

      const response = await fetch(tmdbUrl, { headers });
      if (!response.ok) {
        throw new Error(`TMDb returned HTTP ${response.status}.`);
      }

      const data = await response.json();
      if (Array.isArray(data.results)) {
        for (const item of data.results) {
          results.push(toTmdbResult(item));
        }
      }
    } catch (error) {
      console.error('TMDb search failed', error instanceof Error ? error.name : 'Unknown error');
      failedProviders.push('tmdb');
    }
  }

  if (omdbApiKey) {
    try {
      const response = await fetch(`https://www.omdbapi.com/?apikey=${omdbApiKey}&s=${encodeURIComponent(query)}`);
      if (!response.ok) {
        throw new Error(`OMDb returned HTTP ${response.status}.`);
      }

      const data = await response.json();
      if (Array.isArray(data.Search)) {
        for (const item of data.Search) {
          results.push({
            title: item.Title,
            originalTitle: item.Title,
            release_date: item.Year || null,
            releaseDate: item.Year || null,
            overview: item.Plot || item.Type || '',
            poster_path: item.Poster || null,
            imdb_id: item.imdbID || null,
            source: 'imdb',
          });
        }
      }
    } catch (error) {
      console.error('OMDb search failed', error instanceof Error ? error.name : 'Unknown error');
      failedProviders.push('imdb');
    }
  }

  if (!results.length) {
    if (failedProviders.length) {
      return {
        status: 502,
        payload: {
          message: 'Metadata provider search failed. Check the configured API credentials and try again.',
          providers: failedProviders,
          results: [],
        },
      };
    }

    if (!tmdbReadAccessToken && !tmdbApiKey && !omdbApiKey) {
      return {
        status: 503,
        payload: {
          message: 'No metadata provider is configured. Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY in .env.',
          results: [],
        },
      };
    }

    return { status: 200, payload: { provider: 'none', results: [] } };
  }

  return {
    status: 200,
    payload: {
      provider: results.some((item) => item.source === 'tmdb') ? 'tmdb+imdb' : 'imdb',
      results,
    },
  };
};
