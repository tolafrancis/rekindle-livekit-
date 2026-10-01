// Runs the meeting layout unit tests (packages/live/src/layout/*.test.ts)
// with Node's built-in test runner. The repo has no test framework, so this
// transpiles the folder with TypeScript into a temp dir and runs it there.
//
//   node scripts/test-meeting-layout.mjs
import { createRequire } from 'node:module';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const src = path.resolve('packages/live/src/layout');
const out = mkdtempSync(path.join(tmpdir(), 'layout-test-'));
writeFileSync(path.join(out, 'package.json'), '{"type":"module"}');

const tests = [];
for (const file of readdirSync(src).filter(f => f.endsWith('.ts'))) {
  const { outputText } = ts.transpileModule(readFileSync(path.join(src, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: false },
  });
  // Node's ESM loader needs explicit extensions on relative imports.
  const js = outputText.replace(/(from\s+['"])(\.\.?\/[^'"]+?)(['"])/g, '$1$2.js$3');
  const name = file.replace(/\.ts$/, '.js');
  writeFileSync(path.join(out, name), js);
  if (file.endsWith('.test.ts')) tests.push(path.join(out, name));
}

const res = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
rmSync(out, { recursive: true, force: true });
process.exit(res.status ?? 1);
