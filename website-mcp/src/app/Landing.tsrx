// The human-facing front door of mcp.octanejs.dev: one static SSR page that
// documents the machine surface (the /v1/mcp MCP endpoint and the plain-HTTP
// extras). Everything an agent needs is served by the ServerRoutes; this page
// exists so a person landing here understands what the host is.
const TOOLS = [
	['octane_docs_search', 'Section-level full-text search over the official Octane docs.'],
	['octane_docs_read', 'Read one doc as markdown by slug.'],
	['octane_compile', 'Compile/validate pasted .tsrx source with the real Octane compiler.'],
	['octane_bindings', 'The React-package → @octanejs/* binding map and catalog.'],
	[
		'octane_bindings_status',
		'Per-binding parity status: upstream version, surface, divergences, SSR.',
	],
	['octane_bridge_scan', 'Scan pasted React source for a compatibility report and migration plan.'],
	['octane_skill', 'Task guides: bridging packages, migrating components, SSR setup.'],
];

const ENDPOINTS = [
	['GET /v1/docs', 'Docs index (slugs, titles, sections).'],
	['GET /v1/docs/:slug', 'One doc as JSON, markdown included.'],
	['GET /v1/bindings', 'Binding map, catalog, and per-package status.'],
	['GET /llms.txt', 'The condensed agent-facing summary of Octane.'],
	['GET /llms-full.txt', 'llms.txt plus the full docs corpus, one plain-text file.'],
];

export function Landing() @{
	<main class="landing">
		<h1>Octane MCP</h1>
		<p class="lede">
			The remote MCP server for
			<a href="https://octanejs.dev">Octane</a>
			— docs search, real-compiler
			<code>.tsrx</code>
			validation, and bindings knowledge for AI agents, no install required.
		</p>

		<h2>Connect</h2>
		<p>
			The MCP endpoint speaks stateless Streamable HTTP at
			<code>POST https://mcp.octanejs.dev/v1/mcp</code>
			:
		</p>
		<pre>claude mcp add --transport http octane https://mcp.octanejs.dev/v1/mcp</pre>

		<h2>Tools</h2>
		<dl>
			@for (const tool of TOOLS; key tool[0]) {
				<>
					<dt>
						<code>
							{tool[0] as string}
						</code>
					</dt>
					<dd>
						{tool[1] as string}
					</dd>
				</>
			}
		</dl>

		<h2>Plain HTTP</h2>
		<p>No MCP client handy? The same knowledge is served as versioned JSON and text:</p>
		<dl>
			@for (const endpoint of ENDPOINTS; key endpoint[0]) {
				<>
					<dt>
						<code>
							{endpoint[0] as string}
						</code>
					</dt>
					<dd>
						{endpoint[1] as string}
					</dd>
				</>
			}
		</dl>

		<h2>Versioning</h2>
		<p>
			The
			<code>/v1</code>
			prefix is the API contract: tools and response shapes stay stable within it, while the served
			knowledge tracks the latest Octane release. Breaking changes ship as a new
			<code>/v2</code>
			prefix alongside.
		</p>

		<p class="foot">
			<a href="https://octanejs.dev/docs">Documentation</a>
			·
			<a href="https://github.com/octanejs/octane">GitHub</a>
		</p>

		<style>
			.landing {
				max-width: 760px;
				margin: 0 auto;
				padding: 4rem 1.5rem 6rem;
			}
			.landing h1 {
				font-size: 2.5rem;
				letter-spacing: -0.03em;
				margin: 0 0 0.5rem;
			}
			.landing .lede {
				color: var(--text-secondary);
				font-size: 1.125rem;
				margin: 0 0 2.5rem;
			}
			.landing h2 {
				margin: 2.5rem 0 0.75rem;
				font-size: 1.25rem;
			}
			.landing pre {
				background: var(--code-bg);
				border: 1px solid var(--border);
				border-radius: 0.75rem;
				padding: 0.9rem 1.1rem;
				overflow-x: auto;
				font-size: 0.875rem;
			}
			.landing code {
				background: var(--code-bg);
				border-radius: 0.375rem;
				padding: 0.1rem 0.35rem;
				font-size: 0.875em;
			}
			.landing pre code {
				background: none;
				padding: 0;
			}
			.landing dl {
				margin: 0;
			}
			.landing dt {
				margin-top: 0.75rem;
			}
			.landing dd {
				margin: 0.15rem 0 0 0;
				color: var(--text-secondary);
			}
			.landing .foot {
				margin-top: 3.5rem;
				color: var(--text-secondary);
			}
		</style>
	</main>
}
