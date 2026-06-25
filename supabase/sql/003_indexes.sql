create index if not exists idx_proposals_status
  on public.proposals(status);

create index if not exists idx_proposals_client_name
  on public.proposals(client_name);

create index if not exists idx_proposals_created_at
  on public.proposals(created_at desc);

create index if not exists idx_proposals_public_slug
  on public.proposals(public_slug);

create index if not exists idx_proposals_created_by
  on public.proposals(created_by);

create index if not exists idx_proposal_versions_proposal_id
  on public.proposal_versions(proposal_id);

create index if not exists idx_proposal_versions_created_at
  on public.proposal_versions(created_at desc);

create index if not exists idx_proposal_events_proposal_id
  on public.proposal_events(proposal_id);

create index if not exists idx_proposal_events_type
  on public.proposal_events(event_type);

create index if not exists idx_proposal_events_created_at
  on public.proposal_events(created_at desc);
