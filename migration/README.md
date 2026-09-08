# Tuberculum authenticated migration

## Status
Separate Supabase project created in Singapore: dulpedkbyrfzlbzveyey.
The foundation migration has been applied. Ten tables have RLS enabled; anonymous SELECT and authenticated INSERT privileges are absent.
Vercel project creation is NOT verified: an initial tool success was followed by project/deployment 404 responses; retry returned 403 permission denied for creating a preview deployment.
GitHub Pages on main remains the working course. This branch is preparatory and must not be merged into main until migration acceptance checks pass.

## Confirmed requirements
- Responsible owner and initial administrator: Dr Tay Jun Yang.
- Invitation-only enrolment; email/password and recovery. No mandatory admin MFA.
- Required learner name, email, organisation, MCR, postgraduate year and specialty.
- Final pass threshold: unrounded score >= 21 out of 30 (>=70%).
- Targeted feedback and relevant revision before retake; retain all attempts.
- Certificate requires mandatory warm-up, required teaching and patient journeys, passing final assessment and closing reflection. General feedback is optional.
- Confidence slider midpoint is a valid response without interaction.
- Maintain course clinical content, existing introduction video and GP-led or NTBSC-led care options.

## Implementation plan
1. Resolve Vercel project creation permission and connect this migration branch to a separate project; do not repoint the current Pages site.
2. Implement server-verified invitation acceptance, sign-in/recovery and profile onboarding. Disable public signup; no client-controlled administrator role.
3. Configure production email delivery and authorised callback URLs after the deployment URL is confirmed.
4. Establish membership-scoped access policies and authenticated server handlers. Current closed tables are intentional, not a working learner API.
5. Migrate progress to central records, enforce the warm-up prerequisite on the server and retain assessment attempts.
6. Move final assessment scoring keys to the private schema and score submissions on the server. Feedback must not expose future answers.
7. Issue certificates from verified completion records; store privately and support authenticated retrieval and administrator revocation.
8. Implement administrator learner invitations, enrolment/progress view and audit trail.
9. Validate with separate administrator and learner accounts before inviting the review cohort.

## Acceptance checks
- Uninvited users cannot access course data, even via direct API requests.
- Learner A cannot read or modify learner B's data.
- Learners cannot grant roles, edit scores, set completion or issue certificates.
- 21/30 passes; a score below 21 does not pass. Use unrounded values.
- Failed attempts lead to targeted revision and retake without deleting earlier attempts.
- Untouched confidence sliders retain the midpoint; warm-up remains mandatory.
- Certificate issuance is idempotent and occurs only after all requirements are met.
- Browser localStorage or older mock certificates do not establish completion.
- Invitation expiry/revocation, password recovery and revoked access behave correctly.

## Deployment notes
The holding page in migration/holding is preparatory; it contains no login or learner records.
Do not place service-role keys, database passwords or other secrets in source control.
The initial database schema does not yet configure Auth, email, storage, account creation or application access policies.
