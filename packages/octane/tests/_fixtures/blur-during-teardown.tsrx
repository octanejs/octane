import { useState, useLayoutEffect } from 'octane';

// Regression fixture: Chrome fires `blur` SYNCHRONOUSLY inside removeChild when
// a focused element's subtree is torn down. The live ancestor's blur handler
// setState (and any already-queued work) must NOT flush re-entrantly mid-commit —
// the outer removal walk holds cached sibling pointers. The removed link's own
// handler belongs to the disposed branch and must not run at all.
export function NavApp() @{
	const [page, setPage] = useState('home');
	const [blurs, setBlurs] = useState(0);
	const [retiredBlurs, setRetiredBlurs] = useState(0);
	useLayoutEffect(() => {}, [page]);
	<div class="app" onBlur={() => setBlurs(blurs + 1)}>
		@if (page === 'home') {
			<>
				<section class="hero">
					<a href="#" class="lnk" onBlur={() => setRetiredBlurs(retiredBlurs + 1)}>{'home link'}</a>
				</section>
				<aside class="strip">{'strip'}</aside>
			</>
		} @else {
			<p class="docs">{'docs ' + blurs + ' ' + retiredBlurs}</p>
		}
		<button class="go" onClick={() => setPage('docs')}>{'go'}</button>
	</div>
}
