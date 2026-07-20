/**
 * Pipeline-shape tests for `@octanejs/mdx/compile` — the source-to-source
 * contract: @mdx-js/mdx (jsx: true) → recmaOctaneAdapter → octane/compiler.
 */
import { describe, it, expect } from 'vitest';
import { compileMdx, compileMdxSync, defaultRemarkPlugins } from '@octanejs/mdx/compile';

type TreeNode = Record<string, unknown>;

function walkTree(tree: unknown, callback: (node: TreeNode) => void): void {
	const seen = new WeakSet<object>();
	function visit(value: unknown): void {
		if (value === null || typeof value !== 'object' || seen.has(value)) return;
		seen.add(value);
		const node = value as TreeNode;
		callback(node);
		for (const [key, child] of Object.entries(node)) {
			if (key === 'position' || key === 'loc' || key === 'range') continue;
			if (Array.isArray(child)) child.forEach(visit);
			else visit(child);
		}
	}
	visit(tree);
}

function stripTreeSourceLocations() {
	return (tree: unknown) =>
		walkTree(tree, (node) => {
			delete node.position;
			delete node.loc;
			delete node.start;
			delete node.end;
			delete node.range;
		});
}

function copyLaterOnChangeOntoFirstInput(copy: 'shallow' | 'shared') {
	return (tree: unknown) => {
		const inputs: TreeNode[] = [];
		walkTree(tree, (node) => {
			if (
				node.type === 'JSXOpeningElement' &&
				(node.name as { type?: string; name?: string } | undefined)?.type === 'JSXIdentifier' &&
				(node.name as { name?: string }).name === 'input' &&
				Array.isArray(node.attributes)
			) {
				inputs.push(node);
			}
		});
		const sourceAttribute = (inputs[1]?.attributes as unknown[] | undefined)?.find(
			(attribute) => (attribute as { name?: { name?: string } }).name?.name === 'onChange',
		) as TreeNode | undefined;
		if (sourceAttribute && Array.isArray(inputs[0]?.attributes)) {
			inputs[0].attributes.push(copy === 'shallow' ? { ...sourceAttribute } : sourceAttribute);
		}
	};
}

function renameFieldToInput() {
	return (tree: unknown) =>
		walkTree(tree, (node) => {
			if (
				node.type === 'JSXOpeningElement' &&
				(node.name as { type?: string; name?: string } | undefined)?.type === 'JSXIdentifier' &&
				(node.name as { name?: string }).name === 'Field'
			) {
				(node.name as { name: string }).name = 'input';
			}
		});
}

function registerLateFieldRename(this: { use(plugin: typeof renameFieldToInput): void }) {
	this.use(renameFieldToInput);
}

function removeOnInputFromInput() {
	return (tree: unknown) =>
		walkTree(tree, (node) => {
			if (
				node.type === 'JSXOpeningElement' &&
				(node.name as { name?: string } | undefined)?.name === 'input' &&
				Array.isArray(node.attributes)
			) {
				node.attributes = node.attributes.filter(
					(attribute) => (attribute as { name?: { name?: string } }).name?.name !== 'onInput',
				);
			}
		});
}

function moveInputFromSvgToDiv() {
	return (tree: unknown) => {
		let svg: TreeNode | undefined;
		let div: TreeNode | undefined;
		walkTree(tree, (node) => {
			if (node.type !== 'JSXElement') return;
			const name = (node.openingElement as { name?: { name?: string } } | undefined)?.name?.name;
			if (name === 'svg') svg = node;
			if (name === 'div') div = node;
		});
		if (!Array.isArray(svg?.children) || !Array.isArray(div?.children)) return;
		const inputIndex = svg.children.findIndex(
			(child) =>
				(child as { openingElement?: { name?: { name?: string } } }).openingElement?.name?.name ===
				'input',
		);
		if (inputIndex === -1) return;
		const [input] = svg.children.splice(inputIndex, 1);
		div.children.push(input);
	};
}

