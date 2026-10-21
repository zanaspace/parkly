import { Button } from '@parkly/ui';
import { signOut } from '../lib/auth/actions';

/**
 * Supabase does not list a user's sessions, so instead of a session list we
 * offer "this device" and "all devices" (FR-AUTH-006).
 */
export function SignOutButtons() {
  return (
    <form action={signOut} className="pk-row">
      <Button type="submit" name="scope" value="device" variant="ghost" size="sm">
        Sign out
      </Button>
      <Button type="submit" name="scope" value="all" variant="ghost" size="sm">
        Sign out all devices
      </Button>
    </form>
  );
}
