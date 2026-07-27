// The CLI section: what `octane doctor` actually prints, beside the commands
// that get you there. The transcript is real output from a deliberately broken
// project, trimmed to the findings that make the point.
import { Link } from '@octanejs/tanstack-router';

const TRANSCRIPT = [
	{ id: 'group-deps', kind: 'group', title: 'dependencies', message: '' },
	{
		id: 'octane-duplicates',
		kind: 'fail',
		title: 'Single Octane runtime',
		message: '2 copies of octane are installed',
	},
	{
		id: 'vite-peer',
		kind: 'pass',
		title: 'Vite peer range',
		message: 'vite 8.1.5 satisfies ^8.0.16',
	},
	{ id: 'group-ts', kind: 'group', title: 'typescript', message: '' },
	{
		id: 'jsx-import-source',
		kind: 'fail',
		title: 'JSX import source',
		message: 'jsxImportSource is not set',
	},
	{
		id: 'typecheck-script',
		kind: 'warn',
		title: 'Typecheck script',
		message: 'typecheck runs plain tsc',
	},
	{
		id: 'wildcard-decl',
		kind: 'fail',
		title: 'No wildcard .tsrx declaration',
		message: 'declare module \'*.tsrx\' found in 1 file(s)',
	},
];

const COMMANDS = [
	{ name: 'octane init', body: 'Wire Octane into a project you already have.' },
	{ name: 'octane doctor --fix', body: 'Find the quiet breakage, then repair it.' },
	{ name: 'octane add react-hook-form', body: 'Install the binding that ports it.' },
	{ name: 'octane explain 3', body: 'Decode a minified production error.' },
	{ name: 'octane mcp add', body: 'Give your coding agent the Octane tools.' },
];

export function Cli() @{
	<section class="cli">
		<div class="cli-copy">
			<h2 class="cli-title">
				{'The mistakes that fail '}
				<span class="cli-accent">quietly</span>
			</h2>
			<p class="cli-sub">
				{'Octane compiles ahead of time, so a misconfiguration usually degrades instead ' +
					'of erroring. Two copies of the runtime in one tree break hooks and context ' +
					'silently, because hook state is keyed per runtime instance. Plain tsc ' +
					'mis-handles every .tsrx file. A declare module \'*.tsrx\' shim turns your own ' +
					'components into any. octane doctor is 20 checks over exactly those.'}
			</p>

			<div class="cli-install">
				<code>{'pnpm add -D @octanejs/cli'}</code>
			</div>

			<ul class="cli-commands">
				@for (const command of COMMANDS; key command.name) {
					<li class="cli-command">
						<code class="cli-command-name">{command.name as string}</code>
						<span class="cli-command-body">{command.body as string}</span>
					</li>
				}
			</ul>

			<div class="cli-actions">
				<Link to="/docs/$slug" params={{ slug: 'cli' }} class="btn-primary">
					CLI reference
				</Link>
			</div>
		</div>

		<div class="cli-terminal">
			<div class="cli-terminal-bar">
				<span class="dot dot-r"></span>
				<span class="dot dot-y"></span>
				<span class="dot dot-g"></span>
				<span class="cli-terminal-name">octane doctor</span>
			</div>
			<div class="cli-terminal-body">
				@for (const line of TRANSCRIPT; key line.id) {
					@if (line.kind === 'group') {
						<div class="cli-line cli-group">{line.title as string}</div>
					} @else {
						<div class="cli-line">
							<span class={['cli-glyph', 'cli-glyph-' + line.kind]}>
								{line.kind === 'pass'
									? '✔'
									: line.kind === 'warn'
										? '⚠'
										: '✖'}
							</span>
							<span class="cli-check">{line.title as string}</span>
							<span class="cli-message">{line.message as string}</span>
						</div>
					}
				}
				<div class="cli-line cli-summary">
					<span class="cli-glyph-fail">3 failing</span>
					{' · '}
					<span class="cli-glyph-warn">1 warning</span>
					{' · '}
					<span class="cli-glyph-pass">11 passing</span>
				</div>
				<div class="cli-line cli-hint">{'`octane doctor --fix` can repair 2 findings.'}</div>
			</div>
		</div>

		<style>
			/* Two columns like the hero: the argument on the left, the artefact on
			   the right. The terminal reuses the hero's window chrome so the page
			   reads as one system. */
			.cli {
				display: grid;
				grid-template-columns: 1fr 1fr;
				gap: 3rem;
				align-items: center;
				padding: 0 0 3rem;
			}
			@media (max-width: 1000px) {
				.cli {
					grid-template-columns: 1fr;
					gap: 2rem;
				}
			}
			.cli-title {
				margin: 0 0 0.75rem;
				font-size: 2.1rem;
				line-height: 1.1;
				letter-spacing: -0.02em;
			}
			.cli-accent {
				color: var(--accent);
			}
			.cli-sub {
				margin: 0 0 1.25rem;
				color: var(--text-secondary);
				font-size: 0.975rem;
				line-height: 1.6;
			}
			.cli-install {
				margin-bottom: 1.25rem;
			}
			.cli-install code {
				display: inline-block;
				background: var(--code-bg);
				border: 1px solid var(--border);
				border-radius: 0.6rem;
				padding: 0.5rem 0.85rem;
				font-size: 0.9rem;
				color: var(--text);
			}
			.cli-commands {
				list-style: none;
				margin: 0 0 1.5rem;
				padding: 0;
				display: flex;
				flex-direction: column;
				gap: 0.5rem;
			}
			.cli-command {
				display: flex;
				flex-wrap: wrap;
				align-items: baseline;
				gap: 0.6rem;
			}
			.cli-command-name {
				color: var(--text);
				font-size: 0.875rem;
				white-space: nowrap;
			}
			.cli-command-body {
				color: var(--text-secondary);
				font-size: 0.875rem;
			}
			.cli-terminal {
				background: var(--code-bg);
				border: 1px solid var(--border);
				border-radius: 1rem;
				overflow: hidden;
			}
			.cli-terminal-bar {
				display: flex;
				align-items: center;
				gap: 0.4rem;
				padding: 0.6rem 0.9rem;
				border-bottom: 1px solid var(--border);
				background: var(--panel);
			}
			.cli-terminal-name {
				margin-left: 0.5rem;
				color: var(--text-secondary);
				font-size: 0.8rem;
			}
			.cli-terminal-body {
				padding: 0.9rem 1rem 1.1rem;
				font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
				font-size: 0.8rem;
				line-height: 1.9;
				overflow-x: auto;
			}
			.cli-line {
				display: flex;
				align-items: baseline;
				gap: 0.6rem;
				white-space: nowrap;
			}
			.cli-group {
				color: var(--text);
				font-weight: 700;
				margin-top: 0.6rem;
			}
			.cli-group:first-child {
				margin-top: 0;
			}
			.cli-glyph {
				width: 1ch;
			}
			.cli-glyph-pass {
				color: #46c78a;
			}
			.cli-glyph-warn {
				color: #e0b341;
			}
			.cli-glyph-fail {
				color: var(--accent);
			}
			.cli-check {
				color: var(--text);
			}
			.cli-message {
				color: var(--text-secondary);
			}
			.cli-summary {
				margin-top: 0.8rem;
				padding-top: 0.7rem;
				border-top: 1px solid var(--border);
			}
			.cli-hint {
				color: var(--text-secondary);
			}
		</style>
	</section>
}
