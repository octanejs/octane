import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const HERE = import.meta.dirname;
export const SOURCE_ROOT = process.env.OCTANE_TSRX_VITE_PREFLIGHT_ROOT
	? path.resolve(process.env.OCTANE_TSRX_VITE_PREFLIGHT_ROOT)
	: path.resolve(HERE, '../..');
const OCTANE_ROOT = path.join(SOURCE_ROOT, 'packages/octane');
const octaneRequire = createRequire(path.join(OCTANE_ROOT, 'package.json'));

const { octane } = await import(pathToFileURL(path.join(OCTANE_ROOT, 'src/compiler/vite.js')).href);
const { findDescriptorChildrenExports, findDescriptorChildrenImports, findVoidComponentImports } =
	await import(pathToFileURL(path.join(OCTANE_ROOT, 'src/compiler/bundler.js')).href);
const { findStaticRuntimeImportRequests } = await import(
	pathToFileURL(path.join(OCTANE_ROOT, 'src/compiler/client-only-server.js')).href
);
const { findCssModuleImportRequests } = await import(
	pathToFileURL(path.join(OCTANE_ROOT, 'src/compiler/css-module-imports.js')).href
);
const { parseModule } = await import(pathToFileURL(octaneRequire.resolve('@tsrx/core')).href);

const VOID_META = 'octane:void-component-exports';
const DESCRIPTOR_META = 'octane:descriptor-children-exports';
const CSS_SOURCE = `export const root = 'preflight_root';
export default { root };`;
const SEMANTIC_MANIFEST = JSON.parse(
	readFileSync(new URL('./semantic-manifest.json', import.meta.url), 'utf8'),
);

export const EXPECTED_CLASSIFICATION_CHECKSUM = SEMANTIC_MANIFEST.classificationChecksum;

function digest(value) {
	return createHash('sha256').update(value).digest('hex');
}

function stableJson(value) {
	return JSON.stringify(value, (_key, item) => {
		if (item instanceof Map) return [...item].sort(([left], [right]) => left.localeCompare(right));
		if (item instanceof Set) return [...item].sort();
		if (item === null || Array.isArray(item) || typeof item !== 'object') return item;
		return Object.fromEntries(
			Object.entries(item).sort(([left], [right]) => left.localeCompare(right)),
		);
	});
}

function valueDigest(value) {
	return digest(stableJson(value));
}

function orderedCandidates(values) {
	return values.toSorted((left, right) => stableJson(left).localeCompare(stableJson(right)));
}

export function sourceFor(componentCount, css = false) {
	const imports = [
		`import { descriptorChildren } from 'octane';`,
		`import VoidLeaf from './void-leaf.tsrx';`,
		`import { SlotLeaf } from './descriptor-leaf.tsrx';`,
	];
	if (css) imports.push(`import { root as cssRoot } from './fixture.module.css';`);
	const components = Array.from({ length: componentCount }, (_, index) => {
		const classAttribute = css ? ' class={cssRoot}' : '';
		return `export function Component${index}() @{
	<article${classAttribute} data-index="${index}">
		<VoidLeaf />
		<SlotLeaf><span>component ${index}</span></SlotLeaf>
	</article>
}`;
	}).join('\n\n');
	return `${imports.join('\n')}

function LocalSlot(props) { return props.children; }
export const MarkedSlot = descriptorChildren(LocalSlot);

${components}
`;
}

export function rootIdsFor(id) {
	return [id, `/${path.relative(SOURCE_ROOT, id).split(path.sep).join('/')}`];
}

function classification(source, id) {
	return {
		cssImports: findCssModuleImportRequests(source, id),
		descriptorExports: findDescriptorChildrenExports(source, id).sort(),
		descriptorImports: orderedCandidates(findDescriptorChildrenImports(source, id)),
		runtimeImports: findStaticRuntimeImportRequests(source, id).sort(),
		voidImports: orderedCandidates(findVoidComponentImports(source, id)),
	};
}

export function descriptorClassificationFromStrings(source, id) {
	return {
		exports: findDescriptorChildrenExports(source, id).sort(),
		imports: orderedCandidates(findDescriptorChildrenImports(source, id)),
	};
}

export function descriptorClassificationFromSharedAst(source, id) {
	const ast = parseModule(source, id);
	return {
		exports: findDescriptorChildrenExports(ast, id).sort(),
		imports: orderedCandidates(findDescriptorChildrenImports(ast, id)),
	};
}

