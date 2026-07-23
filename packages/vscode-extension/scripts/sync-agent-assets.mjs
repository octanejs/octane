import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');
const SOURCE_ROOT = path.join(REPO_ROOT, 'packages/octane-mcp-server/skills');
const OUTPUT_ROOT = path.join(PACKAGE_ROOT, 'assets/skills');
const CHECK = process.argv.includes('--check');

const SKILLS = [
	{
		name: 'build-octane-software',
		source: 'build-octane-software.md',
		description:
			'Build or materially change production-grade Octane applications, components, libraries, and framework integrations with explicit correctness, performance, validation, and review gates.',
	},
	{
		name: 'bridge-react-package',
		source: 'bridge-react-package.md',
		description:
			'Bridge a React ecosystem package to Octane after checking for an official @octanejs binding and classifying required rewrites.',
	},
	{
		name: 'migrate-react-component',
		source: 'migrate-react-component.md',
		description:
			'Migrate React JSX or TSX component source to an Octane .tsrx component while preserving behavior and applying native Octane semantics.',
	},
	{
		name: 'react-divergences',
		source: 'react-divergences.md',
		description:
			'Decide whether behavior that differs from React is an intentional Octane divergence or a bug before proposing a compatibility change.',
	},
	{
		name: 'setup-ssr',
		source: 'setup-ssr.md',
		description:
			'Set up Octane server rendering, streaming, static prerendering, hydration, and production deployment with the supported public APIs.',
	},
];

function renderSkill(skill, body) {
	return `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${body}`;
}

const stale = [];
for (const skill of SKILLS) {
	const source = await readFile(path.join(SOURCE_ROOT, skill.source), 'utf8');
	const output = renderSkill(skill, source);
	const outputPath = path.join(OUTPUT_ROOT, skill.name, 'SKILL.md');

	if (CHECK) {
		let current = '';
		try {
			current = await readFile(outputPath, 'utf8');
		} catch {
			// Missing generated output is reported through the same actionable error.
		}
		if (current !== output) stale.push(path.relative(REPO_ROOT, outputPath));
		continue;
	}

	await mkdir(path.dirname(outputPath), { recursive: true });
	await writeFile(outputPath, output);
}

if (stale.length > 0) {
	console.error(
		`VS Code agent assets are stale:\n${stale.map((file) => `  - ${file}`).join('\n')}\nRun pnpm --dir packages/vscode-extension assets.`,
	);
	process.exitCode = 1;
} else if (CHECK) {
	console.log(`VS Code agent assets are current (${SKILLS.length} skills).`);
} else {
	console.log(`Generated ${SKILLS.length} VS Code agent skills.`);
}
