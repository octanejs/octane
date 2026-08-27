import { autoUpdate, offset, useFloating } from '@octanejs/floating-ui';
import { createRoot } from 'octane';

function App() @{
	const floating = useFloating({
		placement: 'bottom-start',
		middleware: [offset(12)],
		whileElementsMounted: autoUpdate,
	});
	<div>
		<button
			id="reference"
			ref={floating.refs.setReference}
			style={{ position: 'absolute', left: '40px', top: '30px', width: '100px', height: '20px' }}
		>reference</button>
		<div
			id="floating"
			ref={floating.refs.setFloating}
			style={{ ...floating.floatingStyles, width: '60px', height: '30px' }}
			data-positioned={floating.isPositioned ? 'yes' : 'no'}
		>floating</div>
	</div>
}

createRoot(document.getElementById('app')!).render(<App />);
