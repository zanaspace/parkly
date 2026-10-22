import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { chunkedStorage, memoryStore, type KeyValueStore } from './chunked-storage';
import { config } from './config';

const secureStore: KeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    }),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

/**
 * Doc 05 §4.4: the session lives only in the Keychain / Android Keystore via
 * SecureStore (never AsyncStorage). The browser preview has no secure store,
 * so it keeps the session in memory only (lost on reload) rather than in
 * localStorage.
 */
export const storage = chunkedStorage(Platform.OS === 'web' ? memoryStore() : secureStore);

export const supabase = createClient(
  // Placeholders keep the client constructible when env is missing; the root
  // layout shows a setup screen instead of making calls in that case.
  config.supabaseUrl || 'http://localhost:54321',
  config.supabasePublishableKey || 'missing-publishable-key',
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);
