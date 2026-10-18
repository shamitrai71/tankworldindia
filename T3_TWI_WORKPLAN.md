# TankWorldIndia — T3 work plan

What this repo has to change for the T3 decisions (`T3_DECISIONS.md`). Taken
from the TankWorldIndia notes of the 17 Oct plan ("TankBazaar data move to
Firestore — plan", now `docs/TB_DATA_MOVE_PLAN.md` in the TankBazaar repo),
checked against this repo at `e2711f9` (15 Oct 2026). Last updated 18 Oct 2026.

**Context.** TankWorldIndia (`tankworldindia-t5`, default database) moves to the
Tankonomics sign-in, and its hosting moves from Firebase Hosting to Cloud Run.
The Firestore database stays where it is.

## A. Sign-in and access

1. **Sign-in.** Replace the app's own sign-in with **Continue with
   Tankonomics**:
   - sign in to the `tankonomics` project in a popup;
   - call the bridge (`POST /api/bridge/token`) with `app: 'twi'`;
   - then `signInWithCustomToken` on TankWorldIndia's own Firebase app. The
     user id there becomes `tk_<Tankonomics uid>`.
2. **Admin check.** `isAdmin()` in `firestore.rules` and `ADMIN_EMAILS` in
   `index.html` test `request.auth.token.email`. A custom token carries no
   email unless the bridge adds it. The bridge is planned to add `email` as a
   claim; until that is tested, admins keep a direct sign-in. Test admin access
   first.
3. **Approval.** `users/{uid}` creation requires `status == 'pending'`, set by
   the user. **Open:** does Tankonomics approval imply TankWorldIndia approval,
   or does TankWorldIndia get its own flag (`twiAccess`)? If approval carries
   over, the bridge writes the TankWorldIndia `users` doc as `approved` with the
   service account; if not, the current pending-then-approve flow stays.
4. **Existing accounts and owners.** `users` docs, `companies.ownerUid` and
   `companyClaims` hold today's TankWorldIndia uids. Map them to `tk_<uid>` by
   email in a one-time migration **before** the switch, or owners lose their
   listings.

## B. Data exposure and hosting

5. **Public roster.** `companies.json` (about 9,450 companies on 18 Oct,
   about 7.3 MB) is served from hosting and committed to the repo, so anyone
   can download it, whatever the database rules say.
   - Serve it from Cloud Run only to approved, signed-in users (the server
     checks the ID token before sending it), or load from Firestore only.
   - Remove it from the public repo either way (and from the git history if
     the repo is public).
   - Never commit or host the single-file build (`index.html` with the list
     embedded). Deploy only the split build.
6. **Cloud Run hosting.** Carry over the security headers from
   `firebase.json` (X-Frame-Options, nosniff, Referrer-Policy) and the `?v=`
   long-cache rule. One Cloud Run service can serve both Tankonomics and
   TankWorldIndia domains, or TankWorldIndia can run as its own service;
   either works with the bridge.

## C. Company identity and data for the merge

7. **Slug is the shared key.** TankWorldIndia companies map to Tankonomics
   companies by slug; a slug never changes after seeding. `CATEGORY_TREE`
   already mirrors the Tankonomics master taxonomy.
8. **Retired slugs.** Merged duplicates and deleted inactive companies are
   listed in `TWI_RETIRED_SLUGS.csv` (slug, old id, status, survivor). After
   each reseed, run "Find orphaned records" in the admin to delete their
   Firestore documents. The Tankonomics mapping must resolve slugs through this
   file.
9. **Registry IDs for matching.** Records carry `legalName`, `registrationId`
   and `legalNameSource`. Matching against TankBazaar and Tankonomics uses the
   registration ID first, the name only as a fallback.
10. **Verification status.** About 3,850 companies verified; about 5,600 in 90
    countries pending, worked country by country from the "TWI Companies
    enrichment" folder and applied only after tier approval
    (`T3_DECISIONS.md` §10).
11. **Locations.** Supplier offices, plants, service centres, R&D centres and
    warehouses are added to company pages before the merge. Terminals and
    process facilities are not added here (they are Tankonomics locations
    linked to TankBazaar). Mapping the location types and fields to the
    Tankonomics location schema is open.

## D. Order of work

1. Data preparation (C) continues now; it does not depend on the sign-in.
2. Close the data exposure (5) with the Cloud Run move (6).
3. Sign-in (1–4) once the bridge exists on Tankonomics' Cloud Run, with the
   uid migration (4) run just before the switch.
