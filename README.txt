TWI deploy build (roster v2, 25 Oct 2026)
- index.html : the whole app (~400 KB, ~100 KB gzipped). It no longer contains or fetches the roster.
- firebase.hosting.headers.json : merge "ignore" and "headers" into the "hosting" section of firebase.json.
The roster is NOT deployed to hosting any more. It is published into Firestore from the admin panel
(Admin -> "Publish roster from companies.json...") using the file in TWI_Roster/.
Deploy hosting only when the app code changes. See TWI_COST_REDESIGN.md.
