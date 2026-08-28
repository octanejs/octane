import {
	compile,
	VALDI_COMPILER_ABI_VERSION,
	type CompileOptions,
	type CompileRenderer,
	type CompileResult,
	type ValdiWriterFacts,
} from 'octane/compiler';
import { octane, type OctaneVitePluginOptions } from 'octane/compiler/vite';

export const abi: number = VALDI_COMPILER_ABI_VERSION;
export const renderer = {
	id: 'valdi',
	module: '@example/valdi-adapter',
	target: 'valdi',
	server: 'unsupported',
	text: 'reject',
} satisfies CompileRenderer;
export const facts = {
	version: 1,
	expressions: [{ start: 0, end: 1, effectiveType: 'number', isNullable: false }],
} satisfies ValdiWriterFacts;
export const compileOptions = {
	hmr: false,
	renderer,
	rendererRegistry: { valdi: renderer },
	valdiWriterFacts: facts,
} satisfies CompileOptions;
export const compiled: CompileResult = compile('', 'src/Scene.tsrx', compileOptions);

export const viteOptions = {
	hmr: false,
	renderers: {
		registry: {
			valdi: {
				module: '@example/valdi-adapter',
				target: 'valdi',
				server: 'unsupported',
				text: 'reject',
			},
		},
		rules: [{ include: 'src/**/*.valdi.tsrx', renderer: 'valdi' }],
	},
} satisfies OctaneVitePluginOptions;
octane(viteOptions);

// @ts-expect-error — renderer targets are a closed public union.
compile('', 'src/Scene.tsrx', { renderer: { ...renderer, target: 'native' } });
// @ts-expect-error — facts describe expressions, not a type-checker instance.
compile('', 'src/Scene.tsrx', { valdiWriterFacts: 'number' });
// @ts-expect-error — the fact schema is versioned.
const invalidFacts: ValdiWriterFacts = { version: 2, expressions: [] };
const invalidKind: ValdiWriterFacts = {
	version: 1,
	// @ts-expect-error — only supported writer kinds can be asserted.
	expressions: [{ start: 0, end: 1, effectiveType: 'object', isNullable: false }],
};
