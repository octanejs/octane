// One documentation page: look the slug up in the registry and render its
// compiled MDX document. The markdown-generated elements belong to the MDX
// component, so the typography is applied through :global() descendant holes
// under the scoped .prose wrapper.
import { useParams } from '@octanejs/router';
import { findDoc } from '../content/docs.ts';

export function DocPage() @{
	const params = useParams({ strict: false }) as { slug?: string };
	const doc = findDoc(params.slug);
	const Doc = doc ? doc.component : null;

	<article class="prose">
		@if (Doc) {
			<Doc />
		} @else {
			<div class="doc-missing">
				<h1>Document not found</h1>
				<p>
					{'No document named “' + params.slug + '”.' as string}
				</p>
			</div>
		}
		<style>
			.prose {
				max-width: 46rem;
			}
			.prose :global(h1) {
				font-size: 2.5rem;
				letter-spacing: -0.03em;
				line-height: 1.15;
				margin: 0 0 1rem;
			}
			.prose :global(h2) {
				font-size: 1.5rem;
				letter-spacing: -0.02em;
				margin: 2.5rem 0 0.75rem;
				padding-top: 1.5rem;
				border-top: 1px solid rgba(255, 255, 255, 0.08);
			}
			.prose :global(h3) {
				font-size: 1.15rem;
				margin: 2rem 0 0.5rem;
			}
			.prose :global(p) {
				color: #d5d9e0;
				margin: 0 0 1rem;
			}
			.prose :global(li) {
				color: #d5d9e0;
				margin: 0.35rem 0;
			}
			.prose :global(a) {
				color: #ff5d72;
			}
			.prose :global(code) {
				background: #16181d;
				border: 1px solid rgba(255, 255, 255, 0.08);
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
			.prose :global(pre) {
				margin: 0 0 1.25rem;
			}
			.prose :global(blockquote) {
				border-left: 3px solid #ff415a;
				margin: 0 0 1rem;
				padding: 0.25rem 0 0.25rem 1rem;
				color: #99a1b3;
			}
			.prose :global(table) {
				border-collapse: collapse;
				width: 100%;
				display: block;
				overflow-x: auto;
				font-size: 0.925rem;
				margin: 0 0 1.25rem;
			}
			.prose :global(th) {
				text-align: left;
				color: #f4eee8;
				border-bottom: 1px solid rgba(255, 255, 255, 0.15);
				padding: 0.5rem 0.75rem;
			}
			.prose :global(td) {
				border-bottom: 1px solid rgba(255, 255, 255, 0.06);
				padding: 0.5rem 0.75rem;
				color: #d5d9e0;
				vertical-align: top;
			}
			.prose :global(hr) {
				border: none;
				border-top: 1px solid rgba(255, 255, 255, 0.1);
				margin: 2rem 0;
			}
			.prose :global(strong) {
				color: #f4eee8;
			}
			.doc-missing :global(h1) {
				margin-top: 2rem;
			}
		</style>
	</article>
}
