/**
 * Build the shadow-DOM overlay stylesheet.
 *
 * Upstream react-grab injects `dist/styles.css` (Tailwind-compiled) into the
 * overlay shadow root. Authored `src/styles.css` alone is not enough: `@import
 * 'tailwindcss'` never expands inside a `<style>` text node, so utilities like
 * `pointer-events-auto` are missing and the toolbar stays unclickable under the
 * host's `pointer-events: none`.
 *
 * rem → px matches upstream: rem is relative to the page `<html>` font-size,
 * which many sites override.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const BROWSER_DEFAULT_FONT_SIZE_PX = 16;
const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const input = join(pkgRoot, 'src/styles.css');
const output = join(pkgRoot, 'src/overlay-styles.css');

const require = createRequire(join(pkgRoot, 'package.json'));
let cliBin;
try {
	cliBin = require.resolve('@tailwindcss/cli/package.json');
} catch {
	cliBin = null;
}

const tailwindArgs = ['-i', input, '-o', output, '-m'];
let result;
if (cliBin) {
	const cliMain = join(dirname(cliBin), 'dist/index.mjs');
	result = spawnSync(process.execPath, [cliMain, ...tailwindArgs], {
		cwd: pkgRoot,
		stdio: 'inherit',
	});
} else {
	result = spawnSync('pnpm', ['exec', 'tailwindcss', ...tailwindArgs], {
		cwd: pkgRoot,
		stdio: 'inherit',
		shell: true,
	});
}

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}

const cssContent = readFileSync(output, 'utf8');
const transformedCss = cssContent.replace(
	/(\d*\.?\d+)rem\b/g,
	(_, remValue) => `${parseFloat(remValue) * BROWSER_DEFAULT_FONT_SIZE_PX}px`,
);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, transformedCss);
console.log(`wrote ${output} (${transformedCss.length} bytes)`);
