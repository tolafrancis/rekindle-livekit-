#!/usr/bin/env node
// scripts/check-i18n-seeds.cjs
// Consistency check for the Vietnamese UI-translation seed migrations.
// Scans supabase/migrations/00{30..52}_*.sql for rows of the form
//   ('vi','<namespace>','<key>','<value>',<reviewed>)
// and reports:
//   - total rows and unique (namespace.key) count
//   - any key seeded MORE THAN ONCE with DIFFERENT values (ON CONFLICT DO NOTHING
//     would silently keep only the first — a likely mistake)
//   - any empty values
// Exit code 1 if a hard problem (conflicting dup / empty value) is found.
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(dir).filter(f => /^00(3\d|4\d|5[0-2])_.*\.sql$/.test(f)).sort();

// Match ('vi','ns','key','value',false) — value may be E'...' and contain escaped quotes.
const ROW = /\('vi','([^']+)','([^']+)',\s*(E?)'((?:[^']|'')*)'\s*,\s*(true|false)\s*\)/g;

const seen = new Map(); // "ns.key" -> { value, file }
let total = 0, empties = 0, conflicts = 0;
const conflictList = [];

for (const f of files) {
  const sql = fs.readFileSync(path.join(dir, f), 'utf8');
  let m;
  while ((m = ROW.exec(sql)) !== null) {
    total++;
    const ns = m[1], key = m[2], value = m[4];
    const id = ns + '.' + key;
    if (!value || value.trim() === '') { empties++; console.error(`EMPTY VALUE: ${id} in ${f}`); }
    if (seen.has(id)) {
      const prev = seen.get(id);
      if (prev.value !== value) {
        conflicts++;
        conflictList.push(`  ${id}: "${prev.value}" (${prev.file}) vs "${value}" (${f})`);
      }
    } else {
      seen.set(id, { value, file: f });
    }
  }
}

console.log(`Scanned ${files.length} seed migrations.`);
console.log(`Rows: ${total}   Unique keys: ${seen.size}   Duplicate-with-conflict: ${conflicts}   Empty: ${empties}`);
if (conflictList.length) {
  console.error('\nConflicting duplicate keys (first value wins via ON CONFLICT DO NOTHING):');
  console.error(conflictList.slice(0, 40).join('\n'));
}
process.exit(conflicts > 0 || empties > 0 ? 1 : 0);
