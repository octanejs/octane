// Agent context that loads on EVERY session has to stay small, or adherence
// drops and every unrelated task pays for it.
//
// Two things load unconditionally: the root rule (CLAUDE.md and its per-agent
// siblings) and the `description` of every skill, which hosts list so the model
// can route. Everything else in .rulesync/ carries `globs` and loads only when
// a matching file is opened, so that content is deliberately not budgeted here.
//
// Budgets are ceilings with headroom, not targets. Raising one is a decision to
// make in review, which is the point of failing here.

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Claude Code's own guidance is to keep a CLAUDE.md under 200 lines. The byte
// ceiling catches the same regrowth arriving as long lines.
const ROOT_RULE_MAX_LINES = 200;
const ROOT_RULE_MAX_BYTES = 8_000;
// A description states when to reach for a skill. Past a couple of sentences it
// is documentation, and it belongs in the skill body instead.
const SKILL_DESCRIPTION_MAX_CHARS = 400;

const failures = [];

const rootRule = readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8');
const rootLines = rootRule.split('\n').length;
const rootBytes = Buffer.byteLength(rootRule);

if (rootLines > ROOT_RULE_MAX_LINES) {
	failures.push(`CLAUDE.md is ${rootLines} lines, over the ${ROOT_RULE_MAX_LINES}-line budget.`);
}
if (rootBytes > ROOT_RULE_MAX_BYTES) {
	failures.push(`CLAUDE.md is ${rootBytes} bytes, over the ${ROOT_RULE_MAX_BYTES}-byte budget.`);
}

const skillsRoot = path.join(REPO, '.rulesync', 'skills');
for (const name of readdirSync(skillsRoot)) {
	const file = path.join(skillsRoot, name, 'SKILL.md');
	const frontmatter = /^---\n([\s\S]*?)\n---/.exec(readFileSync(file, 'utf8'));
	if (!frontmatter) {
		failures.push(`.rulesync/skills/${name}/SKILL.md has no frontmatter.`);
		continue;
	}
	const description = /^description:\s*(.+(?:\n\s+.+)*)$/m.exec(frontmatter[1]);
	if (!description) {
		failures.push(
			`.rulesync/skills/${name}/SKILL.md has no description: hosts route on it, so it is required.`,
		);
		continue;
	}
	const length = description[1].replace(/\s+/g, ' ').trim().length;
	if (length > SKILL_DESCRIPTION_MAX_CHARS) {
		failures.push(
			`.rulesync/skills/${name} description is ${length} chars, over the ${SKILL_DESCRIPTION_MAX_CHARS}-char budget.`,
		);
	}
}

if (failures.length > 0) {
	console.error('Always-loaded agent context is over budget:');
	for (const failure of failures) console.error(`  ${failure}`);
	console.error(
		'\nMove path-specific content into a .rulesync rule with `globs` so it loads only when a',
	);
	console.error(
		'matching file is opened, or into a skill body. Keep the root rule to what no agent can',
	);
	console.error('derive by reading the repo: above all, the intentional divergences from React.');
	process.exit(1);
}

console.log(
	`context budget check passed (CLAUDE.md ${rootLines} lines / ${rootBytes} bytes, all skill descriptions within budget).`,
);
