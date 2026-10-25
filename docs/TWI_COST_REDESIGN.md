# TWI cost redesign: roster v2 (25 Oct 2026)

## Why each deploy caused a billing spike

| What happened | Cost |
|---|---|
| Every page load listed the whole `companies` collection (`FS_REST.listAuth('companies')`), including the background refresh after a cache hit. | ~9,500 billed reads **per visit**. The free tier (50,000 reads/day) runs out after about 5 page loads. |
| After each deploy the admin panel was used to Seed, then reload or check orphans and missing records. Each of those also re-listed the collection. | ~9,500 writes per seed, plus ~9,500 reads per reload or check. One deploy session easily used 50,000–100,000 reads. |
| Every data change meant redeploying `companies.json` (7.7 MB). Every visitor's cache then expired and they downloaded it again. | Hosting upload, storage (every release is kept) and transfer. The file was also publicly downloadable (T3 exposure §9). |

## What the Hosting usage report shows (1–25 Oct)

- **Downloads: 49.65 GB this month**, about 2 GB a day. Free transfer is 360 MB a day (about 10.8 GB a month), so roughly 40 GB is billed at about $0.15/GB. **This is the main Hosting cost.**
- **Why:** the live build is the single-file `index.html` with the 9,540-company roster embedded (about 8 MB, about 1.7 MB compressed). It has only a 5-minute cache, so every visit and reload downloads it again. The page is public: the sign-in gate only hides the data, it does not stop the download. That means crawlers and bots fetch it too.
- **Storage: 1.36 GB**, rising with each deploy because every old release is kept. This is still inside the 10 GB free allowance.
- **With roster v2:** each page load downloads about 100 KB instead of about 1.7–8 MB, a cut of about 95% or more. The roster comes from Firestore only for signed-in, approved users, and only when a new version is published. `robots.txt` now asks crawlers to stay away until launch.

## What changed

- **Visitors no longer read the companies collection.**
  - The roster is published into Firestore as one small pointer (`meta/roster`) plus the whole roster gzipped into ~0.9 MB pieces (`rosterParts/{version}_{n}`). Today that is 3 pieces, about 1.7 MB.
  - The pieces sit behind the same approved-user gate as before. This is the same pattern decided for TankBazaar (T3 §2).
- **Read cost per visit:**
  - Browser already has the current version: 1 read (the pointer) + 1 (an edits check).
  - First visit after a new publish: about 5 reads.
  - Before: about 9,500.
- **In-app edits** (company editor, owner edits, claims, logo uploads) still write to `companies/{slug}`. They are also copied, changed fields only, into `companyEdits/{slug}`. Visitors fetch only the edits newer than what they already hold.
- **Publishing replaces seeding.** Use Admin → *Publish roster from companies.json…*.
  - It carries forward everything that exists only in Firestore: owner, profile and company sections, logos, certifications.
  - It folds in all in-app edits, then writes a new version: 4 writes instead of ~9,500.
  - The previous version is kept for rollback; older ones are deleted.
  - **The first publish** reads the existing companies collection once (~9,540 reads) so nothing added in the app is lost.
- **Data updates no longer need a hosting deploy.** Hosting serves only `index.html` (~100 KB gzipped). Deploy only when the app code changes.
- **New admin buttons:**
  - Check for updates.
  - Download live roster.
  - Download in-app edits: send this file before a new roster is prepared, so edits made in the app go into the master file.
  - *Find orphaned records* is kept, but warns that it reads the whole collection once.
  - Seed and Find missing records are retired.

Tested against a mock Firestore:
- Publish (first and repeat) works.
- Carry-forward of owner, profile sections and live logo works.
- In-app edit and delete are visible to a new visitor.
- Read counts: new visitor 6, returning visitor 2.
- Version retention keeps two versions.
- No page errors.

## One-time steps (in this order)

1. **Rules.** Add the three blocks in `TWI_Rules/firestore_rules_ADD_THIS.txt` to `firestore.rules` (above Categories), then run `firebase deploy --only firestore:rules`. `TWI_Rules/firestore.rules` is the 7 Oct copy with the blocks added; compare it with the repo version before using it whole.
2. **Hosting config.** Merge `ignore` and `headers` from `TWI_Deploy/firebase.hosting.headers.json` into the `hosting` section of `firebase.json`. Remove the old `/companies.json` header rule. The ignore list stops stray roster, xlsx, csv, md and pkl files in the hosting folder from being uploaded (and published) with each deploy.
3. **Remove `companies.json`** from the hosting folder and from the repo. It must not be served any more.
4. **Deploy once.** Replace `index.html` with `TWI_Deploy/index.html` and add `TWI_Deploy/robots.txt` (blocks crawlers before launch; remove it at launch), then run `firebase deploy --only hosting`.
5. **Release retention.** In the Firebase console, open Hosting → the site's ⋮ menu → *Release storage settings* and keep only the last 3 releases. By default every release is kept and billed as storage.
6. **Publish.** Sign in as admin, open Admin, choose *Publish roster from companies.json…* and pick `TWI_Roster/TWI_companies_2026-10-25.json` (9,361 companies). Until this is done the directory shows no companies.
7. *(Optional, later)* *Find orphaned records* lists the ~180 `companies` docs whose slugs were retired. Delete them once. This costs ~9,500 reads, one time.

## From now on

- **Data update:** I send a new `TWI_companies_<date>.json`, and you publish it from the admin panel. No deploy.
- **Code update:** I send `index.html`, and you deploy hosting.
- **Edits made in the app:** before I prepare a new roster, send the *Download in-app edits* file so they go into the master. Publishing also keeps them automatically.

## Notes

- A company deleted in the app stays deleted on later publishes, even if it reappears in a new file. Remove its `companyEdits` doc to undo this.
- Owner write rules are unchanged: an approved owner can still update any field of their own `companies` doc. Field limits for owners are a separate, later rule change.
- The source of truth for data is still `tankworldindia_update/index.html` (the embedded roster). The deploy build and the roster file are both generated from it.
