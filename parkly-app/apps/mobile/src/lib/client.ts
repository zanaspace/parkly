import { createApiClient } from './api';
import { config } from './config';
import { supabase } from './supabase';

/** The app's API client; always sends the current (auto-refreshed) access token. */
export const api = createApiClient({
  baseUrl: config.apiUrl,
  getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
});
