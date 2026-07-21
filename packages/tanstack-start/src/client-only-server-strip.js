import { compileToVolarMappings } from 'octane/compiler/volar';
import { START_ENVIRONMENT_NAMES } from '#tanstack-start/plugin-core/vite';

/**
 * Octane counterpart of the start-compiler's `handleClientOnlyJSX` babel pass:
 * on the SERVER environment, `<ClientOnly>` children are removed at compile
 * time (only the `fallback` prop may render during SSR). The upstream pass
 * operates on React JSX via babel; octane's `.tsrx` compiles its JSX away
 * before any babel-based pass could see it, so this plugin performs the strip
 * on the `.tsrx` SOURCE — replacing the children span with a `{null}` hole —
 * before `octane/compiler/vite` runs.
 *
 * Removing the children (rather than relying on the runtime `ClientOnly`,
 * which already renders nothing during SSR) matters for the STATIC graph:
 * client-only subtrees routinely reference `*.client.*` modules, and Start's
 * import-protection verifies after tree-shaking that no denied module stays
 * reachable from the server bundle. With the children intact, the octane
 * server build retained those edges and failed the build where the react
 * build passes.
 */
export function octaneClientOnlyServerStrip() {
	return {
		name: 'octanejs-tanstack-start:client-only-server-strip',
		enforce: 'pre',
		applyToEnvironment(environment) {
			return environment.name === START_ENVIRONMENT_NAMES.server;
		},
		transform: {
			filter: {
				id: { include: [/\.tsrx($|\?)/] },
				code: { include: ['ClientOnly'] },
			},
			handler(code, id) {
				if (!code.includes('<ClientOnly')) return undefined;

				const { sourceAst } = compileToVolarMappings(code, id.split('?')[0]);
				const spans = [];
				const seen = new Set();
				const elementName = (node) => node.openingElement?.name?.name ?? node.id?.name;
				const visit = (value) => {
					if (!value || typeof value !== 'object' || seen.has(value)) return;
					seen.add(value);
					if (Array.isArray(value)) {
						for (const item of value) visit(item);
						return;
					}
					const children = value.children;
					if (
						elementName(value) === 'ClientOnly' &&
						Array.isArray(children) &&
						children.length > 0
					) {
						const start = children[0].start;
						const end = children[children.length - 1].end;
						if (typeof start === 'number' && typeof end === 'number' && end > start) {
							spans.push([start, end]);
						}
					}
					for (const key in value) {
						if (key !== 'metadata' && key !== 'loc') visit(value[key]);
					}
				};
				visit(sourceAst);
				if (spans.length === 0) return undefined;

				// Replace back-to-front so earlier spans keep their offsets.
				spans.sort((a, b) => b[0] - a[0]);
				let out = code;
				for (const [start, end] of spans) {
					out = `${out.slice(0, start)}{null}${out.slice(end)}`;
				}
				return { code: out, map: null };
			},
		},
	};
}
