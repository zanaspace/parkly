import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'parkly.deviceId';
let cached: string | null = null;

/**
 * Stable per-install id sent to /v1/auth/bootstrap and /v1/me/devices
 * (doc 05 §4.4 device binding). Generated once, kept in SecureStore.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  if (Platform.OS === 'web') {
    cached = Crypto.randomUUID();
    return cached;
  }
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing) {
    cached = existing;
    return existing;
  }
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(KEY, id, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
  cached = id;
  return id;
}
