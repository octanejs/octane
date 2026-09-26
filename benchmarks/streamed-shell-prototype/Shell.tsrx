import { LiveCounter } from './LiveCounter.tsrx';
import { sharedLabel } from './shared.ts';
import { shellSummary } from './shell-only.ts';

export function Shell(props: { name: string }) @{
	const summary = shellSummary(props.name);
	<main data-shell>
		<header>
			<p data-shell-eyebrow>{sharedLabel('document') as string}</p>
			<h1>A server-authored page with a live child</h1>
			<p data-shell-summary>{summary as string}</p>
		</header>
		<nav aria-label="Sample navigation">
			<a href="/overview">Overview</a>
			<a href="/details">Details</a>
		</nav>
		<article>
			<h2>Content retained from the server</h2>
			<p>This text and its surrounding elements do not change after the page loads.</p>
			<div data-live-slot>
				<LiveCounter />
				<p data-static-sibling>Static sibling after the live child</p>
			</div>
		</article>
		<footer>Static document footer</footer>
	</main>
}
