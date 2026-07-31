import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

const EMPTY_STATE = {
	content: '',
	mode: 'streaming',
	mounted: false,
};

export function mountBenchmark(Renderer) {
	function App() {
		const [state, setState] = useState(EMPTY_STATE);

		window.__renderMarkdown = (content, mode = 'static') => {
			flushSync(() => setState({ content, mode, mounted: true }));
		};
		window.__unmountMarkdown = () => {
			flushSync(() => setState((current) => ({ ...current, mounted: false })));
		};
		window.__reset = () => {
			flushSync(() => setState(EMPTY_STATE));
		};

		return (
			<div className="bench-shell">
				{state.mounted ? <Renderer content={state.content} mode={state.mode} /> : null}
			</div>
		);
	}

	const root = createRoot(document.getElementById('main'));
	flushSync(() => root.render(<App />));
	window.__benchReady = true;
}
