create table if not exists course_private.learning_records (
 user_id uuid primary key references auth.users(id) on delete cascade,
 course_version text not null default '3.0',
 record jsonb not null default '{}',
 updated_at timestamptz not null default now()
);
alter table course_private.learning_records enable row level security;
revoke all on course_private.learning_records from public, anon, authenticated;
alter table course_private.invitations add column if not exists purpose text not null default 'invite' check (purpose in ('invite','recovery'));
create table if not exists course_private.issued_certificates (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 course_version text not null,
 learner_name text not null,
 score numeric not null check(score>=21 and score<=30),
 issued_at timestamptz not null default now(),
 revoked_at timestamptz,
 unique(user_id,course_version)
);
alter table course_private.issued_certificates enable row level security;
revoke all on course_private.issued_certificates from public, anon, authenticated;
