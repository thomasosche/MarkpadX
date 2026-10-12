// Runs the E2E suites strictly one after another (the app allows a single instance).
// Usage: node tests/e2e/run.mjs [suite ...]     suites: main carry reload folder tabsearch (default: all)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXE, markpadRunning } from './lib.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ALL = ['main', 'carry', 'reload', 'folder', 'tabsearch'];
const wanted = process.argv.slice(2).map((a) => a.replace(/\.mjs$/, ''));
const suites = wanted.length ? wanted : ALL;
const unknown = suites.filter((x) => !ALL.includes(x));
if (unknown.length) { console.error(`unknown suite(s): ${unknown.join(', ')} (known: ${ALL.join(', ')})`); process.exit(2); }
if (!fs.existsSync(EXE)) { console.error(`debug build not found: ${EXE}\nBuild it first: npx tauri build --debug --no-bundle`); process.exit(2); }
if (markpadRunning()) { console.error('Markpad.exe is already running (single-instance app): close it first.'); process.exit(2); }

const results = [];
for (const name of suites) {
	console.log(`\n===== ${name} =====`);
	const t0 = Date.now();
	const code = await new Promise((resolve) => {
		const p = spawn(process.execPath, [path.join(dir, name + '.mjs')], { stdio: 'inherit' });
		p.on('exit', (c) => resolve(c ?? 1));
		p.on('error', () => resolve(1));
	});
	results.push({ name, code, secs: Math.round((Date.now() - t0) / 1000) });
}

console.log('\n===== summary =====');
for (const r of results) console.log(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.name.padEnd(8)} ${r.secs}s${r.code === 0 ? '' : '  (exit ' + r.code + ')'}`);
const failed = results.filter((r) => r.code !== 0);
console.log(failed.length ? `${failed.length} of ${results.length} suites FAILED` : `all ${results.length} suites passed`);
process.exit(failed.length ? 1 : 0);
