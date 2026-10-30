import Constants, { ExecutionEnvironment } from 'expo-constants';
import type * as NotificationsModule from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from '../lib/client';
import { config } from '../lib/config';
import { getDeviceId } from '../lib/device';
import { platformFor } from '../logic/forms';
import { pushTarget } from '../logic/push-target';

type Notifications = typeof NotificationsModule;

/**
 * Expo Go has no push module (on Android it was removed in SDK 53), and
 * importing expo-notifications there throws at load time, taking every
 * screen that imports this file down with it. So it is loaded lazily, and
 * only in a development or EAS build.
 */
const pushAvailable =
  Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let loaded: Promise<Notifications | null> | null = null;
function notifications(): Promise<Notifications | null> {
  if (!pushAvailable) return Promise.resolve(null);
  loaded ??= import('expo-notifications')
    .then((N) => {
      // Show booking notices while the app is open, too.
      N.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
        }),
      });
      return N;
    })
    .catch(() => null);
  return loaded;
}

/**
 * Asks for permission and registers this phone's Expo push token with the API
 * (doc 20 S6 task 8). Best effort: a refusal, a simulator or Expo Go just
 * means no push, and SMS covers the critical messages.
 */
export async function registerForPush(): Promise<void> {
  const N = await notifications();
  if (!N) return;
  try {
    const current = await N.getPermissionsAsync();
    const granted = current.granted || (await N.requestPermissionsAsync()).granted;
    if (!granted) return;
    if (Platform.OS === 'android')
      await N.setNotificationChannelAsync('default', {
        name: 'Bookings',
        importance: N.AndroidImportance.HIGH,
      });
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: pushToken } = await N.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    await api.registerDevice({
      deviceId: await getDeviceId(),
      platform: platformFor(Platform.OS),
      appVersion: config.appVersion,
      pushToken,
    });
  } catch {
    // Not fatal: the app works without push.
  }
}

/** Opens the booking a tapped notification is about. Does nothing without push. */
export function usePushTaps() {
  useEffect(() => {
    let live = true;
    let sub: { remove(): void } | undefined;
    const open = (response: NotificationsModule.NotificationResponse | null) => {
      const path = pushTarget(
        response?.notification.request.content.data as Record<string, unknown> | undefined,
      );
      if (path) router.push(path as never);
    };
    void notifications().then((N) => {
      if (!N || !live) return;
      // The tap that launched the app, then taps while it runs.
      void N.getLastNotificationResponseAsync().then(open);
      sub = N.addNotificationResponseReceivedListener(open);
    });
    return () => {
      live = false;
      sub?.remove();
    };
  }, []);
}
