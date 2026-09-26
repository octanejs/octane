import '../style.css';
import { LiveCounter } from './LiveCounter.tsrx';
import '../shell-side-effect.ts';

export function Shell() @{
	<main data-shell>
		<header>
			<h1>A server-authored page with a live child</h1>
			<p data-shell-summary>A server-authored introduction for Ada.</p>
		</header>
		<nav aria-label="Sample navigation">
			<a href="/overview">Overview</a>
			<a href="/details">Details</a>
		</nav>
		<article>
			<h2>Content retained from the server</h2>
			<p>This text and its surrounding elements do not change after the page loads.</p>
			<div>
				<LiveCounter />
			</div>
			<p data-static-sibling>Static sibling after the live child</p>
		</article>
		<footer>Static document footer</footer>
	</main>
}
