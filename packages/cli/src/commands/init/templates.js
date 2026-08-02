/**
 * The two supported ways to compile Octane.
 *
 * `spa` wires the compiler plugin only, which is all a client-rendered app
 * needs. `fullstack` wires the metaframework plugin, which adds routing,
 * streaming SSR, hydration, and the production build.
 */
export const MODES = {
	spa: {
		label: 'Client-only app',
		hint: "compiles .tsrx, keeps the bundler's standard HTML handling",
		dependencies: [],
	},
	fullstack: {
		label: 'Routing and SSR',
		hint: 'adds octane.config.ts, streaming SSR, hydration, production build',
		dependencies: [],
	},
};

/**
 * Which package supplies the Octane plugin, per bundler and mode.
 *
 * `init` only scaffolds a Vite project, but it also advises projects that
 * already have a bundler config, and naming the Vite plugin at an Rspack
 * project would wire the wrong plugin into the wrong bundler.
 */
const INTEGRATIONS = {
	vite: {
		spa: { specifier: 'octane/compiler/vite', packages: [] },
		fullstack: { specifier: '@octanejs/vite-plugin', packages: ['@octanejs/vite-plugin'] },
	},
	rspack: {
		spa: { specifier: 'octane/compiler/bundler', packages: [] },
		fullstack: { specifier: '@octanejs/rspack-plugin', packages: ['@octanejs/rspack-plugin'] },
	},
	rsbuild: {
		spa: { specifier: 'octane/compiler/bundler', packages: [] },
		fullstack: { specifier: '@octanejs/rsbuild-plugin', packages: ['@octanejs/rsbuild-plugin'] },
	},
	rspeedy: {
		spa: { specifier: 'octane/compiler/bundler', packages: [] },
		fullstack: { specifier: '@octanejs/rspeedy-plugin', packages: ['@octanejs/rspeedy-plugin'] },
	},
};

/**
 * @param {keyof typeof INTEGRATIONS | null} bundler defaults to vite, which is
 *   what `init` scaffolds when a project has no bundler config yet
 * @param {keyof typeof MODES} mode
 * @returns {{ specifier: string, dependencies: string[], devDependencies: string[] }}
 */
export function integrationFor(bundler, mode) {
	const target = INTEGRATIONS[bundler ?? 'vite'] ?? INTEGRATIONS.vite;
	return {
		specifier: target[mode].specifier,
		dependencies: ['octane', ...target[mode].packages],
		// TypeScript is absent from this list on purpose, but it does get
		// installed: naming it here would take the newest major, which `tsrx-tsc`
		// cannot start under, so it is installed afterwards at the range
		// @tsrx/typescript-plugin declares as its peer. Nothing in the toolchain
		// carries a compiler of its own. The bundler is only ours to install when
		// we are the ones creating its config.
		devDependencies: [
			'@tsrx/typescript-plugin',
			'@tsrx/prettier-plugin',
			'prettier',
			...(bundler === null ? ['vite'] : []),
		],
	};
}

/**
 * @param {keyof typeof MODES} mode
 * @returns {string}
 */
export const viteConfig = (mode) => `import { defineConfig } from "vite";
import { octane } from "${integrationFor('vite', mode).specifier}";

export default defineConfig({
  plugins: [octane()],
  build: { target: "esnext" },
});
`;

/**
 * The routes, each naming its export so a typo fails loudly instead of
 * rendering the wrong component. The health endpoint is a `ServerRoute`: it
 * returns a `Response` rather than a component, which is the other half of the
 * app layer and the piece that has no equivalent in the `spa` template.
 */
export const octaneConfig = `import { defineConfig, RenderRoute, ServerRoute } from "@octanejs/vite-plugin";
import { health } from "./src/server/health.ts";

export default defineConfig({
  router: {
    routes: [
      new RenderRoute({ path: "/", entry: ["App", "/src/App.tsrx"] }),
      new RenderRoute({ path: "/counter", entry: ["Counter", "/src/Counter.tsrx"] }),
      new ServerRoute({ path: "/api/health", handler: health }),
    ],
  },
});
`;

/**
 * The Octane mark, as markup rather than an asset.
 *
 * Inline because the wordmark is two colors with different jobs: the glyph
 * takes `currentColor` so it follows the page's light/dark text, and the flame
 * keeps the brand red at every theme. An `<img>` can do neither, and a second
 * file to keep in step with the stylesheet is not worth it for one logo.
 */
