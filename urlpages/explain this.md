Parts I didn't do, and why:
- Self check-out isn't blocked when overstay is due. On lots with no attendant, drivers couldn't check out at all and no overstay would be charged. Someone who has been to the lot can still photograph the poster; ADR 0017 records that residual risk.
- No limit on wrong sign-in codes per phone, and the daily send cap can still lock a victim out. The apps call Supabase directly, and the SMS hook doesn't see the caller's IP. Fixing this means routing sign-in through the API.

