const ID = /^[0-9A-Za-z-]{1,64}$/;

/**
 * The screen a tapped notification opens (FR-NOT-002). Only a well-formed
 * booking id is trusted; the payload's link is never followed as given.
 */
export function pushTarget(data: Record<string, unknown> | undefined): string | null {
  const id = data?.bookingId;
  return typeof id === 'string' && ID.test(id) ? `/booking/${id}` : null;
}
