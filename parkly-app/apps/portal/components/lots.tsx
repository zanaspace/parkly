'use client';

import type { Lot, OpeningDay } from '@parkly/contracts';
import { Button, Input, Select, Text, ActionForm } from '@parkly/ui';
import { useRouter } from 'next/navigation';
import { useActionState, useId, useRef, useState } from 'react';
import { putToSignedUrl, sha256Hex } from '../lib/browser-upload';
import {
  completeLotPhoto,
  createLot,
  deleteLotPhoto,
  presignLotPhoto,
  saveOpeningHours,
  updateLot,
} from '../lib/lots/actions';
import { AMENITY_LABELS, VEHICLE_LABELS, WEEKDAYS } from '../lib/lots/form';
import { formatBytes } from '../lib/operators/kyb-copy';
import { OPERATOR_TYPE_OPTIONS } from '../lib/operators/form';
import { LocateIcon, MapPinIcon } from './icons';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MIN_PHOTOS = 3;
const MAX_PHOTOS = 10;

function Notice({ tone, children }: { tone: 'error' | 'info'; children: React.ReactNode }) {
  return (
    <p className={`pk-notice pk-notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  );
}

function CheckboxGroup(props: {
  legend: string;
  name: string;
  options: Record<string, string>;
  selected: readonly string[];
  error?: string | undefined;
  disabled: boolean;
}) {
  return (
    <fieldset
      className="pk-fieldset"
      aria-describedby={props.error ? `${props.name}-error` : undefined}
    >
      <legend className="pk-field__label">{props.legend}</legend>
      <div className="pk-check-grid">
        {Object.entries(props.options).map(([value, label]) => (
          <label key={value} className="pk-check pk-check-tile">
            <input
              type="checkbox"
              name={props.name}
              value={value}
              defaultChecked={props.selected.includes(value)}
              disabled={props.disabled}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {props.error && (
        <span id={`${props.name}-error`} className="pk-field__error" role="alert">
          {props.error}
        </span>
      )}
    </fieldset>
  );
}

/** A numbered card grouping related fields (step header + body). */
function FormSection(props: {
  step: number;
  title: string;
  description: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <section className="pk-form-section" aria-labelledby={id}>
      <header className="pk-form-section__head">
        <span className="pk-form-section__step" aria-hidden="true">
          {props.icon ?? props.step}
        </span>
        <div>
          <h3 id={id} className="pk-form-section__title">
            {props.title}
          </h3>
          <p className="pk-form-section__desc">{props.description}</p>
        </div>
      </header>
      <div className="pk-form-section__body">{props.children}</div>
    </section>
  );
}

/**
 * O-11 steps 1–3: details, entrance location, capacity, amenities. Until the
 * Maps API key arrives (S3) the pin is entered as latitude/longitude, or
 * taken from the device's location while standing at the entrance.
 */
export function LotForm(props: { operatorId: string; lot?: Lot; editable: boolean }) {
  const lot = props.lot;
  const [state, action, pending] = useActionState(lot ? updateLot : createLot, undefined);
  const [lat, setLat] = useState(lot ? String(lot.location.lat) : '');
  const [lng, setLng] = useState(lot ? String(lot.location.lng) : '');
  const [locating, setLocating] = useState<string | null>(null);
  const err = state?.fieldErrors ?? {};
  const ro = !props.editable;

  function useMyLocation() {
    if (!('geolocation' in navigator)) return setLocating('This browser can’t share its location.');
    setLocating('Finding your location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(`Location set (accurate to about ${Math.round(pos.coords.accuracy)} m).`);
      },
      () => setLocating('We couldn’t get your location. Allow location access, or type it in.'),
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const mapUrl =
    lat && lng
      ? `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lng)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lng)}`
      : null;

  return (
    <ActionForm action={action} className="pk-form pk-lot-form" noValidate>
      <input type="hidden" name="operatorId" value={props.operatorId} />
      {lot && (
        <>
          <input type="hidden" name="lotId" value={lot.id} />
          <input type="hidden" name="version" value={lot.version} />
        </>
      )}

      <FormSection
        step={1}
        title="Basics"
        description="How drivers will recognise this car park in the Parkly app."
      >
        <div className="pk-form-grid">
          <Input
            label="Lot name"
            name="name"
            defaultValue={lot?.name}
            placeholder="Landmark Towers Car Park"
            error={err.name}
            readOnly={ro}
            required
          />
          <Select
            label="Kind of lot"
            name="type"
            defaultValue={lot?.type ?? ''}
            placeholder="Choose one"
            options={OPERATOR_TYPE_OPTIONS}
            error={err.type}
            disabled={ro}
            required
          />
          <div className="pk-form-col-full">
            <Input
              label="Street address"
              name="addressLine"
              defaultValue={lot?.addressLine}
              placeholder="12 Akin Adesola Street"
              autoComplete="street-address"
              error={err.addressLine}
              readOnly={ro}
              required
            />
          </div>
          <Input
            label="Area, optional"
            name="area"
            defaultValue={lot?.area ?? ''}
            placeholder="Victoria Island"
            readOnly={ro}
          />
          <Input
            label="LGA, optional"
            name="lga"
            defaultValue={lot?.lga ?? ''}
            placeholder="Eti-Osa"
            readOnly={ro}
          />
        </div>
      </FormSection>

      <FormSection
        step={2}
        title="Entrance location"
        description="Drivers navigate to this point, so use the entrance, not the middle of the lot."
      >
        <fieldset className="pk-fieldset">
          <legend className="pk-visually-hidden">Entrance coordinates</legend>
          <div className="pk-form-grid">
            <Input
              label="Latitude"
              name="lat"
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              placeholder="6.428100"
              readOnly={ro}
            />
            <Input
              label="Longitude"
              name="lng"
              inputMode="decimal"
              value={lng}
              onChange={(e) => setLng(e.target.value)}
              placeholder="3.421900"
              readOnly={ro}
            />
          </div>
        </fieldset>
        {err.location && <Notice tone="error">{err.location}</Notice>}
        {(!ro || mapUrl) && (
          <div className="pk-location-actions">
            {!ro && (
              <Button type="button" variant="secondary" size="sm" onClick={useMyLocation}>
                <LocateIcon size={16} /> Use my current location
              </Button>
            )}
            {mapUrl && (
              <a
                className="pk-location-actions__map"
                href={mapUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <MapPinIcon size={16} /> Check it on a map ↗
              </a>
            )}
          </div>
        )}
        {locating && <Notice tone="info">{locating}</Notice>}
        <Input
          label="Entrance instructions, optional"
          name="entranceNotes"
          defaultValue={lot?.entranceNotes ?? ''}
          placeholder="Enter through Gate 2 on Akin Adesola St"
          readOnly={ro}
        />
      </FormSection>

      <FormSection
        step={3}
        title="Capacity"
        description="Tell us how many cars fit, and how many of those spaces you want to sell on Parkly."
      >
        <div className="pk-form-grid">
          <Input
            label="Total spaces"
            name="capacityTotal"
            inputMode="numeric"
            defaultValue={lot?.capacityTotal}
            placeholder="120"
            error={err.capacityTotal}
            readOnly={ro}
            required
          />
          <Input
            label="Spaces offered on Parkly"
            name="capacityBookable"
            inputMode="numeric"
            defaultValue={lot?.capacityBookable}
            placeholder="40"
            error={err.capacityBookable}
            helper="Can be less than the total if you keep some for regulars."
            readOnly={ro}
            required
          />
        </div>
      </FormSection>

      <FormSection
        step={4}
        title="Amenities & vehicles"
        description="Drivers filter by these, so only tick what’s really available on site."
      >
        <CheckboxGroup
          legend="Amenities"
          name="amenities"
          options={AMENITY_LABELS}
          selected={lot?.amenities ?? []}
          error={err.amenities}
          disabled={ro}
        />
        <CheckboxGroup
          legend="Vehicles allowed"
          name="vehicleTypes"
          options={VEHICLE_LABELS}
          selected={lot?.vehicleTypes ?? ['CAR']}
          error={err.vehicleTypes}
          disabled={ro}
        />
      </FormSection>

      <FormSection
        step={5}
        title="Description"
        description="Anything else drivers should know before they arrive. Optional."
      >
        <Input
          label="Description, optional"
          name="description"
          defaultValue={lot?.description ?? ''}
          placeholder="Covered parking, 2-minute walk to the Civic Centre."
          readOnly={ro}
        />
      </FormSection>

      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {state?.saved && <Notice tone="info">Lot details saved.</Notice>}
      {!ro && (
        <div className="pk-form-actions">
          <Text variant="body-sm" tone="secondary">
            {lot
              ? 'Changes are saved to this draft.'
              : 'Saved as a draft. Nothing is shown to drivers until Parkly approves it.'}
          </Text>
          <Button type="submit" loading={pending}>
            {lot ? 'Save details' : 'Create lot and continue'}
          </Button>
        </div>
      )}
    </ActionForm>
  );
}

type Mode = 'closed' | 'open' | '24h';
const modeOf = (d: OpeningDay | undefined): Mode => (!d ? 'closed' : d.is24h ? '24h' : 'open');

/** O-11 step 4: one window per weekday; overnight (e.g. 18:00–06:00) is allowed. */
export function HoursEditor(props: { operatorId: string; lot: Lot; editable: boolean }) {
  const [state, action, pending] = useActionState(saveOpeningHours, undefined);
  const byDay = new Map(props.lot.openingHours.map((d) => [d.weekday, d]));
  const [modes, setModes] = useState<Mode[]>(WEEKDAYS.map((_, i) => modeOf(byDay.get(i))));
  const err = state?.fieldErrors ?? {};

  return (
    <ActionForm action={action} className="pk-form" noValidate>
      <input type="hidden" name="operatorId" value={props.operatorId} />
      <input type="hidden" name="lotId" value={props.lot.id} />
      {WEEKDAYS.map((day, i) => {
        const current = byDay.get(i);
        return (
          <div key={day} className="pk-row">
            <Select
              label={day}
              name={`mode-${i}`}
              value={modes[i]}
              onChange={(e) =>
                setModes(modes.map((m, j) => (j === i ? (e.target.value as Mode) : m)))
              }
              options={[
                { value: 'closed', label: 'Closed' },
                { value: 'open', label: 'Open' },
                { value: '24h', label: 'Open 24 hours' },
              ]}
              disabled={!props.editable}
            />
            {modes[i] === 'open' && (
              <>
                <Input
                  label="Opens"
                  name={`opens-${i}`}
                  type="time"
                  defaultValue={current && !current.is24h ? current.opensAt : '07:00'}
                  readOnly={!props.editable}
                />
                <Input
                  label="Closes"
                  name={`closes-${i}`}
                  type="time"
                  defaultValue={current && !current.is24h ? current.closesAt : '22:00'}
                  readOnly={!props.editable}
                />
              </>
            )}
            {err[`day-${i}`] && <Notice tone="error">{err[`day-${i}`]}</Notice>}
          </div>
        );
      })}
      {state?.error && !Object.keys(err).length && <Notice tone="error">{state.error}</Notice>}
      {state?.saved && <Notice tone="info">Opening hours saved.</Notice>}
      {props.editable && (
        <Button type="submit" loading={pending}>
          Save opening hours
        </Button>
      )}
    </ActionForm>
  );
}

/** O-11 step 2: 3–10 photos, uploaded straight to private Storage and checked by the API. */
export function PhotoUploader(props: { operatorId: string; lot: Lot; editable: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const count = props.lot.photos.length;

  async function upload() {
    const files = [...(input.current?.files ?? [])];
    setError(null);
    if (files.length === 0) return setError('Choose one or more photos first.');
    if (count + files.length > MAX_PHOTOS)
      return setError(`A lot can have at most ${MAX_PHOTOS} photos.`);
    try {
      for (const [i, file] of files.entries()) {
        if (!PHOTO_TYPES.includes(file.type))
          return setError(`${file.name}: use JPG, PNG or WebP.`);
        if (file.size > 10 * 1024 * 1024) return setError(`${file.name} is larger than 10 MB.`);
        setBusy(`Uploading photo ${i + 1} of ${files.length}…`);
        const presign = await presignLotPhoto({
          operatorId: props.operatorId,
          lotId: props.lot.id,
          contentType: file.type,
          sizeBytes: file.size,
          sha256: await sha256Hex(file),
        });
        if (!presign.ok) return setError(presign.error);
        if (!(await putToSignedUrl(presign.uploadUrl, file)))
          return setError('The upload failed. Please check your connection and retry.');
        const done = await completeLotPhoto({
          operatorId: props.operatorId,
          lotId: props.lot.id,
          fileId: presign.fileId,
        });
        if (!done.ok) return setError(`${file.name}: ${done.error}`);
      }
      if (input.current) input.current.value = '';
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="pk-card" aria-labelledby="photos-heading">
      <Text variant="label-lg" as="h3" id="photos-heading">
        Photos ({count} of {MAX_PHOTOS})
      </Text>
      <Text variant="body-sm" tone="tertiary">
        At least {MIN_PHOTOS}: the entrance, the parking area and the signage. Photos are checked by
        our team before drivers see them; location data is removed automatically.
      </Text>
      {count < MIN_PHOTOS && (
        <Text tone="secondary">Add {MIN_PHOTOS - count} more to submit this lot.</Text>
      )}
      <ul className="pk-list">
        {props.lot.photos.map((p, i) => (
          <li key={p.id} className="pk-row">
            <Text variant="body-sm">
              Photo {i + 1} · {formatBytes(p.sizeBytes)} ·{' '}
              {p.status === 'PENDING' ? 'awaiting review' : p.status.toLowerCase()}
            </Text>
            {props.editable && (
              <form action={deleteLotPhoto}>
                <input type="hidden" name="operatorId" value={props.operatorId} />
                <input type="hidden" name="lotId" value={props.lot.id} />
                <input type="hidden" name="photoId" value={p.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Remove
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      {props.editable && count < MAX_PHOTOS && (
        <div className="pk-row">
          <label className="pk-visually-hidden" htmlFor="lot-photos">
            Choose photos
          </label>
          <input
            ref={input}
            id="lot-photos"
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          />
          <Button type="button" size="sm" loading={busy !== null} onClick={upload}>
            Upload photos
          </Button>
        </div>
      )}
      {busy && <Notice tone="info">{busy}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </section>
  );
}
