-- Hand-written. Sprint 2: grants, updated_at triggers and data-class comments
-- for the operator, lot, permit, verification and rate-plan tables.

grant select, insert, update, delete on
  public.files,
  public.operators,
  public.operator_members,
  public.operator_kyb_documents,
  public.payout_accounts,
  public.lots,
  public.lot_opening_hours,
  public.lot_closures,
  public.lot_photos,
  public.permits,
  public.verification_records,
  public.verification_items,
  public.rate_plans
to parkly_api;

create trigger files_set_updated_at before update on public.files
  for each row execute function public.set_updated_at();
create trigger operators_set_updated_at before update on public.operators
  for each row execute function public.set_updated_at();
create trigger operator_members_set_updated_at before update on public.operator_members
  for each row execute function public.set_updated_at();
create trigger operator_kyb_documents_set_updated_at before update on public.operator_kyb_documents
  for each row execute function public.set_updated_at();
create trigger payout_accounts_set_updated_at before update on public.payout_accounts
  for each row execute function public.set_updated_at();
create trigger lots_set_updated_at before update on public.lots
  for each row execute function public.set_updated_at();
create trigger lot_photos_set_updated_at before update on public.lot_photos
  for each row execute function public.set_updated_at();
create trigger permits_set_updated_at before update on public.permits
  for each row execute function public.set_updated_at();
create trigger verification_records_set_updated_at before update on public.verification_records
  for each row execute function public.set_updated_at();
create trigger rate_plans_set_updated_at before update on public.rate_plans
  for each row execute function public.set_updated_at();

-- Data classes (doc 06 §1.2). [enc] = app-level ciphertext (ENC_KEY_V<n>).
comment on column public.operators.cac_number_enc is 'class:C3 [enc]';
comment on column public.operators.tin_enc is 'class:C3 [enc]';
comment on column public.operators.contact_email is 'class:C3';
comment on column public.operators.contact_phone_enc is 'class:C3 [enc]';
comment on column public.operator_members.invitee_name is 'class:C3';
comment on column public.operator_members.invitee_phone_hash is 'class:C3';
comment on column public.operator_members.invitee_email_hash is 'class:C3';
comment on column public.operator_members.invite_token_hash is 'class:C4';
comment on column public.payout_accounts.account_number_last4 is 'class:C4 (masked)';
comment on column public.payout_accounts.account_name is 'class:C4';
comment on column public.payout_accounts.pending_account_number_enc is
  'class:C4 [enc]; held only until the provider subaccount is created, then set to null';
comment on column public.payout_accounts.provider_subaccount_code is 'class:C4';
comment on column public.permits.permit_number is 'class:C3';
comment on column public.verification_records.gps_at_inspection is 'class:C2';
