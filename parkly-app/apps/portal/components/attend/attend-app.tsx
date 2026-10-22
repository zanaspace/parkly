'use client';

import type { Manifest, ManifestBooking } from '@parkly/contracts';
import { Button, Input, Text } from '@parkly/ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AttendError, attendApi } from '../../lib/attend/client';
import {
  checkCode,
  checkPlate,
  checkScan,
  localStatus,
  parkedNow,
  type GateResult,
} from '../../lib/attend/gate';
import { hashPin, IDLE_LOCK_MS, isValidPin, MAX_PIN_TRIES, verifyPin } from '../../lib/attend/pin';
import {
  applyResults,
  nextBatch,
  type QueuedEvent,
  type SyncProblem,
} from '../../lib/attend/queue';
import { attendStorage, type AttendSettings } from '../../lib/attend/storage';
import { Scanner } from './scanner';

const SYNC_EVERY_MS = 15_000;
const MANIFEST_EVERY_MS = 5 * 60_000;
const STALE_MANIFEST_MS = 24 * 60 * 60_000;
const BATCH = 100;

type Mode = 'in' | 'out';
type Screen =
  | { name: 'loading' }
  | { name: 'signed-out' }
  | { name: 'blocked' }
  | { name: 'pick-lot'; lots: { id: string; name: string }[] }
  | { name: 'waiting'; lotId: string }
  | { name: 'set-pin' }
  | { name: 'locked' }
  | { name: 'home' }
  | { name: 'scan'; mode: Mode }
  | { name: 'lookup'; mode: Mode }
  | { name: 'result'; mode: Mode; result: GateResult; method: 'QR' | 'CODE' | 'PLATE' }
  | { name: 'choose'; mode: Mode; results: GateResult[] }
  | { name: 'exits' }
  | { name: 'issue' }
  | { name: 'queue' };

const REASON_TEXT: Record<string, string> = {
  OK: 'Valid booking',
  EARLY: 'Early: more than 30 minutes before the start',
  LATE: 'Late arrival',
  ALREADY_IN: 'Already checked in',
  PROVISIONAL: 'Valid ticket, not in today’s list yet',
  CANCELLED: 'Booking cancelled or not paid',
  ENDED: 'This booking’s time is over',
  NOT_FOUND: 'No booking found',
  INVALID: 'Not a Parkly ticket, or it was changed',
  WRONG_LOT: 'This ticket is for another car park',
};
const OVERRIDES = ['Driver early', 'Late arrival', 'Manager approved', 'Plate checked by hand'];
const fmtTime = (iso: string | Date | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('en-NG', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Lagos',
      })
    : '—';

