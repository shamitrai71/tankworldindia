# TWI: corporate relationships and brands
Specification for the Tankonomics merge. TWI is the system of record; Tankonomics receives this data once, after its Typesense work.

## 1. What exists in TWI today

| Item | Where | Notes |
|---|---|---|
| `parent` | on each company | One link: `{ name, slug, relationship }`. `slug` points at a company OR an organization. 103 companies have one. |
| `ORGANIZATIONS` | static list in `index.html` | Parents that are not listed companies. Each: `{ slug, name, kind, country, site, linkedin }`. 54 today. |
| `brands`, `formerNames`, `aliases` | on each company | Arrays of plain text. Admin-edited only (not in the owner-editable field list). |
| `/group/<slug>` | page | Lists every company below an organization, at any depth. |

**Relationship types (`relationship`)**: `subsidiary`, `division`, `joint-venture`, `affiliate`, `associate`, `owned-by`. Always stored child to parent. The reverse ("group companies") is computed.

**Kind (`organizations.kind`)**: `group` (a conglomerate or family of companies) or `company` (a single legal entity not listed in the directory).

## 2. Rules

1. A subsidiary is a separate legal entity with its own record. It is not a location of its parent.
2. A parent that is not a listed company becomes an organization, not free text.
3. The corporate group is derived: follow `parent` upward to the top. Never typed in by hand.
4. `brands` = brands the company owns and sells. `formerNames` = earlier company names. `aliases` = trading names and common misspellings (e.g. "Soudakay"). Brands a company only distributes are a later, commercial relationship, not part of this field.
5. A brand, range or former name is never its own company record. It lives on the owning company so that search leads to the owner.
6. Slugs never change once published. Relationships point at slugs.

## 3. Proposed Tankonomics shape

TWI keeps one `parent` per company, which covers all 103 links today. A joint venture with several partners needs more than one link, so Tankonomics should store links as separate documents from the start; TWI converts on export.

```
organizations/{slug}              { name, kind, country, website, linkedin }
companyRelationships/{from}__{type}__{to}
                                  { fromSlug, toSlug, toKind: "company" | "organization",
                                    type, source, createdAt }
companies/{slug}                  + brands[], formerNames[], aliases[]
slugRedirects/{oldSlug}           { to, reason }       // merged or removed records
```

- Reads: any approved user. Writes to all four: admin only until claims are verified.
- **Naming**: Tankonomics already uses "Group" for community groups (feed, members). In the interface, corporate groups are "Corporate group" / "Group companies".
- **Redirects**: hundreds of TWI records have been merged or removed. Export the old-slug to surviving-slug table so any older link or `externalDirectoryUrl` still resolves.

## 4. Typesense (design only; not built)

One document per company, `id` = slug:

```
name, legal_name, brands[], former_names[], aliases[],
parent_name, group_name, group_slug, relationship,
country, city[], categories[], claimed
```

- Search `name`, `brands`, `former_names`, `aliases`, `legal_name`, `group_name`, with brands and former names ranked close to the name.
- Facets: `group_name`, `brands`, `country`, `city`, `categories`.
- `group_name` is copied onto each company. When a relationship changes, re-index the affected group companies (a Cloud Function on write).
- Organizations: a separate small collection, or excluded from the main index. They have no tile and no categories.

## 5. Backfill (in progress)

| Source | Size | Status |
|---|---|---|
| Existing parent links | 103 | Cleaned: all resolve; 3 backwards links reversed; odd values fixed |
| Unlisted parents | 54 | Created as organizations; countries and websites to be completed (TWI_Organizations_Review.xlsx) |
| Shared-website clusters across 2+ countries | 198 clusters, 695 companies | Review sheet to come |
| GLEIF direct / ultimate parent for held LEIs | 527 LEIs | To test; coverage will be partial |
| Descriptions mentioning a parent or a brand | about 300 | Text mining into a review sheet |
| Brands seeded so far | 8 companies | Only facts already confirmed in this project |