function configurePlugin(mode) {
	const dev = mode === 'dev-client';
	const server = mode === 'production-server';
	const plugin = octane({ hmr: dev });
	const command = dev ? 'serve' : 'build';
	plugin.config({ root: SOURCE_ROOT }, { command, mode: 'production' });
	plugin.configResolved({
		root: SOURCE_ROOT,
		command,
		build: { ssr: server, watch: null },
		define: {},
		logger: { warn() {} },
	});
	return { plugin, server };
}

function fixtureModules(id) {
	const directory = path.dirname(id);
	const voidId = path.join(directory, 'void-leaf.tsrx');
	const descriptorId = path.join(directory, 'descriptor-leaf.tsrx');
	const cssId = path.join(directory, 'fixture.module.css');
	const voidCode = `export default function VoidLeaf() @{ <i>void</i> }`;
	return new Map([
		[
			voidId,
			{
				id: voidId,
				code: voidCode,
				meta: {
					[VOID_META]: {
						exports: ['default'],
						fingerprint: createHash('sha256').update(voidCode).digest('base64url'),
					},
				},
			},
		],
		[
			descriptorId,
			{
				id: descriptorId,
				code: `export function SlotLeaf(props) { return props.children; }`,
				meta: { [DESCRIPTOR_META]: { exports: ['SlotLeaf'] } },
			},
		],
		[cssId, { id: cssId, code: CSS_SOURCE, meta: {} }],
	]);
}

function contextFor(id) {
	const modules = fixtureModules(id);
	const watched = new Set();
	const requests = new Map([
		['./void-leaf.tsrx', path.join(path.dirname(id), 'void-leaf.tsrx')],
		['./descriptor-leaf.tsrx', path.join(path.dirname(id), 'descriptor-leaf.tsrx')],
		['./fixture.module.css', path.join(path.dirname(id), 'fixture.module.css')],
	]);
	return {
		watched,
		context: {
			addWatchFile(file) {
				watched.add(file);
			},
			async resolve(request) {
				const resolved = requests.get(request);
				if (resolved !== undefined) return { id: resolved };
				return { id: request, external: true };
			},
			async load(request) {
				const requestedId = typeof request === 'string' ? request : request.id;
				return modules.get(requestedId) ?? null;
			},
			getModuleInfo(requestedId) {
				return modules.get(requestedId) ?? null;
			},
		},
	};
}

function semanticSnapshot(result, watched, classificationChecksum) {
	return {
		classificationChecksum,
		dependencyChecksum: valueDigest([...watched].sort()),
		mapChecksum: valueDigest(result?.map ?? null),
		metaChecksum: valueDigest(result?.meta ?? null),
		outputChecksum: digest(result?.code ?? ''),
	};
}

export function createTransformCase({
	componentCount,
	css = false,
	mode,
	source: sourceOverride,
	verifySemantic = true,
}) {
	const name = `${mode}-${css ? 'css-' : ''}${componentCount}`;
	const id = path.join(HERE, 'generated', `${name}.tsrx`);
	const source = sourceOverride ?? sourceFor(componentCount, css);
	const classificationValue = classification(source, id);
	const classificationChecksum = valueDigest(classificationValue);
	const { plugin, server } = configurePlugin(mode);
	const expectedSnapshot = SEMANTIC_MANIFEST.integrated[name];
	if (verifySemantic && expectedSnapshot === undefined) {
		throw new Error(`Missing semantic manifest entry for ${name}`);
	}

	return {
		name,
		id,
		source,
		componentCount,
		css,
		mode,
		classification: classificationValue,
		classificationChecksum,
		async run() {
			const { context, watched } = contextFor(id);
			const started = performance.now();
			const result = await plugin.transform.call(context, source, id, { ssr: server });
			const elapsed = performance.now() - started;
			if (result === null || result === undefined) {
				throw new Error(`${name} unexpectedly passed through without output`);
			}
			const snapshot = semanticSnapshot(result, watched, classificationChecksum);
			if (verifySemantic && stableJson(snapshot) !== stableJson(expectedSnapshot)) {
				throw new Error(`${name} changed its committed semantic snapshot`);
			}
			return { elapsed, snapshot };
		},
	};
}

export { stableJson, valueDigest };
