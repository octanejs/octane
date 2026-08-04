# `@octanejs/docusaurus`

The headless Docusaurus content and MDX bridge for Octane.

Docusaurus has a useful boundary before React: its Node-side config, presets,
and plugins load content, create data modules, and emit a serializable route
tree. This package adopts that graph, normalizes it into a renderer-neutral
manifest, resolves Docusaurus module aliases for Vite, and compiles
Docusaurus-shaped MDX exports into real Octane components.

It does **not** run React themes or React-authored swizzles unchanged. Octane is
compiler-first; the renderer and theme layers must be authored for Octane.

## Version contract

The headless loader is intentionally pinned to `@docusaurus/core@3.10.1`.
Docusaurus does not publish the `server/site` loader as a stable public entry,
so accepting an untested minor would turn an internal upstream refactor into a
silent route-data corruption. The loader checks both the package version and
Docusaurus's Node `>=20.0` runtime requirement before importing that seam. This
package retains Octane's repository-wide Node `>=22.22.2` baseline.

`allowUnsupportedVersion: true` is available only for explicit compatibility
experiments.

## Inspect the headless site graph

```js
import {
	createDocusaurusManifest,
	loadDocusaurusSite,
} from '@octanejs/docusaurus';

const loaded = await loadDocusaurusSite({ siteDir: process.cwd() });
const manifest = await createDocusaurusManifest(loaded);
```

The manifest contains:

- nested routes with `component`, `modules`, `props`, and plugin context;
- generated global data and per-document metadata;
- serializable site config, locale/document attributes, and plugin HTML tags;
- client modules discovered through the Docusaurus plugin lifecycle;
- `@site`, `@generated`, `~docs`, `@theme`, `@theme-original`, and
  `@theme-init` resolution;
- the exact Docusaurus version and route-path inventory.

The CLI exposes the same boundary:

```bash
octane-docusaurus inspect --site-dir . --out .octane-docusaurus/manifest.json
octane-docusaurus clear --site-dir .
```

## Vite

```ts
import { defineConfig } from 'vite';
import { octane } from 'octane/compiler/vite';
import { docusaurus } from '@octanejs/docusaurus/vite';

export default defineConfig({
	plugins: [...docusaurus(), octane()],
});
```

The bridge publishes `virtual:octane-docusaurus-manifest` and resolves
Docusaurus aliases. Its MDX plugin chooses Octane client/server compilation per
Vite environment and injects metadata discovered by the content plugins. The
route virtual module also imports plugin client modules, so theme CSS and other
side-effect assets participate in the client and SSR build graphs.

## Octane classic theme

Add the first-party Octane theme beside the content plugins in
`docusaurus.config.mjs`:

```js
import octaneClassicTheme from '@octanejs/docusaurus/theme';

export default {
	title: 'My documentation',
	url: 'https://docs.example.com',
	baseUrl: '/',
	themes: [octaneClassicTheme],
	plugins: ['@docusaurus/plugin-content-docs'],
};
```

The theme supplies Octane-native `DocsRoot`, `DocVersionRoot`, `DocRoot`,
`DocItem`, category-index, and tag-page route modules. Its initial classic shell
renders configured navbar/footer links, recursive documentation sidebars,
document metadata, canonical links, previous/next navigation, and responsive
CSS. React-authored theme modules and swizzles still need Octane equivalents.

## Client routing

The route virtual module turns every component, content module, generated data
module, and route-context module into a static dynamic import. Only the matched
branch loads in the browser:

```ts
import { createDocusaurusBrowserRouter } from '@octanejs/docusaurus/client';
import {
	manifest,
	routeModules,
} from 'virtual:octane-docusaurus-routes';

export const router = createDocusaurusBrowserRouter(manifest, routeModules);
```

Render it from an Octane component:

```tsx
import { DocusaurusRouterProvider } from '@octanejs/docusaurus/client';
import { manifest } from 'virtual:octane-docusaurus-routes';
import { router } from './router';

export function App() @{
	<DocusaurusRouterProvider manifest={manifest} router={router} />
}
```

