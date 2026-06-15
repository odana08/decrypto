/**
 * Centralized API client.
 *
 * All requests go through /api which Vite proxies to the FastAPI backend
 * on port 8000 during development. In production, set VITE_API_BASE to the
 * deployed backend URL via an environment variable.
 *
 * Convention: every function returns the parsed JSON on success, or throws
 * an ApiError so consumers can handle it uniformly.
 */

const API_BASE =
  import.meta.env.VITE_API_BASE ??
  (import.meta.env.PROD ? 'https://decrypto-production.up.railway.app' : '');
const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAY_MS = 350;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function isRetryableMethod(method) {
  return ['GET', 'HEAD'].includes(String(method ?? 'GET').toUpperCase());
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function _fetch(path, options = {}) {
  const method = String(options.method ?? 'GET').toUpperCase();
  const maxAttempts = isRetryableMethod(method) ? 3 : 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45_000);

    try {
      const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        signal: controller.signal,
      });

      if (!res.ok) {
        let detail = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          detail = body.detail ?? body.message ?? detail;
        } catch (_) {
          // Ignore parse failure and keep the generic message.
        }

        const apiError = new ApiError(detail, res.status);
        if (attempt < maxAttempts && RETRYABLE_STATUSES.has(res.status)) {
          await wait(RETRY_DELAY_MS * attempt);
          continue;
        }

        throw apiError;
      }

      return await res.json();
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new ApiError('Request timed out. The analysis is taking longer than expected - please try again.', 408);
      }

      const isNetworkFailure = err instanceof TypeError;
      const isRetryableStatus = RETRYABLE_STATUSES.has(err?.status);
      if (attempt < maxAttempts && (isNetworkFailure || isRetryableStatus)) {
        await wait(RETRY_DELAY_MS * attempt);
        continue;
      }

      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new ApiError('Request failed after multiple attempts.', 502);
}

export function fetchHealth() {
  return _fetch('/health');
}

export function fetchWalletRisk(address) {
  return _fetch(`/api/wallet/${encodeURIComponent(address)}`);
}

export function fetchWalletGraph(address) {
  return _fetch(`/api/graph/${encodeURIComponent(address)}`);
}

export function fetchTransactionRisk(txid) {
  return _fetch(`/api/transaction/${encodeURIComponent(txid)}`);
}

export function fetchNetworkSummary() {
  return _fetch('/api/network/summary');
}
