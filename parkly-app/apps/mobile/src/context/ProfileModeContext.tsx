import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

export type ProfileMode = 'PERSONAL' | 'CORPORATE';

interface ProfileModeContextValue {
  mode: ProfileMode;
  isCorporate: boolean;
  corporateJoined: boolean;
  corporateCompany: string | null;
  setMode: (m: ProfileMode) => Promise<void>;
  joinCorporate: (code: string, company?: string) => Promise<boolean>;
  leaveCorporate: () => Promise<void>;
}

const ProfileModeContext = createContext<ProfileModeContextValue | null>(null);

const STORAGE_KEYS = {
  MODE: 'parkly.profile.mode',
  JOINED: 'parkly.corporate.joined',
  COMPANY: 'parkly.corporate.company',
};

async function readStore(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function writeStore(key: string, val: string | null) {
  if (Platform.OS === 'web') return;
  try {
    if (val === null) await SecureStore.deleteItemAsync(key);
    else await SecureStore.setItemAsync(key, val);
  } catch {
    // secure store fallback
  }
}

export function ProfileModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ProfileMode>('PERSONAL');
  const [corporateJoined, setCorporateJoined] = useState(false);
  const [corporateCompany, setCorporateCompany] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      const [storedMode, storedJoined, storedCompany] = await Promise.all([
        readStore(STORAGE_KEYS.MODE),
        readStore(STORAGE_KEYS.JOINED),
        readStore(STORAGE_KEYS.COMPANY),
      ]);
      if (!active) return;
      if (storedJoined === '1') {
        setCorporateJoined(true);
        setCorporateCompany(storedCompany || 'Corporate Fleet Member');
        if (storedMode === 'CORPORATE') setModeState('CORPORATE');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const setMode = async (nextMode: ProfileMode) => {
    setModeState(nextMode);
    await writeStore(STORAGE_KEYS.MODE, nextMode);
  };

  const joinCorporate = async (code: string, company = 'Partner Corporate Fleet') => {
    const clean = code.trim().toUpperCase();
    if (!clean) return false;
    const assignedCompany = clean.startsWith('CORP') ? `${clean} Group` : company;
    setCorporateJoined(true);
    setCorporateCompany(assignedCompany);
    setModeState('CORPORATE');
    await Promise.all([
      writeStore(STORAGE_KEYS.JOINED, '1'),
      writeStore(STORAGE_KEYS.COMPANY, assignedCompany),
      writeStore(STORAGE_KEYS.MODE, 'CORPORATE'),
    ]);
    return true;
  };

  const leaveCorporate = async () => {
    setCorporateJoined(false);
    setCorporateCompany(null);
    setModeState('PERSONAL');
    await Promise.all([
      writeStore(STORAGE_KEYS.JOINED, null),
      writeStore(STORAGE_KEYS.COMPANY, null),
      writeStore(STORAGE_KEYS.MODE, 'PERSONAL'),
    ]);
  };

  return (
    <ProfileModeContext.Provider
      value={{
        mode,
        isCorporate: mode === 'CORPORATE',
        corporateJoined,
        corporateCompany,
        setMode,
        joinCorporate,
        leaveCorporate,
      }}
    >
      {children}
    </ProfileModeContext.Provider>
  );
}

export function useProfileMode(): ProfileModeContextValue {
  const ctx = useContext(ProfileModeContext);
  if (!ctx) throw new Error('useProfileMode must be used within ProfileModeProvider');
  return ctx;
}
