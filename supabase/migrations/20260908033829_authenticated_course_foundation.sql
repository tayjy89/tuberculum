
create schema if not exists course_private;
revoke all on schema course_private from public, anon, authenticated;
create table public.learner_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null check(length(trim(full_name))>0),
 organisation text not null check(length(trim(organisation))>0),
 mcr_number text not null check(length(trim(mcr_number))>0),
 postgraduate_year integer not null check(postgraduate_year>=1),
 specialty text not null check(length(trim(specialty))>0),
 created_at timestamptz not null default now()
);
create table course_private.memberships (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('learner','admin')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table course_private.invitations (
 id uuid primary key default gen_random_uuid(),
 email text not null check(email=lower(trim(email))),
 role text not null default 'learner' check(role in ('learner','admin')),
 token_hash text unique,
 status text not null default 'pending' check(status in ('pending','accepted','revoked','expired')),
 expires_at timestamptz not null,
 invited_by uuid references auth.users(id),
 accepted_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create unique index invitations_pending_email on course_private.invitations(email) where status='pending';
create table course_private.course_versions (
 id text primary key,
 title text not null,
 required_activities jsonb not null default '[]',
 pass_fraction numeric not null default 0.7 check(pass_fraction between 0 and 1),
 published_at timestamptz
);
create table public.enrolments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 course_version text not null references course_private.course_versions(id),
 status text not null default 'active' check(status in ('active','completed','withdrawn')),
 created_at timestamptz not null default now(),
 unique(user_id,course_version)
);
create table public.activity_progress (
 enrolment_id uuid not null references public.enrolments(id),
 activity_id text not null,
 completed_at timestamptz,
 draft jsonb not null default '{}',
 primary key(enrolment_id,activity_id)
);
create table public.assessment_attempts (
 id uuid primary key default gen_random_uuid(),
 enrolment_id uuid not null references public.enrolments(id),
 form_version text not null,
 kind text not null check(kind in ('warmup','final','reflection')),
 attempt_number integer not null check(attempt_number>0),
 responses jsonb not null default '{}',
 score numeric,
 max_score numeric check(max_score>0),
 passed boolean,
 started_at timestamptz not null default now(),
 submitted_at timestamptz,
 check(score is null or (max_score is not null and score between 0 and max_score)),
 unique(enrolment_id,kind,attempt_number)
);
create table course_private.assessment_keys (
 form_version text primary key,
 scoring_key jsonb not null,
 created_at timestamptz not null default now()
);
create table public.certificates (
 id uuid primary key default gen_random_uuid(),
 enrolment_id uuid not null references public.enrolments(id),
 certificate_number text not null unique,
 learner_name text not null,
 issued_at timestamptz not null default now(),
 revoked_at timestamptz,
 storage_path text not null
);
create unique index certificates_one_active on public.certificates(enrolment_id) where revoked_at is null;
create table course_private.audit_events (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id),
 action text not null,
 subject_id uuid,
 details jsonb not null default '{}',
 created_at timestamptz not null default now()
);
-- Closed by default until server-side enrolment and authorisation handlers are installed.
alter table public.learner_profiles enable row level security;
alter table public.enrolments enable row level security;
alter table public.activity_progress enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.certificates enable row level security;
alter table course_private.memberships enable row level security;
alter table course_private.invitations enable row level security;
alter table course_private.course_versions enable row level security;
alter table course_private.assessment_keys enable row level security;
alter table course_private.audit_events enable row level security;
revoke all on public.learner_profiles,public.enrolments,public.activity_progress,public.assessment_attempts,public.certificates from anon,authenticated;
revoke all on all tables in schema course_private from anon,authenticated;
revoke all on all sequences in schema course_private from anon,authenticated;
