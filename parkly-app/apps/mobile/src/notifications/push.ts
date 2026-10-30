import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { api } from '../lib/client';
import { config } from '../lib/config';
import { getDeviceId } from '../lib/device';
import { platformFor } from '../logic/forms';
import { pushTarget } from '../logic/push-target';

// Show booking notices while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/**
 * Asks for permission and registers this phone's Expo push token with the API
 * (doc 20 S6 task 8). Best effort: a refusal, a simulator or Expo Go (which
 * can't get tokens on Android) just means SMS covers the critical messages.
 */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const current = await Notifications.getPermissionsAsync();
    const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    if (Platform.OS === 'android')
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Bookings',
        importance: Notifications.AndroidImportance.HIGH,
      });
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: pushToken } = await Notifications.getExpoPushTokenAsync(
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

/** Opens the booking a tapped notification is about. */
export function usePushTaps() {
  useEffect(() => {
    const open = (response: Notifications.NotificationResponse | null) => {
      const path = pushTarget(
        response?.notification.request.content.data as Record<string, unknown> | undefined,
      );
      if (path) router.push(path as never);
    };
    // The tap that launched the app, then taps while it runs.
    void Notifications.getLastNotificationResponseAsync().then(open);
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
}
