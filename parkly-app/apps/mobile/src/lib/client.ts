import { getStoredDevSession } from '../auth/dev-auth';
import { createApiClient } from './api';
import { config } from './config';
import { offlineTickets } from './offline-tickets';
import { storage, supabase } from './supabase';

/** The app's API client; always sends the current (auto-refreshed) access token. */
export const api = createApiClient({
  baseUrl: config.apiUrl,
  getAccessToken: async () => {
    const dev = await getStoredDevSession();
    if (dev?.access_token) return dev.access_token;
    return (await supabase.auth.getSession()).data.session?.access_token ?? null;
  },
});

/** Paid tickets saved on the phone for gates with no signal. */
export const tickets = offlineTickets(storage);