const LOGO = `<svg class="mark" viewBox="0 0 84 108" fill="none" aria-hidden="true">
        <path
          d="M71.0265 37.6009L65.8601 32.48C57.4266 24.1187 52.5193 13.6179 49.6691 1.55156C49.1892 -0.480713 46.2849 -0.534311 45.796 1.49572C43.135 12.5571 39.0884 21.441 31.9122 28.5539L29.1656 31.2763L32.1217 32.6051C34.5258 33.686 36.646 34.9098 38.604 36.3458C40.1609 37.487 41.4587 38.751 42.5898 40.0798L46.9068 35.8031L59.8758 48.6555C67.025 55.7439 67.025 67.2742 59.8758 74.3626L47.0622 87.0609C43.5969 90.4957 38.9915 92.385 34.0932 92.385C29.1949 92.385 24.5895 90.4935 21.1242 87.0609C13.975 79.9726 13.975 68.4422 21.1242 61.3539L26.4529 56.0722C27.6921 53.5084 29.6118 50.1138 31.1844 45.7858C32.4101 42.4136 31.8266 38.8649 29.4653 36.0733L27.1198 33.3041L9.97348 50.2992C-3.32449 63.4822 -3.32449 84.9304 9.97348 98.1133C16.6225 104.706 25.3578 108 34.0932 108C42.8286 108 51.564 104.704 58.213 98.1133L71.0265 85.415C84.3245 72.2321 84.3245 50.7838 71.0265 37.5986V37.6009Z"
          fill="currentColor"
        />
        <path
          d="M53.682 51.4605C56.0095 56.1079 55.4237 66.6802 46.9654 65.3715C45.0232 65.07 43.2928 64.0941 42.7183 61.8943C42.3578 60.5097 43.3131 58.2697 43.7705 56.9387C46.481 49.0441 43.0923 42.4136 37.2657 38.1413C35.5736 36.9019 33.6314 35.7384 31.1913 34.6396C34.0595 38.0274 34.8684 42.3801 33.2732 46.6277C32.3224 48.9481 31.0606 51.3958 29.9543 53.6514C27.9671 57.7047 26.3178 62.504 27.575 69.1591C28.1879 72.4063 30.2743 75.0706 32.2503 76.9532C26.4259 77.6522 24.1886 73.811 23.0305 72.1986C21.7935 70.4767 20.9328 66.0973 22.7173 62.935C16.4491 69.1502 16.4491 79.2669 22.7173 85.4843C25.759 88.4969 29.7989 90.154 34.0933 90.154C38.3878 90.154 42.4276 88.4969 45.4694 85.4843L56.6562 74.3984C63.0663 67.8527 61.0543 58.7722 53.6798 51.4628L53.682 51.4605Z"
          fill="#FF415A"
        />
      </svg>`;

/** The card styles the landing page uses for its documentation links. */
const LINK_STYLES = `      .links {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
        gap: 0.75rem;
        width: 100%;
        max-width: 42rem;
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .link {
        display: block;
        padding: 0.9rem 1.1rem;
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        background: var(--panel);
        color: inherit;
        text-align: left;
        text-decoration: none;
        transition:
          border-color 0.15s,
          transform 0.15s;
      }
      .link:hover {
        border-color: var(--accent);
        transform: translateY(-2px);
      }
      .link-title {
        display: block;
        font-weight: 600;
      }
      .link-body {
        display: block;
        margin-top: 0.15rem;
        color: var(--muted);
        font-size: 0.875rem;
      }`;

/** Where the landing page sends people next. */
const DOC_LINKS = `const LINKS = [
  {
    href: "https://octanejs.dev/docs/quick-start",
    title: "Quick start",
    body: "Scaffold an app, mount a component, and the .tsrx essentials.",
  },
  {
    href: "https://octanejs.dev/docs/core-apis",
    title: "Core APIs",
    body: "State, events, context, effects, async UI, and server rendering.",
  },
  {
    href: "https://octanejs.dev/docs/tsrx-vs-tsx",
    title: "TSRX vs TSX",
    body: "What the .tsrx dialect adds on top of ordinary JSX.",
  },
  {
    href: "https://octanejs.dev/docs/differences-from-react",
    title: "Differences from React",
    body: "The deliberate divergences. Everything else matching is the point.",
  },
];`;

/**
 * The landing page: the mark, the name, and the way into the documentation.
 *
 * `fullstack` renders it through the shared layout, so the two pages carry one
 * header between them; `spa` has a single page and owns the frame itself.
 *
 * @param {keyof typeof MODES} mode
 * @returns {string}
 */
