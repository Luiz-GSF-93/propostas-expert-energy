alter table public.profiles enable row level security;
alter table public.proposals enable row level security;
alter table public.proposal_versions enable row level security;
alter table public.proposal_events enable row level security;
alter table public.proposal_public_access enable row level security;

drop policy if exists "users_can_view_own_profile" on public.profiles;
create policy "users_can_view_own_profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "users_can_update_own_profile" on public.profiles;
create policy "users_can_update_own_profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id);

drop policy if exists "authenticated_can_select_proposals" on public.proposals;
create policy "authenticated_can_select_proposals"
on public.proposals
for select
to authenticated
using (true);

drop policy if exists "authenticated_can_insert_proposals" on public.proposals;
create policy "authenticated_can_insert_proposals"
on public.proposals
for insert
to authenticated
with check (true);

drop policy if exists "authenticated_can_update_proposals" on public.proposals;
create policy "authenticated_can_update_proposals"
on public.proposals
for update
to authenticated
using (true);

drop policy if exists "authenticated_can_delete_proposals" on public.proposals;
create policy "authenticated_can_delete_proposals"
on public.proposals
for delete
to authenticated
using (true);

drop policy if exists "authenticated_can_select_proposal_versions" on public.proposal_versions;
create policy "authenticated_can_select_proposal_versions"
on public.proposal_versions
for select
to authenticated
using (true);

drop policy if exists "authenticated_can_insert_proposal_versions" on public.proposal_versions;
create policy "authenticated_can_insert_proposal_versions"
on public.proposal_versions
for insert
to authenticated
with check (true);

drop policy if exists "authenticated_can_select_proposal_events" on public.proposal_events;
create policy "authenticated_can_select_proposal_events"
on public.proposal_events
for select
to authenticated
using (true);

drop policy if exists "authenticated_can_insert_proposal_events" on public.proposal_events;
create policy "authenticated_can_insert_proposal_events"
on public.proposal_events
for insert
to authenticated
with check (true);

drop policy if exists "authenticated_can_manage_public_access" on public.proposal_public_access;
create policy "authenticated_can_manage_public_access"
on public.proposal_public_access
for all
to authenticated
using (true)
with check (true);
