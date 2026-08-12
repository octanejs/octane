import { createRoot, delegateEvents } from 'octane';

import { ReactSpringDemo } from '../../../../../playground/octane/src/demos/ReactSpring.tsrx';

delegateEvents(['click']);

function Harness() @{
	@if (window.location.hash === '#/react-spring') {
		<ReactSpringDemo />
	} @else {
		<main id="counter-route">{'Counter'}</main>
	}
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root');

const root = createRoot(rootElement);
const render = () => root.render(Harness);
window.addEventListener('hashchange', render);
render();
