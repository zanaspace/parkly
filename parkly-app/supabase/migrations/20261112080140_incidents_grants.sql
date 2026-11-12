-- Hand-written. FR-INC-001: staff log and work incidents through the API role.
grant select, insert, update on public.incidents to parkly_api;
grant select, insert on public.incident_notes to parkly_api;
