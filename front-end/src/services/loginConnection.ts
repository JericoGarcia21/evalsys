import axios from 'axios';
import api from './api';

export type LoginPhase = 'connecting' | 'signing-in' | 'reconnecting';
const readinessWindowMs = 15000;
const startupWaitMs = 60000;
let readyUntil = 0;
let readiness: Promise<void> | null = null;

const transientConnectionError = (error: unknown) => axios.isAxiosError(error) &&
  (!error.response || [502, 503, 504].includes(error.response.status));

export const ensureServerReady = (force = false): Promise<void> => {
  if (!navigator.onLine) return Promise.reject(new Error('You are offline. Reconnect to the internet and try again.'));
  if (!force && Date.now() < readyUntil) return Promise.resolve();
  if (readiness) return readiness;
  readiness = (async () => {
    const deadline = Date.now() + startupWaitMs;
    while (Date.now() < deadline) {
      try {
        const response = await api.get('/health', { timeout: Math.max(1, Math.min(10000, deadline - Date.now())) });
        if (response.data?.status !== 'ok') throw new Error('The sign-in service is unavailable. Please try again shortly.');
        readyUntil = Date.now() + readinessWindowMs;
        return;
      } catch (error) {
        if (!navigator.onLine) throw new Error('You are offline. Reconnect to the internet and try again.', { cause: error });
        if (!transientConnectionError(error)) throw error;
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        await new Promise(resolve => window.setTimeout(resolve, Math.min(1000, remaining)));
      }
    }
    throw new Error('The server is taking too long to respond. Please try again shortly. Your sign-in details have been kept.');
  })().finally(() => { readiness = null; });
  return readiness;
};

export const requestLogin = async (email: string, password: string, onPhase?: (phase: LoginPhase) => void) => {
  onPhase?.('connecting');
  await ensureServerReady();
  onPhase?.('signing-in');
  try {
    return await api.post('/auth/login', { email, password }, { timeout: 30000 });
  } catch (error) {
    // Retry transport failures only. Authentication, rate limits and maintenance responses are authoritative.
    if (!axios.isAxiosError(error) || error.response || !navigator.onLine) throw error;
    readyUntil = 0;
    onPhase?.('reconnecting');
    await ensureServerReady(true);
    onPhase?.('signing-in');
    return api.post('/auth/login', { email, password }, { timeout: 30000 });
  }
};
