import assert from 'node:assert/strict';
import test from 'node:test';

const originalFetch = globalThis.fetch;
const savedEnvironment = {
  token: process.env.TMDB_READ_ACCESS_TOKEN,
  apiKey: process.env.TMDB_API_KEY,
  omdbKey: process.env.OMDB_API_KEY,
  imdbKey: process.env.IMDB_API_KEY,
};
const capturedRequests = [];
let tmdbStatus = 200;

process.env.TMDB_READ_ACCESS_TOKEN = 'integration-test-read-token';
process.env.TMDB_API_KEY = 'integration-test-api-key';
process.env.OMDB_API_KEY = '';
process.env.IMDB_API_KEY = '';

globalThis.fetch = async (input, options) => {
  const url = input instanceof URL
    ? input
    : new URL(typeof input === 'string' ? input : input.url);
  if (url.hostname === 'api.themoviedb.org') {
    capturedRequests.push({ url, headers: new Headers(options?.headers) });
    return new Response(
      tmdbStatus === 200 ? JSON.stringify({ results: [{ id: 644, title: 'A.I. Artificial Intelligence' }] }) : '{}',
      { status: tmdbStatus, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return originalFetch(input, options);
};

const { app } = await import('../server/index.js');

test('TMDb supports Read Access Token and v3 API key without demo-shaped auth failures', async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const tokenResponse = await originalFetch(`${baseUrl}/api/search?query=A.I.`);
    const tokenResult = await tokenResponse.json();
    assert.equal(tokenResponse.status, 200);
    assert.equal(tokenResult.results[0].source, 'tmdb');
    assert.equal(capturedRequests[0].headers.get('authorization'), 'Bearer integration-test-read-token');
    assert.equal(capturedRequests[0].url.searchParams.has('api_key'), false);

    delete process.env.TMDB_READ_ACCESS_TOKEN;
    const apiKeyResponse = await originalFetch(`${baseUrl}/api/search?query=A.I.`);
    assert.equal(apiKeyResponse.status, 200);
    assert.equal(capturedRequests[1].url.searchParams.get('api_key'), 'integration-test-api-key');
    assert.equal(capturedRequests[1].headers.has('authorization'), false);

    tmdbStatus = 401;
    const rejectedResponse = await originalFetch(`${baseUrl}/api/search?query=A.I.`);
    const rejectedResult = await rejectedResponse.json();
    assert.equal(rejectedResponse.status, 502);
    assert.deepEqual(rejectedResult.providers, ['tmdb']);
    assert.deepEqual(rejectedResult.results, []);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    globalThis.fetch = originalFetch;

    if (savedEnvironment.token === undefined) delete process.env.TMDB_READ_ACCESS_TOKEN;
    else process.env.TMDB_READ_ACCESS_TOKEN = savedEnvironment.token;
    if (savedEnvironment.apiKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = savedEnvironment.apiKey;
    if (savedEnvironment.omdbKey === undefined) delete process.env.OMDB_API_KEY;
    else process.env.OMDB_API_KEY = savedEnvironment.omdbKey;
    if (savedEnvironment.imdbKey === undefined) delete process.env.IMDB_API_KEY;
    else process.env.IMDB_API_KEY = savedEnvironment.imdbKey;
  }
});
