# tankworldindia
Classified listing of Tank Contractors in India

## T3 decisions (17–18 Oct 2026)

TankWorldIndia is one of the three T3 apps, with Tankonomics and TankBazaar.

- It will use the Tankonomics sign-in.
- Its hosting moves to Cloud Run.
- Roster v2 (25 Oct): hosting serves only `index.html`; the company roster is
  published into Firestore from the admin panel ("Publish roster from
  companies.json…"). Never commit `companies.json` or the single-file build.
  How it works and why: `docs/TWI_COST_REDESIGN.md`.
- Company data rules and locations for the merge: `T3_DECISIONS.md` §10.
- Build items for this repo: `T3_TWI_WORKPLAN.md`.
- Retired slugs and their survivors: `TWI_RETIRED_SLUGS.csv`.

See `T3_DECISIONS.md` for the full record.
