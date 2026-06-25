create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique,
  role text not null default 'seller' check (role in ('admin', 'manager', 'seller')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),

  proposal_code text unique,
  title text,
  client_name text not null,
  client_document text,
  client_email text,
  client_phone text,

  status text not null default 'draft'
    check (status in ('draft', 'published', 'revised', 'approved', 'archived')),

  editable_json jsonb not null default '{}'::jsonb,
  html_snapshot text,
  html_url text,
  pdf_url text,

  public_slug text unique,
  public_token text,
  public_enabled boolean not null default false,

  current_version integer not null default 1,

  created_by uuid references public.profiles(id),
  updated_by uuid references public.profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.proposal_versions (
  id uuid primary key default gen_random_uuid(),

  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version_number integer not null,

  title text,
  client_name text not null,
  status text not null default 'published'
    check (status in ('draft', 'published', 'revised', 'approved', 'archived')),

  editable_json jsonb not null default '{}'::jsonb,
  html_snapshot text,
  html_url text,
  pdf_url text,

  public_slug text,
  generated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),

  unique (proposal_id, version_number)
);

create table if not exists public.proposal_events (
  id uuid primary key default gen_random_uuid(),

  proposal_id uuid not null references public.proposals(id) on delete cascade,
  event_type text not null
    check (event_type in (
      'created',
      'updated',
      'published',
      'pdf_generated',
      'public_link_opened',
      'archived',
      'restored'
    )),

  actor_id uuid references public.profiles(id),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.proposal_public_access (
  id uuid primary key default gen_random_uuid(),

  proposal_id uuid not null references public.proposals(id) on delete cascade,
  version_id uuid references public.proposal_versions(id) on delete set null,

  access_type text not null default 'public_link'
    check (access_type in ('public_link', 'signed_link', 'protected_link')),

  slug text not null unique,
  token text,
  is_active boolean not null default true,
  expires_at timestamptz,

  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
