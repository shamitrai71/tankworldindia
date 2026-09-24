# TWI Profile Sections — Schema Contract

**System of record:** TankWorldIndia (TWI). Data flows TWI → Tankonomics.
**Stored:** Firestore `companies/{slug}`, field `profileSections`. Never in the static `index.html` roster.
**Defined in code:** `PROVENANCE` and `PROFILE_SECTIONS` in TWI `index.html`. Change both sides together, never ad hoc.

## Shape

```js
profileSections: {
  certifications: [ entry, ... ],   // free-text; supplements the pick-list `certifications` slug array
  accreditations: [ entry, ... ],
  affiliations:   [ entry, ... ],
  clients:        [ entry, ... ],
  projects:       [ entry, ... ],
  patents:        [ entry, ... ],
  highlights:     [ entry, ... ],
}
```

Sections with no entries are omitted entirely (not written as empty arrays).

## Fields common to every entry

| Field | Values | Meaning |
|---|---|---|
| `prov` | `"company"` \| `"source"` \| `"verified"` | Who stands behind the claim |
| `url` | http(s) URL or `""` | Source link. **Required** when `prov` is `"source"` |
| `by` | `"twi"` \| `"company"` | Who entered it (audit trail) |
| `at` | `"YYYY-MM-DD"` | Date entered or last edited |

## Section-specific fields (first field is the required primary)

| Section | Fields |
|---|---|
| certifications | `name`*, `issuer`, `year` |
| accreditations | `name`*, `issuer`, `year` |
| affiliations | `name`*, `role` |
| clients | `name`*, `note` |
| projects | `name`*, `client`, `year`, `location`, `scope` |
| patents | `number`*, `title`, `year` |
| highlights | `name`* |

All field values are strings. Entries with an empty primary field are dropped on save.

## Provenance rules (the core principle)

- **`company`** — the company's own claim (its website, brochure, or later its own edits). Default for admin entries, since these are almost always copied from company material. Displayed as "as stated by the company".
- **`source`** — backed by a public document (tender award, press release, patent record). Must carry a valid http(s) `url`; the save is blocked otherwise.
- **`verified`** — confirmed by TWI itself. Use sparingly; that scarcity is what makes it meaningful.

TWI does not vouch for third-party relationships (clients, projects, approvals) it hasn't checked — the same principle behind removing the blanket "SAMREF-approved" descriptions.

## Consumer obligations (Tankonomics and any other reader)

1. **Escape every value** before rendering. Once companies self-edit, all of this is untrusted input.
2. **Only render `url` as a link if it starts with `http://` or `https://`.**
3. **Show provenance** — at minimum, distinguish `verified` and `source`-linked entries from company-stated ones.
4. **Hide empty sections.** An absent section means "not recorded", never "none".
5. **Ignore unknown section keys and fields** rather than erroring, so TWI can add sections without breaking readers.

## Required before company self-edit ships

- Firestore security rules must **reject `prov: "verified"` from any non-admin writer**.
- Company-account writes must set `by: "company"` (enforced by rules, not trusted from the client).
- Company-account writes must be limited to that company's own document.
