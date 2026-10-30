import type { Me, Vehicle } from '@parkly/contracts';
import type { Session } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';
import { platformFor } from '../logic/forms';
import { ApiError } from '../lib/api';
import { api, tickets } from '../lib/client';
import { config } from '../lib/config';
import { getDeviceId } from '../lib/device';
import { supabase } from '../lib/supabase';
import { registerForPush } from '../notifications/push';

import { clearDevSession, createDevSession, getStoredDevSession, saveDevSession } from './dev-auth';

type AuthState = {
  initialised: boolean;
  session: Session | null;
  me: Me | null;
  vehicles: Vehicle[] | null;
  vehicleStepSkipped: boolean;
  /** Set when bootstrap failed (e.g. API unreachable); the OTP screen shows it with a retry. */
  bootstrapError: string | null;
};

type AuthContextValue = AuthState & {
  setMe: (me: Me) => void;
  refreshVehicles: () => Promise<void>;
  retryBootstrap: () => Promise<void>;
  skipVehicleStep: () => Promise<void>;
  /** Revokes this device's (or every) session on the server, then clears local state. */
  signOut: (scope: 'device' | 'all') => Promise<void>;
  /** Bypasses SMS OTP in development and signs in immediately with a test driver session. */
  signInDev: (phone: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const skipKey = (userId: string) => `parkly.vehicleSkipped.${userId}`;

async function readSkipped(userId: string): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  return (await SecureStore.getItemAsync(skipKey(userId))) === '1';
}

/**
 * Owns the Supabase session and the Parkly profile. After every sign-in (and
 * on app start with a stored session) it calls /v1/auth/bootstrap, which
 * creates the profile if needed and records this device against the session.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    initialised: false,
    session: null,
    me: null,
    vehicles: null,
    vehicleStepSkipped: false,
    bootstrapError: null,
  });
  const bootstrappedFor = useRef<string | null>(null);

  const bootstrap = useCallback(async (session: Session) => {
    bootstrappedFor.current = session.user.id;
    try {
      const { user } = await api.bootstrap({
        deviceId: await getDeviceId(),
        platform: platformFor(Platform.OS),
        appVersion: config.appVersion,
        // The driver app: an email sign-up becomes a driver (ADR 0015).
        asDriver: true,
      });
      // Push for booking notices; never blocks sign-in.
      void registerForPush();
      const [vehicles, skipped] = await Promise.all([api.vehicles(), readSkipped(user.id)]);
      setState((s) => ({
        ...s,
        me: user,
        vehicles,
        vehicleStepSkipped: skipped,
        bootstrapError: null,
      }));
    } catch (err) {
      bootstrappedFor.current = null;
      if (err instanceof ApiError && (err.status === 401 || err.code === 'AUTH_ACCOUNT_LOCKED')) {
        // Session no longer valid on the server: drop it locally.
        await clearDevSession();
        await supabase.auth.signOut({ scope: 'local' });
      }
      setState((s) => ({
        ...s,
        bootstrapError: err instanceof Error ? err.message : 'Could not load your profile.',
      }));
    }
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const devSession = await getStoredDevSession();
      if (!active) return;
      if (devSession) {
        setState((s) => ({ ...s, initialised: true, session: devSession }));
        void bootstrap(devSession);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setState((s) => ({ ...s, initialised: true, session: data.session }));
      if (data.session) void bootstrap(data.session);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setState((s) =>
        session
          ? { ...s, session }
          : {
              ...s,
              session: null,
              me: null,
              vehicles: null,
              vehicleStepSkipped: false,
              bootstrapError: null,
            },
      );
      if (!session) bootstrappedFor.current = null;
      else if (bootstrappedFor.current !== session.user.id) void bootstrap(session);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [bootstrap]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      setMe: (me) => setState((s) => ({ ...s, me })),
      refreshVehicles: async () => {
        const vehicles = await api.vehicles();
        setState((s) => ({ ...s, vehicles }));
      },
      retryBootstrap: async () => {
        if (state.session) await bootstrap(state.session);
      },
      skipVehicleStep: async () => {
        if (state.me && Platform.OS !== 'web')
          await SecureStore.setItemAsync(skipKey(state.me.id), '1');
        setState((s) => ({ ...s, vehicleStepSkipped: true }));
      },
      signOut: async (scope) => {
        try {
          await api.revokeSessions(scope);
        } catch {
          // Best effort: still clear the local session so the user is signed out on this device.
        }
        await clearDevSession();
        // Tickets carry the plate: never leave them behind for the next person.
        if (state.me) await tickets.clear(state.me.id).catch(() => undefined);
        await supabase.auth.signOut({ scope: 'local' });
        setState((s) => ({
          ...s,
          session: null,
          me: null,
          vehicles: null,
          vehicleStepSkipped: false,
          bootstrapError: null,
        }));
      },
      signInDev: async (phone: string) => {
        const devSession = createDevSession(phone);
        await saveDevSession(devSession);
        setState((s) => ({ ...s, session: devSession, bootstrapError: null }));
        await bootstrap(devSession);
      },
    }),
    [state, bootstrap],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