export const appComponent = (mode) =>
	mode === 'fullstack'
		? `import { Layout } from "./Layout.tsrx";

${DOC_LINKS}

export function App() @{
  <Layout>
    <section class="hero">
      ${LOGO}
      <h1 class="title">octane</h1>
      <p class="lede">
        React’s programming model, compiled. Edit src/App.tsrx and save — the page
        updates without a reload.
      </p>
      <ul class="links">
        @for (const link of LINKS; key link.href) {
          <li>
            <a class="link" href={link.href} target="_blank" rel="noreferrer">
              <span class="link-title">{link.title as string}</span>
              <span class="link-body">{link.body as string}</span>
            </a>
          </li>
        }
      </ul>
    </section>

    <style>
      .hero {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.25rem;
        text-align: center;
      }
      .mark {
        width: 5rem;
        height: auto;
      }
      .title {
        margin: 0;
        font-size: 3rem;
        letter-spacing: -0.03em;
      }
      .lede {
        max-width: 34rem;
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
${LINK_STYLES}
    </style>
  </Layout>
}
`
		: `${DOC_LINKS}

export function App() @{
  <main class="page">
    ${LOGO}
    <h1 class="title">octane</h1>
    <p class="lede">
      React’s programming model, compiled. Edit src/App.tsrx and save — the page
      updates without a reload.
    </p>
    <ul class="links">
      @for (const link of LINKS; key link.href) {
        <li>
          <a class="link" href={link.href} target="_blank" rel="noreferrer">
            <span class="link-title">{link.title as string}</span>
            <span class="link-body">{link.body as string}</span>
          </a>
        </li>
      }
    </ul>

    <style>
      .page {
        display: flex;
        min-height: 100dvh;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.25rem;
        padding: 3rem 1.5rem;
        text-align: center;
      }
      .mark {
        width: 5rem;
        height: auto;
      }
      .title {
        margin: 0;
        font-size: 3rem;
        letter-spacing: -0.03em;
      }
      .lede {
        max-width: 34rem;
        margin: 0;
        color: var(--muted);
        line-height: 1.6;
      }
${LINK_STYLES}
    </style>
  </main>
}
`;

/**
 * The frame the fullstack pages share. `children` is an ordinary prop, typed as
 * `OctaneNode` — the renderable type, never React's `ReactNode`.
 */
export const layoutComponent = `import type { OctaneNode } from "octane";

interface LayoutProps {
  children: OctaneNode;
}

export function Layout(props: LayoutProps) @{
  <div class="shell">
    <nav class="nav">
      <a class="nav-link" href="/">Home</a>
      <a class="nav-link" href="/counter">Counter</a>
      <a class="nav-link" href="/api/health">/api/health</a>
    </nav>
    <main class="main">{props.children}</main>

    <style>
      .shell {
        display: flex;
        min-height: 100dvh;
        flex-direction: column;
      }
      .nav {
        display: flex;
        gap: 1.25rem;
        padding: 1rem 1.5rem;
        border-bottom: 1px solid var(--border);
      }
      .nav-link {
        color: var(--muted);
        font-size: 0.9rem;
        text-decoration: none;
      }
      .nav-link:hover {
        color: var(--accent);
      }
      .main {
        display: flex;
        flex: 1;
        align-items: center;
        justify-content: center;
        padding: 3rem 1.5rem;
      }
    </style>
  </div>
}
`;

/**
 * The second page, and the reason the fullstack template has two.
 *
 * Its markup arrives from the server already rendered — view source and the
 * count is in the HTML — and the button starts working once hydration reaches
 * it. That is the whole difference from `spa` in one screen.
 */
export const counterComponent = `import { useState } from "octane";
import { Layout } from "./Layout.tsrx";

export function Counter() @{
  const [count, setCount] = useState(0);

  <Layout>
    <section class="counter">
      <h1 class="title">Server-rendered, then interactive</h1>
      <p class="lede">
        This page was rendered on the server and hydrated in the browser. View
        source to see the markup arrive complete, then press the button.
      </p>
      <button class="button" onClick={() => setCount(count + 1)}>
        {"Pressed " + count + " times"}
      </button>

      <style>
        .counter {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1.25rem;
          text-align: center;
        }
        .title {
          margin: 0;
          font-size: 2rem;
          letter-spacing: -0.02em;
        }
        .lede {
          max-width: 34rem;
          margin: 0;
          color: var(--muted);
          line-height: 1.6;
        }
        .button {
          padding: 0.7rem 1.4rem;
          border: 1px solid var(--border);
          border-radius: 0.6rem;
          background: var(--panel);
          color: inherit;
          font: inherit;
          cursor: pointer;
        }
        .button:hover {
          border-color: var(--accent);
        }
      </style>
    </section>
  </Layout>
}
`;

/**
 * A server route: a plain function from the request context to a `Response`,
 * with no component and no rendering involved.
 */
export const healthRoute = `/**
 * Handles GET /api/health, declared in octane.config.ts.
 *
 * A ServerRoute returns a Response, so this never renders and never ships to
 * the browser — it is the place for an API endpoint, a webhook, or a form
 * action.
 */
export function health(): Response {
  return Response.json({ status: "ok" });
}
`;

