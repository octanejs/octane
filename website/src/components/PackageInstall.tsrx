// An install snippet with a package-manager switcher: npm / pnpm / yarn / bun
// tabs (pnpm is the default) over one terminal panel whose command is derived
// per manager from the SAME package list — so a doc can never show a pnpm line
// the npm tab contradicts. Docs use it for install fences only; script-running
// fences (pnpm rsbuild dev, vite build …) stay ordinary code blocks. It owns
// its own frame + copy button (rather than wrapping CodeBlock) so the tab bar
// attaches seamlessly to the code as one panel.
import { useId, useRef, useState } from 'octane';
import { useCopyToClipboard } from '../hooks/use-copy.ts';
import copyUrl from '../assets/copy.svg';
import checkUrl from '../assets/check.svg';

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

const MANAGERS: PackageManager[] = ['npm', 'pnpm', 'yarn', 'bun'];

// Each manager's install verb and dev-dependency flag (bun documents `-d`).
const INSTALL: Record<PackageManager, { add: string; dev: string }> = {
	npm: { add: 'npm install', dev: 'npm install -D' },
	pnpm: { add: 'pnpm add', dev: 'pnpm add -D' },
	yarn: { add: 'yarn add', dev: 'yarn add -D' },
	bun: { add: 'bun add', dev: 'bun add -d' },
};

interface PackageInstallProps {
	/** Runtime packages, space-separated — rendered first. */
	packages?: string;
	/** Dev packages, space-separated — rendered as the -D line. */
	dev?: string;
}

// One rendered span in the code block. Newlines between command lines are their
// own token so the whole thing is a single flat list (one node per @for
// iteration) and textContent — what copy reads — is the exact command string.
interface Token {
	id: string;
	text: string;
	kind: 'cmd' | 'arg' | 'nl';
}

// Split each command into words and tag the first (coloring just the binary
// matches the bash fences around it: command word accented, arguments plain).
// The leading space is kept ON each argument token, and a newline token joins
// consecutive lines, so the rendered text reads back byte-for-byte.
function toTokens(lines: string[]): Token[] {
	const tokens: Token[] = [];
	lines.forEach((line, lineIndex) => {
		if (lineIndex > 0) tokens.push({ id: 'nl' + lineIndex, text: '\n', kind: 'nl' });
		line.split(' ').forEach((word, wordIndex) => {
			tokens.push({
				id: 'l' + lineIndex + 'w' + wordIndex,
				text: wordIndex === 0 ? word : ' ' + word,
				kind: wordIndex === 0 ? 'cmd' : 'arg',
			});
		});
	});
	return tokens;
}

