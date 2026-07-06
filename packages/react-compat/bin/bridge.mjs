#!/usr/bin/env node
// CLI: analyze (and optionally bridge) React source for Octane.
//
//   node bin/bridge.mjs <file...>            # report only
//   node bin/bridge.mjs --write <file...>    # also write *.octane.tsx bridged output
//
// Report = the verdict + the "React surface used vs Octane supported" diff +
// every finding with its severity, and the codemod change-log. This is the
// deterministic, non-AI core; the MCP consumes the `flag`/`block` residual.
import { readFile, writeFile } from 'node:fs/promises';
import { detect, SEVERITY } from '../src/detect.mjs';
import { bridge } from '../src/codemod.mjs';

const SEV_LABEL = { 0: 'ok', 1: 'autofix', 2: 'flag ', 3: 'block' };
const VERDICT_ICON = {
	bridgeable: '✅',
	'bridgeable-autofix': '🔧',
	'needs-review': '⚠️ ',
	'needs-rework': '⛔',
};

function reportOne(filename, source) {
	const { verdict, findings, surface } = detect(source, filename);
	const lines = [];
	lines.push(`\n${VERDICT_ICON[verdict]} ${filename}  →  ${verdict}`);

	// React surface used vs Octane supported.
	if (surface.length) {
		lines.push('  surface:');
		for (const r of surface) {
			const tag = r.status === 'same' ? 'same' : r.status.toUpperCase();
			lines.push(`    ${tag.padEnd(11)} ${r.name} ×${r.count}`);
		}
	}

	// Findings (rule hits) that need attention.
	const notable = findings.filter((f) => f.severity >= SEVERITY.autofix);
	if (notable.length) {
		lines.push('  findings:');
		for (const f of notable) {
			lines.push(
				`    [${SEV_LABEL[f.severity]}] ${filename}:${f.line}  ${f.ruleId} — ${f.snippet}`,
			);
			lines.push(`            ${f.note}`);
		}
	}

	// Codemod preview.
	const { log } = bridge(source);
	if (log.length) {
		lines.push('  codemod:');
		for (const c of log) lines.push(`    • (${c.transform}) ${c.change}`);
	}
	return { verdict, text: lines.join('\n') };
}

async function main() {
	const argv = process.argv.slice(2);
	const write = argv.includes('--write');
	const files = argv.filter((a) => !a.startsWith('--'));
	if (!files.length) {
		console.error('usage: bridge.mjs [--write] <file...>');
		process.exit(2);
	}

	const summary = {};
	for (const file of files) {
		const source = await readFile(file, 'utf8');
		const { verdict, text } = reportOne(file, source);
		console.log(text);
		summary[verdict] = (summary[verdict] ?? 0) + 1;

		if (write && (verdict === 'bridgeable' || verdict === 'bridgeable-autofix')) {
			const out = bridge(source).source;
			const dest = file.replace(/\.(t|j)sx?$/, '.octane.$1sx');
			await writeFile(dest, out);
			console.log(`    ↳ wrote ${dest}`);
		}
	}
	console.log('\n── summary ──');
	for (const [v, n] of Object.entries(summary)) console.log(`  ${VERDICT_ICON[v]} ${v}: ${n}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
