import { useState } from 'octane';
import { MemoryRouter, Routes, Route } from '@octanejs/remix-router';

// Regression fixture for the PR-46 Bugbot finding: block-children <Route>
// registration re-runs every commit, and an INLINE loader/action prop has a
// fresh function identity each pass. That must not count as a material
// collector change — previously each commit bumped the collector, re-rendered
// <Routes>, re-registered with yet another fresh function, and spun.

export function InlineLoaderApp(props) @{
	const [version, setVersion] = useState(0);
	props.log('render:' + version);
	<div>
		<button id="bump" onClick={() => setVersion(version + 1)}>{'bump'}</button>
		<MemoryRouter initialEntries={['/']}>
			<Routes>
				<Route path="/" loader={() => 'v' + version} element={<span id="home">{'home'}</span>} />
				<Route path="/other" element={<span>{'other'}</span>} />
			</Routes>
		</MemoryRouter>
	</div>
}
