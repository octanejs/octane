import { useState } from 'octane';
import { resolveCompatType } from '@octanejs/react-compat';
import { CartControls, CartSummary } from './react/cart.tsx';
import { SignupForm } from './react/SignupForm.tsx';

// React components used at a `.tsrx` JSX site cross through resolveCompatType,
// which activates the compat hook dispatch for them. Everything below them
// (their own children, package internals) needs nothing — the aliased
// `react`/`react/jsx-runtime` imports handle it.
const Controls = resolveCompatType(CartControls);
const Summary = resolveCompatType(CartSummary);
const Signup = resolveCompatType(SignupForm);

export function App() @{
	const [clicks, setClicks] = useState(0);
	<main>
		<h1>{'React packages in Octane'}</h1>
		<p>{'An Octane app — no React installed — running unmodified jotai and react-hook-form through @octanejs/react-compat.'}</p>

		<section>
			<h2>{'Octane-native state'}</h2>
			<button class="octane-button" onClick={() => setClicks(clicks + 1)}>
				{'Compiled .tsrx counter: ' + clicks}
			</button>
		</section>

		<section>
			<h2>{'jotai — two islands, one atom'}</h2>
			<Controls />
			<Summary />
		</section>

		<section>
			<h2>{'react-hook-form — unmodified npm build'}</h2>
			<Signup />
		</section>
	</main>
}
