/**
 * Base HTTP client.
 * Reads VITE_API_BASE from the environment; falls back to the current origin.
 * All requests throw a plain Error with a human-readable message on failure.
 */
const BASE_URL =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.PROD ? 'https://decrypto-production.up.railway.app' : '');

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? body?.message ?? `HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
};
