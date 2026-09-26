import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { analyze, transform } from './proof.mjs';
import { build, matchesHost } from './build.mjs';

const file = new URL('./View.tsrx', import.meta.url).pathname;
const source = fs.readFileSync(file, 'utf8');

test('accepts an unannotated string-only view and inserts the compiler directive', () => {
	assert.deepEqual(analyze(source, file)?.fields, ['title', 'response', 'history', 'interactions']);
	assert.match(transform(source, file).code, /@\{\s*'use dom bindings';/);
	assert.doesNotMatch(source, /use dom bindings/);
});

test('general proof accepts names and string fields independently from this host', () => {
	const other = source
		.replaceAll('ConversationStatus', 'AnotherStatus')
		.replaceAll('response', 'other');
	const proof = analyze(other, file);
	assert.equal(proof?.name, 'AnotherStatus');
	assert.ok(proof.fields.includes('other'));
	assert.equal(matchesHost(proof), false);
	assert.equal(matchesHost(analyze(source, file)), true);
	const otherRoot = analyze(source.replace('id="automatic-status"', 'id="another"'), file);
	assert.ok(otherRoot);
	assert.equal(matchesHost(otherRoot), false, 'host transfer requires the expected root id');
});

test('rejects effects, imported calls, handlers, dynamic shapes and author assertions', () => {
	const examples = [
		`import './effect.js';\n${source}`,
		source.replace('@{', '@{ sideEffect();'),
		source.replace('props.title as string', 'format(props.title) as string'),
		source.replace('props.title as string', 'props["title"] as string'),
		source.replace('props.title as string', 'props.title.toUpperCase() as string'),
		source.replace('<h1>', '<h1 onClick={props.click}>'),
		source.replace('<h1>', '<h1 ref={props.ref}>'),
		source.replace('<h1>', '<h1 {...props}>'),
		source.replace('<h1>', '<h1 autoFocus>'),
		source.replace('<h1>', '<h1>literal'),
		source.replace('<h1>', '<span> </span><h1>'),
		source.replace('<h1>', '<span>\n </span><h1>'),
		source.replace('<h1>', '<h1 data-octane-bindings="forged">'),
		source.replace('<h1>', '<Widget>'),
		source.replace('title: string;', 'title: object;'),
		source.replace('props.title as string', 'props.title as unknown as string'),
		source.replace('@{', "@{ 'use dom bindings';"),
		source
			.replace('<p id="automatic-history">', '@if (props.title) { <p id="automatic-history">')
			.replace(
				'</p>\n\t\t<p id="automatic-interactions">',
				'</p> }\n\t\t<p id="automatic-interactions">',
			),
	];
	for (const [index, example] of examples.entries())
		assert.equal(analyze(example, file), null, `unsupported example ${index}`);
});

test('unsupported source emits the normal renderer entry rather than a binding adapter', async () => {
	const changed = source.replace('@{', '@{ const observed = props.title;');
	const report = await build('bindings', undefined, { sourceOverride: changed });
	assert.equal(report.selected, 'renderer');
	assert.equal(report.proof, null);
	const modules = Object.keys(report.outputs['behavior.js'].modules);
	assert.ok(modules.some((item) => item.endsWith('/packages/octane/src/runtime.ts')));
	assert.ok(!modules.some((item) => item.includes('?octane-bindings=')));
});
