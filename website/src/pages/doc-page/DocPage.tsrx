// One documentation page: render compiled MDX in a readable article, add the
// navigation supplied by the registry, and keep a local table of contents
// beside longer guides.
import { Link, useParams } from '@octanejs/tanstack-router';
import { docs, findDoc } from '../../content/docs.ts';
import { CodeBlock } from '../../components/CodeBlock.tsrx';
import { OnThisPage } from '../../components/OnThisPage.tsrx';
import { useTitle } from '../../hooks/use-title.ts';

function DocTable(props: { children?: unknown; [key: string]: unknown }) @{
	const { children, ...tableProps } = props;

	<div class="table-scroll">
		<table {...tableProps}>{children}</table>
	</div>
}

// Every fenced code block (the Shiki `<pre>`) is wrapped in the shared CodeBlock
// so doc snippets get a labelled header (language tag + one-click copy). The
// language is stamped onto the `<pre>` as `data-language` by the shiki
// transformer in mdx-options.ts (hast may expose it camelCased, so read both).
// Inline `code` is untouched; only block `pre` maps here. The children are static
// Shiki markup, so there is no prop-slot component to break SSR/hydration.
function DocPre(props: { children?: unknown; [key: string]: unknown }) @{
	const { children, ...preProps } = props;
	const stamped = preProps['data-language'] ?? preProps.dataLanguage;
	const language =
		typeof stamped === 'string' ? stamped : '';

	<CodeBlock variant="plain" language={language}>
		<pre {...preProps}>{children}</pre>
	</CodeBlock>
}

const docComponents = { table: DocTable, pre: DocPre };

