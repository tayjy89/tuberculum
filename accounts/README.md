# Tuberculum accounts release

Responsible owner: Dr Tay Jun Yang. Designated initial administrator: tuberculum.course@gmail.com.

The Vercel application serves the account shell from accounts/web. Clinical content is returned by the Supabase course-api Edge Function after verified authentication, active membership, a complete learner profile and the mandatory warm-up. Frontend responses do not include the final assessment key. The earlier public course is still in repository history; a future new assessment form should be used if resistance to previously published answers is required.

## Implemented
- Open email/password self-registration through Supabase Auth, with email confirmation before automatic learner enrolment. Invitations remain optional.
- Self-registration always assigns the learner role. Existing administrator roles and deactivated accounts are preserved. Profile and warm-up gates are unchanged.
- Configure a production SMTP provider in Supabase Auth for confirmation emails to external learners, and set the Auth Site URL to https://tuberculum.vercel.app. The signup request also specifies this return URL. Confirmed learners can return to the site and sign in with their password; callback tokens are removed from the address bar.
- Administrator bulk invitations (up to 100 addresses), CSV email import, invitation revocation, account activation/deactivation, response export and certificate revocation.
- Invitation and recovery links expire in seven days. They must be shared privately by the administrator; automatic email delivery is not configured.
- Mandatory learner profile: full name, organisation, MCR number, postgraduate year and specialty.
- Central submitted warm-up, lesson checkpoints, patient decisions, assessment attempts and closing reflection. Unsubmitted form selections are not persisted.
- Server scoring; exactly 21/30 passes. All final attempts are retained. Failed attempts require the targeted teaching checkpoints again before retake.
- Certificate requires warm-up, all nine teaching experiences, all nine patient journeys, a passing final assessment and reflection. General feedback is optional. Certificates store an immutable issued name, course version, timestamp and identifier; repeated requests return the same certificate. Revoked certificates cannot be downloaded again. PDF output uses the browser print dialogue.

## Deployment
Frontend: Vercel project prj_LgM2qfmGklhscPFwy5iN5fk86K8a, https://tuberculum.vercel.app.
Backend: Supabase dulpedkbyrfzlbzveyey (Singapore), course-api Edge Function.

The backend uses its default SUPABASE_DB_URL and SUPABASE_SERVICE_ROLE_KEY secrets. Neither is sent to browsers. The gateway JWT check is disabled because invitation acceptance is pre-login; the function itself validates every other request through Auth and an active auth.sessions row, followed by a database membership lookup. All tables have RLS, and browser roles have no direct write privileges. The function is the access boundary.

To generate the private content package, run `node accounts/extract.cjs`. Deploy accounts/server/index.ts, accounts/server/rules.mjs and the generated accounts/server/content.json together to course-api. Never include the generated content package in the Vercel output. Build frontend with `node build.mjs`.

## Verification
Live backend checks passed for unauthenticated denial, learner/admin boundary, learner record isolation, mandatory warm-up, hidden keys, all teaching/journeys, exactly 21/30, duplicate final submission denial, reflection prerequisite, idempotent certificates and cross-learner certificate denial. Scoring unit tests include partial credit and invalid responses.

Automatic approval review prohibited elevating a test learner to administrator. Administrator invitation/recovery/revocation UI operations therefore require verification using the designated owner's account; no extra administrator was provisioned for testing.

## Operations
- Bootstrap invitation is delivered privately to the course owner, not committed here.
- Use the administrator screen to generate invitation/recovery links and send each privately to its intended recipient. Links are credentials until consumed.
- Do not change roles through user-editable metadata.
- Do not import old localStorage records as evidence for certificates.
- Research use, consent and retention policy require separate governance decisions. The privacy page explains course administration and does not imply research consent.