Nested Docusaurus routes render through `children`; route components also
receive loaded `modules`, static `props`, `route`, `location`, `params`, and
`navigate`. `useDocusaurusRouteContext()` exposes the inherited plugin identity
and merged route data. Use `Link` from `@octanejs/remix-router` for client-side
navigation.

## Static rendering and hydration

The server entry resolves the requested lazy route branch through Remix's
static handler, then prerenders fully resolved Octane markup. Use the route API
when a host owns the outer HTML, or the document API to compose Docusaurus
plugin tags, metadata, scoped CSS, build assets, and the hydration entry into a
complete page:

```ts
import { prerenderDocusaurusDocument } from '@octanejs/docusaurus/server';
import {
	manifest,
	routeModules,
} from 'virtual:octane-docusaurus-routes';

const rendered = await prerenderDocusaurusDocument(
	new Request('https://docs.example.com/guide/intro'),
	manifest,
	routeModules,
	{
		document: {
			assets: {
				stylesheets: ['assets/site.css'],
				modulePreloads: ['assets/intro.js'],
			},
			hydrate: 'assets/hydrate.js',
		},
	},
);

if (rendered instanceof Response) {
	return rendered;
}

const { html, bodyHtml, head, css, context } = rendered;
```

`html` is the complete `<!DOCTYPE html>` document. `bodyHtml` remains the
prerendered router root for integrations that need both forms. Relative asset
paths resolve against `manifest.baseUrl`; URL attributes are escaped, duplicate
asset entries are removed without reordering, and `nonce` from the render
options is carried onto module scripts. Docusaurus `injectHtmlTags` output is
trusted site configuration and retains upstream ordering around the
`#__docusaurus` root.

`prerenderDocusaurusRoute()` remains available and returns hoisted metadata in
`head` so an existing static-site host can place it in its own document head.
`context.statusCode`, `loaderHeaders`, and `actionHeaders` preserve the static
router result for the surrounding build or request handler. Generate a site by
calling this function for the paths in `manifest.routesPaths`; each render
imports only its matched route branch.

Hydrate the same root after the browser receives that markup:

```ts
import { hydrateDocusaurusRoot } from '@octanejs/docusaurus/hydrate';
import {
	manifest,
	routeModules,
} from 'virtual:octane-docusaurus-routes';

const container = document.getElementById('__docusaurus');
if (container === null) throw new Error('Missing Docusaurus root.');

const { root, router } = await hydrateDocusaurusRoot(
	container,
	manifest,
	routeModules,
);
```

Hydration capture starts before lazy imports, waits for the initial matched
branch, and then adopts the prerendered nodes. Dispose both returned owners when
the application is torn down with `root.unmount()` and `router.dispose()`.

## Docusaurus-aware MDX

```js
import { compileDocusaurusMdx } from '@octanejs/docusaurus/mdx';

const result = await compileDocusaurusMdx(source, '/docs/intro.mdx', {
	metadata: docMetadata,
	resolveMarkdownLink: ({ linkPathname }) =>
		linkPathname.startsWith('./') ? `/guide/${linkPathname.slice(2)}` : null,
});
```

Alongside the default document component, compiled modules export Docusaurus's
document shape:

- `frontMatter` (plus `@octanejs/mdx`'s existing `frontmatter`);
- `contentTitle`;
- `toc`;
- `metadata`;
- `assets`.

GitHub-compatible heading IDs (including explicit Docusaurus IDs), duplicate
slugs, first-title wrapping/removal, TOC bounds, and Markdown link/image
rewriting happen before Octane compilation. User remark/rehype/recma plugins
remain composable.

## Current scope

Phases 1–6 are implemented here: headless loading, manifest/Vite integration,
MDX compilation, lazy client routing, static route rendering, hydration,
document/asset orchestration, and the initial Octane classic documentation
theme. A complete `start`/`build` CLI workflow and broader classic-theme feature
parity remain later phases, so the CLI does not present those commands as
working yet.
