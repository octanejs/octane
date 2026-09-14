// Recreate the investigated branch-swap extraction without changing the runtime
// shipped by this repository. Input is the audit's frozen baseline runtime.ts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [input, output] = process.argv.slice(2);
assert.ok(
	input && output,
	'usage: node branch-candidate.mjs baseline-runtime.ts output-runtime.ts',
);
assert.notEqual(resolve(input), resolve(output), 'write the diagnostic to a separate file');
const original = readFileSync(input, 'utf8');

function uniqueIndex(source, text, label) {
	const index = source.indexOf(text);
	assert.notEqual(index, -1, `${label}: expected source boundary`);
	assert.equal(source.indexOf(text, index + text.length), -1, `${label}: unique source boundary`);
	return index;
}

function replaceOnce(source, previous, next, label) {
	const index = uniqueIndex(source, previous, label);
	return source.slice(0, index) + next + source.slice(index + previous.length);
}

const start = uniqueIndex(original, 'function renderBranchSlot(', 'branch renderer');
const end = uniqueIndex(original, '\ninterface IfSlot ', 'branch renderer end');
assert.ok(end > start, 'branch renderer precedes IfSlot');
const renderer = original.slice(start, end);
const changedStart = '\tif (next !== state.branch) {\n';
const unchangedStart = '\t} else if (state.block) {\n';
const changed = uniqueIndex(renderer, changedStart, 'changed-arm condition');
const unchanged = uniqueIndex(renderer, unchangedStart, 'unchanged-arm condition');
assert.ok(unchanged > changed, 'changed arm precedes unchanged arm');
const cursorComment = '\t// Hydration consumed the whole outer control-flow slot,';
const cursor = uniqueIndex(renderer, cursorComment, 'hydration cursor tail');
assert.ok(cursor > unchanged, 'both arms precede the hydration cursor tail');
assert.ok(renderer.endsWith('\n}\n'), 'renderer ends at its function boundary');

const header = replaceOnce(
	renderer.slice(0, changed),
	'\tconst parentBlock = parentScope.block;\n',
	'',
	'parent ownership lookup',
);
assert.ok(
	header.includes('\tif (CURRENT_BLOCK?.pending && !CURRENT_BLOCK.crossRenderUpdate) return;\n'),
	'preserve the pending-parent guard in the shared renderer',
);
assert.ok(
	header.includes('\tconst hydration = activeHydration();\n'),
	'capture shared hydration before rendering either arm',
);
const coldBody = renderer
	.slice(changed + changedStart.length, unchanged)
	.split('\n')
	.map((line) => (line.startsWith('\t') ? line.slice(1) : line))
	.join('\n');
const wrapper =
	header +
	'\tif (next !== state.branch) {\n' +
	'\t\trenderChangedBranchSlot(parentScope, slotKey, state, domParent, next, body, marker, hydration, env);\n' +
	'\t\treturn;\n\t}\n\tif (state.block) {\n' +
	renderer.slice(unchanged + unchangedStart.length);
const helper = `// Mounts and branch changes carry ownership, rollback, and hydration work.
// Keep that setup out of the unchanged-arm update's compilation unit.
function renderChangedBranchSlot(
	parentScope: Scope,
	slotKey: number,
	state: BranchSlot,
	domParent: Node,
	next: number,
	body: ComponentBody | null,
	marker: string,
	hydration: HydrationCapability | null,
	env?: any[],
): void {
	const parentBlock = parentScope.block;
`;
// Each arm keeps its original cursor tail, including which early returns bypass
// it. Returning from the changed-arm helper must not run the shared tail again.
let candidate =
	original.slice(0, start) +
	wrapper +
	'\n' +
	helper +
	coldBody +
	renderer.slice(cursor) +
	original.slice(end);

for (const name of ['ifBlock', 'switchBlock']) {
	const functionStart = uniqueIndex(candidate, `export function ${name}(`, `${name} declaration`);
	const functionEnd = candidate.indexOf('\n}\n', functionStart);
	assert.notEqual(functionEnd, -1, `${name}: function closing boundary`);
	const region = candidate.slice(functionStart, functionEnd + 2);
	let rewritten = replaceOnce(
		region,
		'\tconst hydration = activeHydration();\n',
		'',
		`${name} initial hydration lookup`,
	);
	rewritten = replaceOnce(
		rewritten,
		'\tif (state === undefined) {\n',
		'\tif (state === undefined) {\n\t\tconst hydration = activeHydration();\n',
		`${name} initialization`,
	);
	candidate = candidate.slice(0, functionStart) + rewritten + candidate.slice(functionEnd + 2);
}

writeFileSync(output, candidate);
const hash = (value) => createHash('sha256').update(value).digest('hex');
console.log(
	JSON.stringify({
		input: resolve(input),
		output: resolve(output),
		inputSha256: hash(original),
		outputSha256: hash(candidate),
	}),
);