/**
 * The reset and the theme tokens the components read.
 *
 * These live in the shell rather than in a component because a component's
 * `<style>` is scoped — the compiler appends a scope hash to its selectors — so
 * it can style that component's own markup but never `body`, and the custom
 * properties have to resolve for every component at once. Both colour schemes
 * are declared, so the page follows the operating system without any JavaScript.
 */
const GLOBAL_STYLES = `      :root {
        --bg: #ffffff;
        --text: #14110f;
        --muted: #6b6560;
        --panel: #faf8f6;
        --border: #e6e1dc;
        --accent: #ff415a;
        color-scheme: light dark;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --bg: #14110f;
          --text: #f4eee8;
          --muted: #9a938c;
          --panel: #1c1917;
          --border: #2e2a27;
        }
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--text);
        font-family:
          ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
        -webkit-font-smoothing: antialiased;
      }`;

const SPA_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Octane app</title>
    <style>
${GLOBAL_STYLES}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`;

const SSR_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Octane app</title>
    <style>
${GLOBAL_STYLES}
    </style>
    <!--ssr-head-->
  </head>
  <body>
    <div id="root"><!--ssr-body--></div>
  </body>
</html>
`;

/** The markers `validateSsrTemplate` requires of a fullstack index.html. */
export const SSR_MARKERS = ['<!--ssr-head-->', '<!--ssr-body-->'];

/**
 * The HTML shell.
 *
 * `spa` is an ordinary Vite page, so it loads the client entry itself.
 * `fullstack` loads nothing: the metaframework plugin owns the hydration entry,
 * injecting the virtual module in dev and the hashed script at build. Its
 * markers are a contract rather than decoration — `validateSsrTemplate` rejects
 * a template that does not carry exactly one of each.
 *
 * @param {keyof typeof MODES} mode
 * @returns {string}
 */
export const indexHtml = (mode) => (mode === 'fullstack' ? SSR_INDEX_HTML : SPA_INDEX_HTML);

/**
 * The client bootstrap, `spa` only. `render(App)` is the body-and-props
 * overload, which keeps the entry plain TypeScript with no JSX pragma to carry.
 */
export const clientEntry = `import { createRoot } from "octane";
import { App } from "./App.tsrx";

const root = createRoot(document.getElementById("root")!);
root.render(App);
`;

/**
 * Prettier cannot parse `.tsrx` on its own, so a project that formats without
 * this plugin either skips those files or mangles them.
 */
export const prettierConfig = `{
  "plugins": ["@tsrx/prettier-plugin"]
}
`;

/**
 * The config filenames Prettier itself looks for, in the order it looks. A
 * project that already has one owns its formatting, and this command states the
 * edit instead of picking a fight with it.
 *
 * The order is load-bearing, not decorative: the first of these that exists is
 * the one Prettier reads, so it is the one to inspect for the plugin and to
 * name in an instruction. Note how little of it is alphabetical. The module
 * variants interleave `.prettierrc.X` with `prettier.config.X` by type rather
 * than grouping by prefix, and `.toml` sorts last rather than with the other
 * data formats. Taken from prettier 3.9.6 and confirmed against it.
 *
 * `package.json` comes before all of these and is handled by its own check,
 * since the file existing says nothing about whether it configures Prettier.
 * `package.yaml`, which Prettier searches second, is not covered: telling one
 * that configures Prettier from one that does not needs a YAML parser this
 * package does not carry.
 */
export const PRETTIER_CONFIG_FILES = [
	'.prettierrc',
	'.prettierrc.json',
	'.prettierrc.yml',
	'.prettierrc.yaml',
	'.prettierrc.json5',
	'.prettierrc.js',
	'prettier.config.js',
	'.prettierrc.ts',
	'prettier.config.ts',
	'.prettierrc.mjs',
	'prettier.config.mjs',
	'.prettierrc.mts',
	'prettier.config.mts',
	'.prettierrc.cjs',
	'prettier.config.cjs',
	'.prettierrc.cts',
	'prettier.config.cts',
	'.prettierrc.toml',
];

export const tsconfig = `{
  "compilerOptions": {
    "target": "esnext",
    "module": "esnext",
    "moduleResolution": "bundler",
    "lib": ["esnext", "dom", "dom.iterable"],
    "strict": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "jsxImportSource": "octane",
    "plugins": [
      {
        "name": "@tsrx/typescript-plugin"
      }
    ]
  },
  "include": ["src/**/*", "vite.config.ts", "octane.config.ts"]
}
`;

/**
 * Scripts that are correct whatever the bundler is. `tsrx-tsc` is the only
 * typechecker that reads `.tsrx`, regardless of how the project builds.
 */
export const SCRIPTS = {
	typecheck: 'tsrx-tsc --noEmit -p tsconfig.json',
};

/** Added only when init is the one creating the Vite config. */
export const VITE_SCRIPTS = {
	dev: 'vite',
	build: 'vite build',
};