function addGeneratedComponentMapSpread(binding: '_components' | 'MDXLayout') {
	return () => (tree: unknown) =>
		walkTree(tree, (node) => {
			if (node.type !== 'VariableDeclarator') return;
			const id = node.id as
				| { type?: string; name?: string; properties?: Array<{ value?: { name?: string } }> }
				| undefined;
			const matches =
				binding === '_components'
					? id?.type === 'Identifier' && id.name === binding
					: id?.type === 'ObjectPattern' &&
						id.properties?.some((property) => property.value?.name === binding);
			const init = node.init as { type?: string; properties?: unknown[] } | undefined;
			if (!matches || init?.type !== 'ObjectExpression' || !Array.isArray(init.properties)) return;
			init.properties.push({
				type: 'SpreadElement',
				argument: { type: 'Identifier', name: 'recmaInjectedComponents' },
			});
		});
}

describe('compileMdxSync', () => {
	it('emits a compiled octane CLIENT module (no JSX, no MDX runtime)', () => {
		const { code } = compileMdxSync('# hi\n\nsome *text*\n', '/docs/doc.mdx');
		expect(code).toContain("from 'octane'");
		expect(code).not.toContain('@mdx-js');
		// The JSX was fully lowered by octane's compiler.
		expect(code).not.toMatch(/<_components/);
		expect(code).toContain('export default');
	});

	it('mounts the MDX body through the component machinery in both branches', () => {
		const { code } = compileMdxSync('# hi\n', '/docs/doc.mdx');
		// The no-layout branch mounts through the component machinery (the bare
		// `_createMdxContent(props)` call was rewritten to JSX and lowered to a
		// descriptor — `<_createMdxContent/>` is a component REFERENCE per JSX
		// semantics) — no direct call that would bypass the
		// `(props, __s, __extra)` ABI.
		expect(code).toContain('_$createElement(_createMdxContent');
		// …and the emitted ternary-else direct-call shape is gone.
		expect(code).not.toContain(': _createMdxContent(');
	});

	it('adds document-level profiling only to client output', () => {
		const { code } = compileMdxSync('# hi\n', '/docs/doc.mdx', {
			hmr: true,
			profile: true,
		});
		const hmrWrapper = code.lastIndexOf('MDXContent =');
		const documentIdentity = code.lastIndexOf('/docs/doc.mdx#MDXContent@1:0');

		expect(hmrWrapper).toBeGreaterThan(-1);
		expect(documentIdentity).toBeGreaterThan(hmrWrapper);
		expect(code).toContain("from 'octane/profiling'");

		const server = compileMdxSync('# hi\n', '/docs/doc.mdx', {
			mode: 'server',
			profile: true,
		});
		expect(server.code).not.toContain('octane/profiling');
		expect(server.code).not.toContain('/docs/doc.mdx#MDXContent@1:0');
	});

	it('keeps explicit profile:false output and maps byte-identical', () => {
		const normal = compileMdxSync('# hi\n', '/docs/doc.mdx');
		const explicitOff = compileMdxSync('# hi\n', '/docs/doc.mdx', { profile: false });
		expect(explicitOff).toEqual(normal);
	});

	it('preserves permissive output and forwards the causal state model to client and server', () => {
		const implicit = compileMdxSync('# hi\n', '/docs/doc.mdx');
		const permissive = compileMdxSync('# hi\n', '/docs/doc.mdx', {
			stateModel: 'permissive',
		});
		const causal = compileMdxSync('# hi\n', '/docs/doc.mdx', { stateModel: 'causal' });
		const serverCausal = compileMdxSync('# hi\n', '/docs/doc.mdx', {
			mode: 'server',
			stateModel: 'causal',
		});

		expect(permissive).toEqual(implicit);
		expect(causal.code).toContain('markStateModel');
		expect(serverCausal.code).toContain('markStateModel');
		expect(causal.code).not.toEqual(implicit.code);
	});

	it('accepts generated provider components and provider-less component maps in causal documents', () => {
		const named = compileMdxSync('<Thing />\n', '/docs/named.mdx', {
			stateModel: 'causal',
		});
		const providerLess = compileMdxSync('# hi\n', '/docs/provider-less.mdx', {
			stateModel: 'causal',
			providerImportSource: null,
		});

		expect(named.code).toContain('markStateModel');
		expect(providerLess.code).toContain('markStateModel');
	});

	it('does not trust generated component bindings after recma changes their origins', () => {
		for (const binding of ['_components', 'MDXLayout'] as const) {
			expect(() =>
				compileMdxSync('# hi\n', `/docs/changed-${binding}.mdx`, {
					stateModel: 'causal',
					recmaPlugins: [addGeneratedComponentMapSpread(binding)],
				}),
			).toThrow(expect.objectContaining({ code: 'OCTANE_CAUSAL_COMPONENT_ALIAS_UNRESOLVED' }));
		}
	});

	it('maps report-only causal diagnostics and their writer declarations to authored MDX', () => {
		const source = `import { useEffect, useState } from 'octane'

export function Report() {
  const [, setCount] = useState(0)
  useEffect(() => setCount(1), [])
  return <span />
}

<Report />
`;
		const result = compileMdxSync(source, '/docs/report.mdx', { stateModel: 'causal' });

		expect(result.diagnostics).toEqual([
			expect.objectContaining({
				code: 'OCTANE_CAUSAL_STATE_EFFECT_WRITE',
				severity: 'warning',
				phase: 'effect',
				reportOnly: true,
				filename: '/docs/report.mdx',
				start: expect.objectContaining({ line: 5 }),
				declaration: expect.objectContaining({
					hook: 'useState',
					name: 'setCount',
					start: expect.objectContaining({ line: 4 }),
				}),
				suggestions: [],
			}),
		]);
	});

	it('maps causal-state compile errors back to authored MDX ESM', () => {
		const source = `import { useState } from 'octane'

export function Bad() {
  const [, setCount] = useState(0)
  setCount(1)
  return <span />
}

<Bad />
`;
		try {
			compileMdxSync(source, '/docs/bad.mdx', { stateModel: 'causal' });
			expect.unreachable('expected the causal state model to reject the render write');
		} catch (error) {
			const causal = error as {
				message: string;
				diagnostics: Array<{
					code: string;
					filename: string;
					start: { line: number; column: number };
				}>;
			};
			expect(causal.diagnostics[0]).toMatchObject({
				code: 'OCTANE_CAUSAL_STATE_RENDER_WRITE',
				filename: '/docs/bad.mdx',
				start: { line: 5, column: 2 },
			});
			expect(causal.message).toContain('/docs/bad.mdx:5:3');
		}
	});

	it('emits SERVER codegen with mode: server', () => {
		const { code } = compileMdxSync('# hi\n', '/docs/doc.mdx', { mode: 'server' });
		expect(code).toContain("from 'octane/server'");
	});

	it('wires providerImportSource to @octanejs/mdx by default; null disables it', () => {
		const { code } = compileMdxSync('# hi\n', '/docs/doc.mdx');
		expect(code).toContain('@octanejs/mdx');
		const { code: bare } = compileMdxSync('# hi\n', '/docs/doc.mdx', {
			providerImportSource: null,
		});
		expect(bare).not.toContain('@octanejs/mdx');
	});

	it('detects plain-markdown format from the .md extension', () => {
		// `{x}` / `<Foo/>` are literal text in md format — as source they would be
		// an expression + a JSX tag and compile very differently (or throw for the
		// undefined `x`).
		const { code } = compileMdxSync('*hi* `{x}` and text {x}\n', '/docs/doc.md');
		expect(code).toContain('{x}');
	});

	it('exposes the default remark plugin set for extension', () => {
		expect(defaultRemarkPlugins).toHaveLength(3);
	});

	it('returns native-event warnings at the authored MDX JSX range', () => {
		const source = '# Form\n\n<input onChangeCapture={() => {}} />\n';
		const result = compileMdxSync(source, '/docs/form.mdx');
		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			code: 'OCTANE_NATIVE_TEXT_ONCHANGE',
			severity: 'warning',
			filename: '/docs/form.mdx',
			start: {
				offset: source.indexOf('onChangeCapture'),
				line: 3,
				column: 7,
			},
			suggestions: [
				{
					attribute: 'onInputCapture',
					start: { offset: source.indexOf('onChangeCapture'), line: 3, column: 7 },
				},
			],
		});
		expect(result.diagnostics[0].end.offset).toBe(
			source.indexOf('onChangeCapture') + 'onChangeCapture'.length,
		);
	});

	it('maps after namespaced attributes and bigint expressions', () => {
		const source = [
			'<svg xml:lang="en" />',
			'<input data-value={1n} onChange={() => {}} />',
			'',
		].join('\n');
		const result = compileMdxSync(source, '/docs/form.mdx');
		const onChange = source.indexOf('onChange');

		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			start: { offset: onChange, line: 2, column: 23 },
			suggestions: [{ start: { offset: onChange }, attribute: 'onInput' }],
		});
	});

	it('maps every native-event fix to its independently authored attribute', () => {
		const source = '<input onChange={() => {}} onChangeCapture={() => {}} />\n';
		const result = compileMdxSync(source, '/docs/form.mdx', {
			recmaPlugins: [stripTreeSourceLocations],
		});
		const onChange = source.indexOf('onChange');
		const onChangeCapture = source.indexOf('onChangeCapture');

		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0].suggestions).toMatchObject([
			{
				attribute: 'onInput',
				start: { offset: onChange, line: 1, column: onChange },
				end: { offset: onChange + 'onChange'.length },
			},
			{
				attribute: 'onInputCapture',
				start: { offset: onChangeCapture, line: 1, column: onChangeCapture },
				end: { offset: onChangeCapture + 'onChangeCapture'.length },
			},
		]);
	});

	it('restores exact JSX ranges after recma plugins remove locations', () => {
		const source = [
			'Mention onChange and onChangeCapture in prose first.',
			'',
			'<input onChange={() => {}} onInput={() => {}} />',
			'<textarea onChangeCapture={() => {}} onInputCapture={() => {}} />',
			'<input title="onChange" data-order={left < right} onChange={() => {}} />',
			'<input onChange={() => {}} />',
			'<textarea onChangeCapture={() => {}} />',
			'',
		].join('\n');
		const result = compileMdxSync(source, '/docs/form.mdx', {
			recmaPlugins: [stripTreeSourceLocations],
		});
		const safeInput = source.indexOf('<input');
		const firstInput = source.indexOf('<input', safeInput + 1);
		const secondInput = source.indexOf('<input', firstInput + 1);
		const firstHost = source.indexOf('onChange={()', firstInput);
		const secondHost = source.indexOf('onChange', secondInput);
		const safeCapture = source.indexOf('onChangeCapture', source.indexOf('<textarea'));
		const captureHost = source.indexOf('onChangeCapture', safeCapture + 1);

		expect(result.diagnostics.map((diagnostic) => diagnostic.start.offset)).toEqual([
			firstHost,
			secondHost,
			captureHost,
		]);
		expect(result.diagnostics.map((diagnostic) => diagnostic.suggestions[0].start.offset)).toEqual([
			firstHost,
			secondHost,
			captureHost,
		]);
		expect(result.diagnostics.map((diagnostic) => diagnostic.suggestions[0].attribute)).toEqual([
			'onInput',
			'onInput',
			'onInputCapture',
		]);
	});

	it('uses a safe file-level warning when remark plugins remove authored locations', () => {
		const source = 'Mention onChange first.\n\n<input onChange={() => {}} />\n';
		const result = compileMdxSync(source, '/docs/form.mdx', {
			remarkPlugins: [stripTreeSourceLocations],
			recmaPlugins: [stripTreeSourceLocations],
		});

		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			start: { offset: 0, line: 1, column: 0 },
			end: { offset: 0, line: 1, column: 0 },
			suggestions: [],
		});
	});

	it('does not attach shallow-cloned JSX attributes to authored source', () => {
		const source = [
			'Mention onChange first.',
			'',
			'<input />',
			'<input onChange={() => {}} onInput={() => {}} />',
			'',
		].join('\n');
		const result = compileMdxSync(source, '/docs/form.mdx', {
			recmaPlugins: [() => copyLaterOnChangeOntoFirstInput('shallow')],
		});

		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			start: { offset: 0, line: 1, column: 0 },
			end: { offset: 0, line: 1, column: 0 },
			suggestions: [],
		});
	});

	it('does not attach multiply-owned JSX attributes to authored source', () => {
		const source = [
			'Mention onChange first.',
			'',
			'<input />',
			'<input onChange={() => {}} onInput={() => {}} />',
			'',
		].join('\n');
		const result = compileMdxSync(source, '/docs/form.mdx', {
			recmaPlugins: [() => copyLaterOnChangeOntoFirstInput('shared')],
		});

		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			start: { offset: 0, line: 1, column: 0 },
			end: { offset: 0, line: 1, column: 0 },
			suggestions: [],
		});
	});

	it('does not attach transformed host diagnostics to component callbacks', () => {
		const source = 'Mention onChange first.\n\n<Field onChange={() => {}} />\n';
		const result = compileMdxSync(source, '/docs/form.mdx', {
			recmaPlugins: [renameFieldToInput],
		});

		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			start: { offset: 0, line: 1, column: 0 },
			end: { offset: 0, line: 1, column: 0 },
			suggestions: [],
		});
	});

	it('does not attach diagnostics from dynamically registered recma transforms', () => {
		const source = 'Mention onChange first.\n\n<Field onChange={() => {}} />\n';
		const result = compileMdxSync(source, '/docs/form.mdx', {
			recmaPlugins: [registerLateFieldRename],
		});

		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			start: { offset: 0, line: 1, column: 0 },
			end: { offset: 0, line: 1, column: 0 },
			suggestions: [],
		});
	});

	it('does not attach diagnostics created by changing an authored host shape', () => {
		const source = '<input onChange={() => {}} onInput={() => {}} />\n';
		const result = compileMdxSync(source, '/docs/form.mdx', {
			recmaPlugins: [removeOnInputFromInput],
		});

		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			start: { offset: 0, line: 1, column: 0 },
			end: { offset: 0, line: 1, column: 0 },
			suggestions: [],
		});
	});

	it('does not attach diagnostics created by moving a host across namespaces', () => {
		const source = ['<svg><input onChange={() => {}} /></svg>', '<div></div>', ''].join('\n');
		const result = compileMdxSync(source, '/docs/form.mdx', {
			recmaPlugins: [moveInputFromSvgToDiv],
		});

		expect(result.diagnostics).toHaveLength(1);
		expect(result.diagnostics[0]).toMatchObject({
			start: { offset: 0, line: 1, column: 0 },
			end: { offset: 0, line: 1, column: 0 },
			suggestions: [],
		});
	});
});

describe('compileMdx (async)', () => {
	it('matches the sync output', async () => {
		const source = '# hi\n\n- a\n- b\n';
		const sync = compileMdxSync(source, '/docs/doc.mdx');
		const async_ = await compileMdx(source, '/docs/doc.mdx');
		expect(async_.code).toBe(sync.code);
	});
});