/** The attendant PWA (doc 03 §3, ADR 0005). Works offline from IndexedDB; syncs when it can. */
export function AttendApp({ signedIn }: { signedIn: boolean }) {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [settings, setSettings] = useState<AttendSettings | null>(null);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [queue, setQueue] = useState<QueuedEvent[]>([]);
  const [problems, setProblems] = useState<SyncProblem[]>([]);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const lastActive = useRef(Date.now());
  const syncing = useRef(false);

  const now = useCallback(() => new Date(Date.now() + (settings?.clockOffsetMs ?? 0)), [settings]);

  const handleAuthError = useCallback(async (err: unknown) => {
    if (!(err instanceof AttendError)) return false;
    if (err.code === 'DEVICE_REVOKED') {
      await attendStorage.wipe();
      setScreen({ name: 'blocked' });
      return true;
    }
    if (err.status === 401) {
      setScreen({ name: 'signed-out' });
      return true;
    }
    return false;
  }, []);

  const refreshManifest = useCallback(async (s: AttendSettings) => {
    if (!s.lotId) return;
    const sentAt = Date.now();
    const m = await attendApi.manifest(s.lotId, s.clientDeviceId);
    await attendStorage.saveManifest(m);
    const offset = Date.parse(m.serverTime) - Math.round((sentAt + Date.now()) / 2);
    const next = await attendStorage.saveSettings({
      clockOffsetMs: offset,
      manifestAt: new Date().toISOString(),
    });
    setSettings(next);
    setManifest(m);
  }, []);

  const syncNow = useCallback(async () => {
    const s = settings;
    if (!s?.lotId || syncing.current) return;
    syncing.current = true;
    try {
      const all = await attendStorage.queue();
      const batch = nextBatch(all, BATCH);
      if (batch.length > 0) {
        const res = await attendApi.sync({
          clientDeviceId: s.clientDeviceId,
          lotId: s.lotId,
          batchId: crypto.randomUUID(),
          deviceSentAt: new Date().toISOString(),
          events: batch,
        });
        const { queue: left, problems: found } = applyResults(all, res.results);
        await attendStorage.replaceQueue(left);
        if (found.length) await attendStorage.addProblems(found);
        setQueue(left);
        setProblems(await attendStorage.problems());
      }
      setSettings(await attendStorage.saveSettings({ lastSyncAt: new Date().toISOString() }));
      setOnline(true);
    } catch (err) {
      if (!(await handleAuthError(err)) && err instanceof AttendError && err.offline)
        setOnline(false);
    } finally {
      syncing.current = false;
    }
  }, [settings, handleAuthError]);

  // Start: local data first (works offline), then the network.
  useEffect(() => {
    (async () => {
      setOnline(navigator.onLine);
      const s = await attendStorage.settings();
      setSettings(s);
      setQueue(await attendStorage.queue());
      setProblems(await attendStorage.problems());
      if (s.lotId) {
        const cached = await attendStorage.manifest(s.lotId);
        if (cached) setManifest(cached);
      }
      if (!signedIn && !(s.lotId && s.pin)) return setScreen({ name: 'signed-out' });
      if (s.lotId && s.pin) {
        setScreen({ name: 'locked' });
        void refreshManifest(s).catch(handleAuthError);
        return;
      }
      try {
        const { items } = await attendApi.lots();
        if (items.length === 0) {
          setNotice('You are not assigned to any car park yet. Ask your manager.');
          return setScreen({ name: 'pick-lot', lots: [] });
        }
        const only = items.length === 1 ? items[0] : undefined;
        if (only) await choose(only.id, s);
        else setScreen({ name: 'pick-lot', lots: items });
      } catch (err) {
        if (!(await handleAuthError(err)))
          setNotice('No network. Connect once to set this phone up.');
      }
    })();
    // Runs once on open.
  }, []);

  async function choose(lotId: string, s: AttendSettings) {
    const device = await attendApi.register(s.clientDeviceId, lotId);
    const next = await attendStorage.saveSettings({ lotId });
    setSettings(next);
    if (device.revoked) return setScreen({ name: 'blocked' });
    if (!device.approved) return setScreen({ name: 'waiting', lotId });
    await refreshManifest(next);
    setScreen(next.pin ? { name: 'home' } : { name: 'set-pin' });
  }

  // Background sync and manifest refresh while open.
  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      void syncNow();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const sync = setInterval(() => void syncNow(), SYNC_EVERY_MS);
    const refresh = setInterval(() => {
      if (settings?.lotId && navigator.onLine)
        void refreshManifest(settings).catch(handleAuthError);
    }, MANIFEST_EVERY_MS);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(sync);
      clearInterval(refresh);
    };
  }, [syncNow, refreshManifest, settings, handleAuthError]);

  // Lock after 5 minutes without a tap (doc 05 §4.4).
  useEffect(() => {
    const touch = () => (lastActive.current = Date.now());
    window.addEventListener('pointerdown', touch);
    const idle = setInterval(() => {
      if (settings?.pin && Date.now() - lastActive.current > IDLE_LOCK_MS)
        setScreen((sc) =>
          sc.name === 'locked' || sc.name === 'signed-out' ? sc : { name: 'locked' },
        );
    }, 10_000);
    return () => {
      window.removeEventListener('pointerdown', touch);
      clearInterval(idle);
    };
  }, [settings]);

  async function record(event: QueuedEvent) {
    await attendStorage.enqueue(event);
    setQueue(await attendStorage.queue());
    void syncNow();
  }

  const deviceTime = () => new Date().toISOString();

  async function letIn(
    result: GateResult,
    method: 'QR' | 'CODE' | 'PLATE',
    overrideReason?: string,
  ) {
    if (!result.bookingId) return;
    await record({
      type: 'CHECK_IN',
      clientEventId: crypto.randomUUID(),
      deviceTime: deviceTime(),
      bookingId: result.bookingId,
      method,
      ...(result.plate ? { plateSeen: result.plate } : {}),
      ...(overrideReason ? { overrideReason } : {}),
    });
    setNotice(`Checked in ${result.plate ?? ''}`);
    setScreen({ name: 'home' });
  }

  async function letOut(bookingId: string, method: 'QR' | 'CODE' | 'PLATE', plate: string | null) {
    await record({
      type: 'CHECK_OUT',
      clientEventId: crypto.randomUUID(),
      deviceTime: deviceTime(),
      bookingId,
      method,
    });
    setNotice(
      `Checked out ${plate ?? ''}. Any overstay is charged to the driver in the app; do not collect cash.`,
    );
    setScreen({ name: 'home' });
  }

  // --- screens ------------------------------------------------------------------

  if (screen.name === 'loading') return <Text>Opening…</Text>;

  if (screen.name === 'signed-out')
    return (
      <div className="pk-stack">
        <Text variant="heading-lg" as="h1">
          Sign in to start your shift
        </Text>
        <Text tone="secondary">
          Use the account your manager invited. You need network the first time.
        </Text>
        <a
          className="pk-button pk-button--primary pk-button--lg pk-button--full"
          href="/sign-in?next=/attend"
        >
          Sign in
        </a>
      </div>
    );

  if (screen.name === 'blocked')
    return (
      <div className="pk-stack">
        <Text variant="heading-lg" as="h1">
          This phone is blocked
        </Text>
        <Text tone="secondary">
          A manager removed this phone. Its Parkly data has been cleared. Ask your manager.
        </Text>
      </div>
    );

  if (screen.name === 'pick-lot')
    return (
      <div className="pk-stack">
        <Text variant="heading-lg" as="h1">
          Which car park?
        </Text>
        {notice && <p className="pk-notice pk-notice--info">{notice}</p>}
        {screen.lots.map((l) => (
          <Button
            key={l.id}
            size="lg"
            fullWidth
            onClick={() => settings && void choose(l.id, settings).catch(handleAuthError)}
          >
            {l.name}
          </Button>
        ))}
      </div>
    );

  if (screen.name === 'waiting')
    return (
      <div className="pk-stack">
        <Text variant="heading-lg" as="h1">
          Waiting for your manager
        </Text>
        <Text tone="secondary">
          Your manager must approve this phone in the portal (Team → Attendant phones). Then tap
          Check again.
        </Text>
        <Button
          size="lg"
          fullWidth
          onClick={() => settings && void choose(screen.lotId, settings).catch(handleAuthError)}
        >
          Check again
        </Button>
      </div>
    );

  if (screen.name === 'set-pin' || screen.name === 'locked')
    return (
      <PinScreen
        setting={screen.name === 'set-pin'}
        onDone={async (pin) => {
          if (!settings) return null;
          if (screen.name === 'set-pin') {
            setSettings(await attendStorage.saveSettings({ pin: await hashPin(pin), pinTries: 0 }));
            lastActive.current = Date.now();
            setScreen({ name: 'home' });
            return null;
          }
          if (settings.pin && (await verifyPin(pin, settings.pin))) {
            setSettings(await attendStorage.saveSettings({ pinTries: 0 }));
            lastActive.current = Date.now();
            setScreen({ name: 'home' });
            return null;
          }
          const tries = settings.pinTries + 1;
          if (tries >= MAX_PIN_TRIES) {
            await attendStorage.wipe();
            setNotice('Too many wrong PINs. Sign in again.');
            setScreen({ name: 'signed-out' });
            return null;
          }
          setSettings(await attendStorage.saveSettings({ pinTries: tries }));
          return `Wrong PIN. ${MAX_PIN_TRIES - tries} tries left.`;
        }}
      />
    );

  if (!manifest)
    return (
      <div className="pk-stack">
        <Text>Downloading today’s bookings…</Text>
        {notice && <p className="pk-notice pk-notice--info">{notice}</p>}
      </div>
    );

  const parked = parkedNow(manifest, queue);
  const walkIns = Math.max(
    0,
    manifest.walkIns + queue.reduce((n, e) => n + (e.type === 'WALK_IN' ? e.delta : 0), 0),
  );
  const expected = manifest.bookings.filter(
    (b) =>
      (b.status === 'CONFIRMED' || b.status === 'NO_SHOW') && !localStatus(b.id, queue).checkedInAt,
  ).length;
  const stale = settings?.manifestAt
    ? Date.now() - Date.parse(settings.manifestAt) > STALE_MANIFEST_MS
    : true;

  if (screen.name === 'scan')
    return (
      <div className="pk-stack">
        <Text variant="heading-lg" as="h1">
          {screen.mode === 'in' ? 'Scan to check in' : 'Scan to check out'}
        </Text>
        <Scanner
          onCancel={() => setScreen({ name: 'home' })}
          onResult={(text) =>
            void checkScan(text, manifest, queue, now()).then((result) =>
              setScreen({ name: 'result', mode: screen.mode, result, method: 'QR' }),
            )
          }
        />
      </div>
    );

  if (screen.name === 'lookup')
    return (
      <Lookup
        mode={screen.mode}
        onCancel={() => setScreen({ name: 'home' })}
        onCode={(code) =>
          setScreen({
            name: 'result',
            mode: screen.mode,
            result: checkCode(code, manifest, queue, now()),
            method: 'CODE',
          })
        }
        onPlate={(plate) => {
          const results = checkPlate(plate, manifest, queue, now());
          const only = results.length === 1 ? results[0] : undefined;
          if (only) setScreen({ name: 'result', mode: screen.mode, result: only, method: 'PLATE' });
          else if (results.length === 0)
            setScreen({
              name: 'result',
              mode: screen.mode,
              result: checkCode('', manifest, queue, now()),
              method: 'PLATE',
            });
          else setScreen({ name: 'choose', mode: screen.mode, results });
        }}
      />
    );

  if (screen.name === 'choose')
    return (
      <div className="pk-stack">
        <Text variant="heading-lg" as="h1">
          Several bookings match
        </Text>
        {screen.results.map((r) => (
          <Button
            key={r.bookingId}
            size="lg"
            variant="secondary"
            fullWidth
            onClick={() =>
              setScreen({ name: 'result', mode: screen.mode, result: r, method: 'PLATE' })
            }
          >
            {r.plate} · {r.code}
          </Button>
        ))}
        <Button variant="ghost" onClick={() => setScreen({ name: 'home' })}>
          Back
        </Button>
      </div>
    );

  if (screen.name === 'result')
    return (
      <Result
        mode={screen.mode}
        result={screen.result}
        booking={manifest.bookings.find((b) => b.id === screen.result.bookingId) ?? null}
        onIn={(reason) => void letIn(screen.result, screen.method, reason)}
        onOut={() =>
          screen.result.bookingId &&
          void letOut(screen.result.bookingId, screen.method, screen.result.plate)
        }
        onBack={() => setScreen({ name: 'home' })}
      />
    );

  if (screen.name === 'exits')
    return (
      <div className="pk-stack">
        <Text variant="heading-lg" as="h1">
          Exits
        </Text>
        <Button size="lg" fullWidth onClick={() => setScreen({ name: 'scan', mode: 'out' })}>
          Scan to check out
        </Button>
        <Button
          size="lg"
          variant="secondary"
          fullWidth
          onClick={() => setScreen({ name: 'lookup', mode: 'out' })}
        >
          Code or plate
        </Button>
        <Text variant="heading-md" as="h2">
          Parked now ({parked.length})
        </Text>
        {parked.length === 0 && <Text tone="secondary">Nobody is checked in.</Text>}
        {parked.map((b) => (
          <Button
            key={b.id}
            size="lg"
            variant="secondary"
            fullWidth
            onClick={() => void letOut(b.id, 'PLATE', b.plateNorm)}
          >
            {b.plateNorm} · until {fmtTime(b.endAt)}
          </Button>
        ))}
        <Button variant="ghost" onClick={() => setScreen({ name: 'home' })}>
          Back
        </Button>
      </div>
    );

  if (screen.name === 'issue')
    return (
      <IssueForm
        onCancel={() => setScreen({ name: 'home' })}
        onSend={async (note) => {
          await record({
            type: 'ISSUE',
            clientEventId: crypto.randomUUID(),
            deviceTime: deviceTime(),
            note,
          });
          setNotice('Issue sent to Parkly support.');
          setScreen({ name: 'home' });
        }}
      />
    );

  if (screen.name === 'queue')
    return (
      <div className="pk-stack">
        <Text variant="heading-lg" as="h1">
          Sync
        </Text>
        <Text>
          {queue.length} waiting to sync · last sync {fmtTime(settings?.lastSyncAt ?? null)}
        </Text>
        <Button size="lg" fullWidth onClick={() => void syncNow()}>
          Sync now
        </Button>
        {problems.length > 0 && (
          <Text variant="heading-md" as="h2">
            Needs a supervisor
          </Text>
        )}
        {problems.map((p) => (
          <p
            key={p.clientEventId}
            className={`pk-notice ${p.result === 'REJECTED' ? 'pk-notice--error' : 'pk-notice--info'}`}
          >
            {p.type.replace('_', ' ').toLowerCase()}: {p.result.toLowerCase()} (
            {(p.reason ?? '').replace(/_/g, ' ').toLowerCase()})
          </p>
        ))}
        {problems.length > 0 && (
          <Button
            variant="ghost"
            onClick={() => void attendStorage.clearProblems().then(() => setProblems([]))}
          >
            Clear the list
          </Button>
        )}
        <Button variant="ghost" onClick={() => setScreen({ name: 'home' })}>
          Back
        </Button>
      </div>
    );

  // A-02 shift home
  return (
    <div className="pk-stack">
      <div className="pk-row pk-row--between">
        <Text variant="heading-lg" as="h1">
          {manifest.lot.name}
        </Text>
        <span className={`pk-attend-badge ${online ? '' : 'pk-attend-badge--offline'}`}>
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
      {notice && (
        <p className="pk-notice pk-notice--info" role="status">
          {notice}
        </p>
      )}
      {stale && (
        <p className="pk-notice pk-notice--error">
          Today’s list is over 24 hours old. Connect to refresh it.
        </p>
      )}
      <div className="pk-attend-counters">
        <span>
          <strong>{parked.length}</strong> parked
        </span>
        <span>
          <strong>{expected}</strong> expected
        </span>
        <span>
          <strong>{walkIns}</strong> walk-ins
        </span>
      </div>
      <Button
        size="lg"
        fullWidth
        onClick={() => {
          setNotice(null);
          setScreen({ name: 'scan', mode: 'in' });
        }}
      >
        Scan ticket
      </Button>
      <Button
        size="lg"
        variant="secondary"
        fullWidth
        onClick={() => {
          setNotice(null);
          setScreen({ name: 'lookup', mode: 'in' });
        }}
      >
        Code or plate
      </Button>
      <Button
        size="lg"
        variant="secondary"
        fullWidth
        onClick={() => {
          setNotice(null);
          setScreen({ name: 'exits' });
        }}
      >
        Exits
      </Button>
      <div className="pk-row">
        <Button
          size="lg"
          variant="secondary"
          onClick={() =>
            void record({
              type: 'WALK_IN',
              clientEventId: crypto.randomUUID(),
              deviceTime: deviceTime(),
              delta: 1,
            })
          }
        >
          Walk-in +1
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() =>
            void record({
              type: 'WALK_IN',
              clientEventId: crypto.randomUUID(),
              deviceTime: deviceTime(),
              delta: -1,
            })
          }
        >
          Walk-in −1
        </Button>
      </div>
      <Button variant="ghost" onClick={() => setScreen({ name: 'issue' })}>
        Report an issue
      </Button>
      <Button variant="ghost" onClick={() => setScreen({ name: 'queue' })}>
        {queue.length > 0
          ? `${queue.length} waiting to sync`
          : `Synced ${fmtTime(settings?.lastSyncAt ?? null)}`}
        {problems.length > 0 ? ` · ${problems.length} need attention` : ''}
      </Button>
      <Text variant="body-sm" tone="tertiary">
        List updated {fmtTime(settings?.manifestAt ?? null)}
      </Text>
    </div>
  );
}

