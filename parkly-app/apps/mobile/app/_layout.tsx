import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
} from '@expo-google-fonts/jetbrains-mono';
import {
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Text, ThemeProvider, useColorSchemeName, useTheme } from '@parkly/ui-native';
import { useFonts } from 'expo-font';
import { Stack, usePathname, useRouter, useSegments, type Href } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { AuthProvider, useAuth } from '../src/auth/AuthProvider';
import { Screen } from '../src/components/Screen';
import { isConfigured } from '../src/lib/config';
import { guardRedirect, type RouteGroup } from '../src/logic/route-guard';

void SplashScreen.preventAutoHideAsync();

// Only the weights the type tokens use (doc 08 §1).
const FONTS = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
};

/** Sends the user to the right place for their auth/onboarding state (src/logic/route-guard). */
function RouteGuard() {
  const auth = useAuth();
  const segments = useSegments();
  const pathname = usePathname();
  const router = useRouter();

  const target = guardRedirect(
    {
      initialised: auth.initialised,
      signedIn: !!auth.session,
      me: auth.me,
      vehicleCount: auth.vehicles?.length ?? null,
      vehicleStepSkipped: auth.vehicleStepSkipped,
    },
    { group: segments[0] as RouteGroup, path: pathname },
  );

  useEffect(() => {
    if (target) router.replace(target as Href);
  }, [target, router]);

  return null;
}

function ThemedApp() {
  const theme = useTheme();
  const scheme = useColorSchemeName();
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: theme.color.bg.canvas },
        }}
      />
      <RouteGuard />
    </>
  );
}

/** Shown in development when EXPO_PUBLIC_SUPABASE_* are missing. */
function SetupNeeded() {
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
        <Text variant="heading.lg">Configuration needed</Text>
        <Text tone="secondary">
          Copy apps/mobile/.env.example to apps/mobile/.env, fill in EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart Expo.
        </Text>
      </View>
    </Screen>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts(FONTS);

  useEffect(() => {
    if (loaded || error) void SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <ThemeProvider>
      {isConfigured ? (
        <AuthProvider>
          <ThemedApp />
        </AuthProvider>
      ) : (
        <SetupNeeded />
      )}
    </ThemeProvider>
  );
}