export function PackageInstall(props: PackageInstallProps) @{
	const [manager, setManager] = useState<PackageManager>('pnpm');
	const { copied, copy } = useCopyToClipboard();
	const codeEl = useRef<HTMLElement | null>(null);
	// Unique per instance — build-tools renders three of these on one page, so
	// the tab/panel ids must not collide.
	const id = useId();

	const lines: string[] = [];
	if (props.packages) lines.push(INSTALL[manager].add + ' ' + props.packages);
	if (props.dev) lines.push(INSTALL[manager].dev + ' ' + props.dev);
	const tokens = toTokens(lines);

	// textContent, not innerText: the element holds only our own token spans and a
	// literal newline text node, so textContent IS the exact command — with no
	// dependence on layout (and it works in jsdom, so it's testable).
	const copyCommand = () => copy(codeEl.current?.textContent ?? '');

	// The WAI-ARIA tabs pattern: arrow keys move selection (focus follows),
	// Home/End jump to the ends, and only the active tab is in the tab order.
	const onTablistKeyDown = (event: KeyboardEvent) => {
		const index = MANAGERS.indexOf(manager);
		let next: number;
		if (event.key === 'ArrowRight') next = (index + 1) % MANAGERS.length;
		else if (event.key === 'ArrowLeft') next = (index + MANAGERS.length - 1) % MANAGERS.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = MANAGERS.length - 1;
		else return;
		event.preventDefault();
		const pm = MANAGERS[next];
		setManager(pm);
		document.getElementById(id + '-tab-' + pm)?.focus();
	};

	<div class="pkg">
		<div class="pkg-head">
			<div
				class="pkg-tabs"
				role="tablist"
				aria-label="Package manager"
				onKeyDown={onTablistKeyDown}
			>
				@for (const pm of MANAGERS; key pm) {
					<button
						type="button"
						role="tab"
						id={id + '-tab-' + pm}
						aria-selected={manager === pm}
						aria-controls={id + '-panel'}
						tabindex={manager === pm ? 0 : -1}
						class={['pkg-tab', manager === pm && 'pkg-tab-active']}
						onClick={() => setManager(pm)}
					>
						{pm as string}
					</button>
				}
			</div>
			<button
				type="button"
				class="pkg-copy"
				aria-label="Copy the command to the clipboard"
				onClick={copyCommand}
			>
				<span
					class="pkg-copy-icon"
					style={'--icon:url("' + (copied ? checkUrl : copyUrl) + '")'}
					aria-hidden="true"
				></span>
				<span class="pkg-copy-label">
					{copied ? 'Copied' : 'Copy'}
				</span>
			</button>
		</div>
		<pre
			class="pkg-pre"
			id={id + '-panel'}
			role="tabpanel"
			aria-labelledby={id + '-tab-' + manager}
		>
			<code class="pkg-code" ref={codeEl}>
				@for (const tok of tokens; key tok.id) {
					<span class={'pkg-tok-' + tok.kind}>
						{tok.text as string}
					</span>
				}
			</code>
		</pre>

		<style>
			.pkg {
				margin: 1.4rem 0;
				border: 1px solid var(--border);
				border-radius: 0.75rem;
				background: var(--code-bg);
				overflow: hidden;
			}
			/* Header strip: tabs on the left, copy on the right, divided from the
			   command by a hairline — reads as one terminal panel. The 2rem min-height
			   is the shared invariant with .codeblock-bar, so the two panel headers
			   stay the same height; the tabs stretch to fill it (rather than the tab
			   padding + font setting the height), so bumping the tab font can't drift
			   this out of step with the doc code-block header. */
			.pkg-head {
				display: flex;
				align-items: stretch;
				justify-content: space-between;
				gap: 0.5rem;
				min-height: 2rem;
				padding: 0 0.4rem 0 0.35rem;
				border-bottom: 1px solid var(--border);
				background: rgba(255, 255, 255, 0.02);
			}
			.pkg-tabs {
				display: flex;
				gap: 0.1rem;
			}
			/* Underline tabs: the active manager carries the accent underline and
			   text, the rest sit quiet until hover. */
			.pkg-tab {
				position: relative;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				padding: 0.5rem 0.75rem;
				border: none;
				background: transparent;
				color: var(--text-secondary);
				font: inherit;
				font-size: 0.875rem;
				font-weight: 500;
				line-height: 1;
				cursor: pointer;
				transition: color 0.15s;
			}
			.pkg-tab::after {
				content: '';
				position: absolute;
				left: 0.35rem;
				right: 0.35rem;
				bottom: -1px;
				height: 2px;
				border-radius: 2px 2px 0 0;
				background: transparent;
				transition: background 0.15s;
			}
			.pkg-tab:hover {
				color: var(--text);
			}
			.pkg-tab-active {
				color: var(--accent-text);
			}
			.pkg-tab-active::after {
				background: var(--accent);
			}
			.pkg-copy {
				display: inline-flex;
				align-items: center;
				gap: 0.3rem;
				align-self: center;
				padding: 0.25rem 0.55rem;
				border: 1px solid transparent;
				border-radius: 0.5rem;
				background: transparent;
				color: var(--text-secondary);
				font: inherit;
				font-size: 0.75rem;
				cursor: pointer;
				transition:
					background 0.15s,
					color 0.15s,
					border-color 0.15s;
			}
			.pkg-copy:hover {
				color: var(--text);
				background: rgba(255, 255, 255, 0.07);
				border-color: rgba(255, 255, 255, 0.14);
			}
			.pkg-copy-icon {
				width: 14px;
				height: 14px;
				flex: none;
				background: currentColor;
				mask: var(--icon) center / contain no-repeat;
				-webkit-mask: var(--icon) center / contain no-repeat;
			}
			/* Below 420px the panel is tight — keep the tabs, drop the copy label
			   to just its icon. */
			@media (max-width: 420px) {
				.pkg-copy-label {
					display: none;
				}
			}
			.pkg-pre {
				margin: 0;
				padding: 0.9rem 1.1rem;
				overflow-x: auto;
				font-size: 0.875rem;
				line-height: 1.7;
				color: var(--text);
			}
			/* Match the surrounding shiki bash fences (github-dark-high-contrast):
			   the command binary is accented, its arguments stay plain. */
			.pkg-tok-cmd {
				color: #ffb757;
			}
			.pkg-tok-arg {
				color: #addcff;
			}
		</style>
	</div>
}