function PinScreen({
  setting,
  onDone,
}: {
  setting: boolean;
  /** Resolves to an error to show, or null when done. */
  onDone: (pin: string) => Promise<string | null>;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="pk-stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isValidPin(pin)) return setError('Enter 6 digits.');
        void onDone(pin).then((msg) => {
          setPin('');
          setError(msg);
        });
      }}
    >
      <Text variant="heading-lg" as="h1">
        {setting ? 'Choose a 6-digit PIN' : 'Enter your PIN'}
      </Text>
      {setting && (
        <Text tone="secondary">
          You will use it to unlock this app during your shift, even offline.
        </Text>
      )}
      <Input
        label="PIN"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={6}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        error={error ?? undefined}
      />
      <Button type="submit" size="lg" fullWidth>
        {setting ? 'Save PIN' : 'Unlock'}
      </Button>
    </form>
  );
}

function Lookup({
  mode,
  onCode,
  onPlate,
  onCancel,
}: {
  mode: Mode;
  onCode: (c: string) => void;
  onPlate: (p: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [plate, setPlate] = useState('');
  return (
    <div className="pk-stack">
      <Text variant="heading-lg" as="h1">
        {mode === 'in' ? 'Find a booking' : 'Find a parked car'}
      </Text>
      <form
        className="pk-stack"
        onSubmit={(e) => {
          e.preventDefault();
          onCode(code);
        }}
      >
        <Input
          label="Booking code"
          placeholder="PK-7HQ4MZ"
          autoCapitalize="characters"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <Button type="submit" size="lg" fullWidth disabled={code.trim().length < 6}>
          Find by code
        </Button>
      </form>
      <form
        className="pk-stack"
        onSubmit={(e) => {
          e.preventDefault();
          onPlate(plate);
        }}
      >
        <Input
          label="Plate number"
          placeholder="LND 123 AB"
          autoCapitalize="characters"
          value={plate}
          onChange={(e) => setPlate(e.target.value)}
        />
        <Button
          type="submit"
          size="lg"
          variant="secondary"
          fullWidth
          disabled={plate.trim().length < 4}
        >
          Find by plate
        </Button>
      </form>
      <Button variant="ghost" onClick={onCancel}>
        Back
      </Button>
    </div>
  );
}

function Result({
  mode,
  result,
  booking,
  onIn,
  onOut,
  onBack,
}: {
  mode: Mode;
  result: GateResult;
  booking: ManifestBooking | null;
  onIn: (overrideReason?: string) => void;
  onOut: () => void;
  onBack: () => void;
}) {
  const [reason, setReason] = useState<string | null>(null);
  // Leaving is always allowed for a known booking (the server merges it); a
  // booking id rules out the not-our-ticket results.
  const colour = mode === 'out' && result.bookingId ? 'GREEN' : result.colour;
  return (
    <div className="pk-stack">
      <div className={`pk-attend-result pk-attend-result--${colour.toLowerCase()}`} role="status">
        <span className="pk-attend-result__label">
          {colour === 'GREEN' ? 'OK' : colour === 'AMBER' ? 'CHECK' : 'STOP'}
        </span>
        <strong className="pk-attend-result__plate">{result.plate ?? '—'}</strong>
        <span>
          {mode === 'out' && colour === 'GREEN' ? 'Ready to check out' : REASON_TEXT[result.reason]}
        </span>
        {result.checkedInAt && <span>Checked in at {fmtTime(result.checkedInAt)}</span>}
        {booking && (
          <span>
            {result.code} · {fmtTime(booking.startAt)}–{fmtTime(booking.endAt)}
          </span>
        )}
      </div>
      {mode === 'in' && result.colour !== 'RED' && (
        <>
          {result.needsReason && (
            <div className="pk-row" role="group" aria-label="Reason">
              {OVERRIDES.map((o) => (
                <button
                  key={o}
                  type="button"
                  className={`pk-chip ${reason === o ? 'pk-chip--on' : ''}`}
                  onClick={() => setReason(o)}
                >
                  {o}
                </button>
              ))}
            </div>
          )}
          <Button
            size="lg"
            fullWidth
            disabled={result.needsReason && !reason}
            onClick={() => onIn(reason ?? undefined)}
          >
            Plate matches: let in
          </Button>
          {result.reason === 'ALREADY_IN' && (
            <Button size="lg" variant="secondary" fullWidth onClick={onOut}>
              Check out instead
            </Button>
          )}
        </>
      )}
      {mode === 'out' && colour === 'GREEN' && (
        <Button size="lg" fullWidth onClick={onOut}>
          Check out
        </Button>
      )}
      <Button size="lg" variant="secondary" fullWidth onClick={onBack}>
        {result.colour === 'RED' ? 'Deny entry' : 'Back'}
      </Button>
    </div>
  );
}

function IssueForm({
  onSend,
  onCancel,
}: {
  onSend: (note: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [note, setNote] = useState('');
  return (
    <form
      className="pk-stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (note.trim()) void onSend(note.trim());
      }}
    >
      <Text variant="heading-lg" as="h1">
        Report an issue
      </Text>
      <Text tone="secondary">
        Gate, barrier, a damaged car, anything Parkly should know. No names or phone numbers.
      </Text>
      <label className="pk-field">
        <span className="pk-field__label">What happened?</span>
        <textarea
          className="pk-input"
          rows={4}
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <Button type="submit" size="lg" fullWidth disabled={!note.trim()}>
        Send
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Back
      </Button>
    </form>
  );
}