export function DocPage() @{
	const params = useParams({ strict: false }) as { slug?: string };
	const doc = findDoc(params.slug);
	useTitle(doc ? 'Octane — ' + doc.title : 'Octane — Docs');
	const Doc = doc ? doc.component : null;
	const sections = doc?.sections ?? [];
	const currentIndex =
		doc ? docs.indexOf(doc) : -1;
	const previous =
		currentIndex > 0 ? docs[currentIndex - 1] : null;
	const next =
		currentIndex >= 0 && currentIndex < docs.length - 1 ? docs[currentIndex + 1] : null;
	<>
		<div class={['doc-frame', sections.length > 0 && 'has-toc']}>
			<article class="prose">
				@if (Doc) {
					<>
						<Doc components={docComponents} />
						@if (previous || next) {
							<nav class="doc-pagination" aria-label="Previous and next documentation">
								@if (previous) {
									<Link
										to="/docs/$slug"
										params={{ slug: previous.slug }}
										class="pagination-link previous"
									>
										<span>← Previous</span>
										<strong>
											{previous.title as string}
										</strong>
									</Link>
								}
								@if (next) {
									<Link to="/docs/$slug" params={{ slug: next.slug }} class="pagination-link next">
										<span>Next →</span>
										<strong>
											{next.title as string}
										</strong>
									</Link>
								}
							</nav>
						}
					</>
				} @else {
					<div class="doc-missing">
						<h1>Document not found</h1>
						<p>
							{'No document named “' + params.slug + '”.' as string}
						</p>
					</div>
				}
			</article>
			@if (sections.length > 0) {
				<OnThisPage sections={sections} resetKey={doc?.slug ?? ''} />
			}
		</div>
		<style>
			.doc-frame {
				width: 100%;
				max-width: 68rem;
				display: grid;
				grid-template-columns: minmax(0, 48rem);
				justify-content: start;
			}
			.doc-frame.has-toc {
				grid-template-columns: minmax(0, 48rem) minmax(14rem, 15.5rem);
				gap: clamp(2rem, 4vw, 3.5rem);
			}
			.prose {
				min-width: 0;
				max-width: 48rem;
			}
			@media (max-width: 1180px) {
				.doc-frame.has-toc {
					grid-template-columns: minmax(0, 48rem);
					gap: 1.5rem;
				}
			}
			.prose :global(.doc-hero) {
				margin: 0 0 1.75rem;
				padding-bottom: 1.75rem;
				border-bottom: 1px solid var(--border);
			}
			.prose :global(.doc-eyebrow) {
				margin: 0 0 0.45rem;
				color: var(--accent-text);
				font-size: 0.75rem;
				font-weight: 800;
				letter-spacing: 0.1em;
				text-transform: uppercase;
			}
			.prose :global(.doc-lede) {
				max-width: 43rem;
				margin: 0;
				color: #dfe3e9;
				font-size: 1.15rem;
				line-height: 1.7;
			}
			.prose :global(h1) {
				font-size: clamp(2.65rem, 6vw, 3.5rem);
				letter-spacing: -0.045em;
				line-height: 1.05;
				margin: 0 0 1rem;
			}
			.prose :global(h2) {
				font-size: clamp(1.55rem, 3vw, 1.85rem);
				letter-spacing: -0.025em;
				line-height: 1.25;
				margin: 3.25rem 0 1rem;
				padding-top: 2rem;
				border-top: 1px solid var(--border);
				scroll-margin-top: 5.5rem;
			}
			.prose :global(h3) {
				font-size: 1.2rem;
				letter-spacing: -0.01em;
				margin: 2.25rem 0 0.65rem;
				scroll-margin-top: 5.5rem;
			}
			.prose :global(p) {
				color: #d5d9e0;
				margin: 0 0 1.1rem;
			}
			.prose :global(ol),
			.prose :global(ul) {
				padding-left: 1.4rem;
			}
			.prose :global(li) {
				color: #d5d9e0;
				margin: 0.45rem 0;
				padding-left: 0.15rem;
			}
			.prose :global(a) {
				color: var(--accent-text);
				text-decoration: underline;
				text-decoration-color: rgba(255, 93, 114, 0.4);
				text-underline-offset: 0.18em;
			}
			.prose :global(a:hover) {
				text-decoration-color: currentColor;
			}
			.prose :global(code) {
				background: var(--code-bg);
				border: 1px solid var(--border);
				border-radius: 0.375rem;
				padding: 0.125rem 0.375rem;
				font-size: 0.85em;
			}
			.prose :global(pre code) {
				background: transparent;
				border: none;
				padding: 0;
				font-size: inherit;
			}
			/* Every fenced block in the docs is wrapped in CodeBlock (the copy-button
			   panel) or PackageInstall, each of which owns its own margin and zeroes
			   its inner <pre>. So the block spacing lives on the wrapper — there is
			   deliberately no `.prose pre` margin: it would leak past the wrappers
			   (higher specificity than their scoped `margin: 0`) and, inside their
			   overflow-hidden frames, show as stray space under the code. */
			.prose :global(.codeblock) {
				margin: 0 0 1.4rem;
			}
			.prose :global(blockquote) {
				border-left: 3px solid var(--accent);
				margin: 0 0 1rem;
				padding: 0.25rem 0 0.25rem 1rem;
				color: var(--text-secondary);
			}
			.prose :global(.doc-callout) {
				position: relative;
				margin: 1.4rem 0;
				padding: 1rem 1.15rem 1rem 3.25rem;
				border: 1px solid var(--border);
				border-radius: 0.9rem;
				background: rgba(255, 255, 255, 0.035);
			}
			.prose :global(.doc-callout::before) {
				position: absolute;
				left: 1.15rem;
				top: 1.05rem;
				display: grid;
				place-items: center;
				width: 1.35rem;
				height: 1.35rem;
				border-radius: 999px;
				font-size: 0.76rem;
				font-weight: 900;
			}
			.prose :global(.doc-callout.note) {
				border-color: rgba(114, 156, 255, 0.28);
				background: rgba(75, 115, 205, 0.1);
			}
			.prose :global(.doc-callout.note::before) {
				content: 'i';
				background: rgba(114, 156, 255, 0.2);
				color: #a9c2ff;
			}
			.prose :global(.doc-callout.important) {
				border-color: rgba(255, 180, 65, 0.3);
				background: rgba(191, 126, 30, 0.11);
			}
			.prose :global(.doc-callout.important::before) {
				content: '!';
				background: rgba(255, 180, 65, 0.2);
				color: #ffc56d;
			}
			.prose :global(.doc-callout.tip) {
				border-color: rgba(99, 211, 145, 0.28);
				background: rgba(52, 151, 94, 0.1);
			}
			.prose :global(.doc-callout.tip::before) {
				content: '✓';
				background: rgba(99, 211, 145, 0.2);
				color: #7ee2a7;
			}
			.prose :global(.doc-callout-title) {
				margin: 0 0 0.2rem;
				color: var(--text);
				font-weight: 750;
			}
			.prose :global(.doc-callout p:last-child) {
				margin-bottom: 0;
			}
			.prose :global(.mental-model) {
				display: grid;
				grid-template-columns: 1fr auto 1fr auto 1fr;
				align-items: center;
				gap: 0.65rem;
				margin: 1.4rem 0 1.6rem;
			}
			.prose :global(.mental-model > div) {
				min-width: 0;
				padding: 1rem;
				border: 1px solid var(--border);
				border-radius: 0.85rem;
				background: var(--panel);
				text-align: center;
			}
			.prose :global(.mental-model span) {
				display: block;
				color: var(--text-secondary);
				font-size: 0.7rem;
				font-weight: 700;
				letter-spacing: 0.06em;
				text-transform: uppercase;
			}
			.prose :global(.mental-model strong) {
				display: block;
				margin-top: 0.2rem;
				color: var(--text);
				font-size: 0.9rem;
			}
			.prose :global(.mental-model .mental-model-arrow) {
				color: var(--accent-text);
				font-size: 1.2rem;
			}
			.prose :global(.topic-grid) {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 0.75rem;
				margin: 1.75rem 0 0;
			}
			.prose :global(.topic-grid a) {
				display: grid;
				grid-template-columns: auto minmax(0, 1fr);
				gap: 0.1rem 0.75rem;
				padding: 1rem;
				border: 1px solid var(--border);
				border-radius: 0.9rem;
				background: rgba(255, 255, 255, 0.025);
				color: var(--text);
				text-decoration: none;
				transition:
					background 0.15s,
					border-color 0.15s,
					transform 0.15s;
			}
			.prose :global(.topic-grid a:hover) {
				border-color: rgba(255, 93, 114, 0.4);
				background: rgba(255, 65, 90, 0.07);
				transform: translateY(-1px);
			}
			.prose :global(.topic-number) {
				grid-row: 1 / 3;
				color: var(--accent-text);
				font-family: 'SF Mono', SFMono-Regular, ui-monospace, monospace;
				font-size: 0.72rem;
				font-weight: 700;
			}
			.prose :global(.topic-grid strong) {
				font-size: 0.95rem;
			}
			.prose :global(.topic-grid strong + span) {
				color: var(--text-secondary);
				font-size: 0.82rem;
				line-height: 1.4;
			}
			.prose :global(details.deep-dive),
			.prose :global(details.challenge) {
				margin: 1.4rem 0;
				border: 1px solid var(--border);
				border-radius: 0.9rem;
				background: rgba(255, 255, 255, 0.025);
				overflow: hidden;
			}
			.prose :global(details.deep-dive) {
				border-color: rgba(176, 125, 255, 0.3);
				background: rgba(116, 74, 180, 0.09);
			}
			.prose :global(details summary) {
				padding: 0.9rem 1rem;
				color: var(--text);
				font-weight: 700;
				cursor: pointer;
			}
			.prose :global(details summary:hover) {
				background: rgba(255, 255, 255, 0.035);
			}
			.prose :global(details > div) {
				padding: 0 1rem 0.1rem;
				border-top: 1px solid var(--border);
			}
			.prose :global(details > div p:first-child) {
				margin-top: 1rem;
			}
			.prose :global(.api-index-grid),
			.prose :global(.doc-card-grid) {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 0.85rem;
				margin: 1.5rem 0;
			}
			.prose :global(.api-index-card),
			.prose :global(.doc-card) {
				padding: 1.1rem;
				border: 1px solid var(--border);
				border-radius: 0.9rem;
				background: rgba(255, 255, 255, 0.025);
			}
			.prose :global(.api-index-card h3),
			.prose :global(.doc-card h3) {
				margin: 0 0 0.85rem;
				font-size: 1rem;
			}
			.prose :global(.api-index-card ul),
			.prose :global(.doc-card ul) {
				list-style: none;
				margin: 0;
				padding: 0;
			}
			.prose :global(.api-index-card li),
			.prose :global(.doc-card li) {
				display: block;
				margin: 0;
				padding: 0.55rem 0;
				border-top: 1px solid rgba(255, 255, 255, 0.06);
			}
			.prose :global(.api-index-card li:first-child),
			.prose :global(.doc-card li:first-child) {
				padding-top: 0;
				border-top: none;
			}
			.prose :global(.api-index-card li:last-child),
			.prose :global(.doc-card li:last-child) {
				padding-bottom: 0;
			}
			.prose :global(.api-index-card li > code),
			.prose :global(.doc-card li > code) {
				display: inline-block;
				margin: 0 0 0.2rem;
				color: #ff8b9b;
			}
			.prose :global(.api-index-card li > a),
			.prose :global(.doc-card li > a) {
				display: inline-block;
				margin: 0 0 0.2rem;
				text-decoration: none;
			}
			.prose :global(.api-index-card li > a code),
			.prose :global(.doc-card li > a code) {
				color: #ff8b9b;
			}
			.prose :global(.api-index-card li > span),
			.prose :global(.doc-card li > span) {
				display: block;
				color: var(--text-secondary);
				font-size: 0.82rem;
				line-height: 1.45;
			}
			.prose :global(.table-scroll) {
				width: 100%;
				overflow-x: auto;
				margin: 0 0 1.4rem;
				border: 1px solid var(--border);
				border-radius: 0.8rem;
			}
			.prose :global(table) {
				border-collapse: separate;
				border-spacing: 0;
				width: 100%;
				font-size: 0.9rem;
			}
			.prose :global(thead) {
				background: rgba(255, 255, 255, 0.04);
			}
			.prose :global(th) {
				text-align: left;
				color: var(--text);
				border-bottom: 1px solid rgba(255, 255, 255, 0.15);
				padding: 0.65rem 0.8rem;
			}
			.prose :global(td) {
				border-bottom: 1px solid rgba(255, 255, 255, 0.06);
				padding: 0.65rem 0.8rem;
				color: #d5d9e0;
				vertical-align: top;
			}
			.prose :global(tr:last-child td) {
				border-bottom: none;
			}
			.prose :global(hr) {
				border: none;
				border-top: 1px solid var(--border);
				margin: 2rem 0;
			}
			.prose :global(strong) {
				color: var(--text);
			}
			.doc-pagination {
				display: grid;
				grid-template-columns: repeat(2, minmax(0, 1fr));
				gap: 0.85rem;
				margin: 3.5rem 0 0;
				padding-top: 1.5rem;
				border-top: 1px solid var(--border);
			}
			.doc-pagination :global(a.pagination-link) {
				display: flex;
				flex-direction: column;
				gap: 0.15rem;
				min-width: 0;
				padding: 0.9rem 1rem;
				border: 1px solid var(--border);
				border-radius: 0.85rem;
				background: rgba(255, 255, 255, 0.025);
				color: var(--text);
				text-decoration: none;
			}
			.doc-pagination :global(a.pagination-link:hover) {
				border-color: rgba(255, 93, 114, 0.4);
				background: rgba(255, 65, 90, 0.07);
			}
			.doc-pagination :global(a.pagination-link.next) {
				grid-column: 2;
				text-align: right;
			}
			.doc-pagination :global(a.pagination-link span) {
				color: var(--text-secondary);
				font-size: 0.75rem;
				font-weight: 650;
			}
			.doc-pagination :global(a.pagination-link strong) {
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}
			.doc-missing :global(h1) {
				margin-top: 2rem;
			}
			@media (max-width: 640px) {
				.prose :global(.mental-model) {
					grid-template-columns: 1fr;
				}
				.prose :global(.mental-model .mental-model-arrow) {
					transform: rotate(90deg);
				}
				.prose :global(.topic-grid),
				.prose :global(.api-index-grid),
				.prose :global(.doc-card-grid) {
					grid-template-columns: 1fr;
				}
				.doc-pagination {
					grid-template-columns: 1fr;
				}
				.doc-pagination :global(a.pagination-link.next) {
					grid-column: 1;
				}
			}
		</style>
	</>
}
