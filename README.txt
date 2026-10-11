TWI deploy build (split)
- index.html      : app without the embedded roster (~104 KB gzipped, was ~1.6 MB)
- companies.json  : the full roster (9,391 companies), loaded as companies.json?v=<hash>, cached by browsers
- firebase.hosting.headers.json : merge the "headers" block into the "hosting" section of your firebase.json
Deploy both files together (firebase deploy --only hosting). The ?v= hash changes whenever the data changes,
so a long cache on companies.json is safe.
Seeding: SEED_COMPANIES is filled from companies.json before the app starts; the Seed / Re-seed buttons work as before.
The full single-file index.html (tankworldindia_update/index.html) remains the source file and is a drop-in fallback.
