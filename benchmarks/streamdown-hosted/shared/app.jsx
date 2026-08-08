import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

const EMPTY_STATE = {
	content: '',
	mode: 'streaming',
	mounted: false,
};

// Keep the shared host's observable benchmark hooks compiler-compatible.
function exposeBenchmarkHook(name, handler) {
	window[name] = handler;
}

export function mountBenchmark(Renderer) {
	function App() {
		const [state, setState] = useState(EMPTY_STATE);

		exposeBenchmarkHook('__renderMarkdown', (content, mode = 'static') => {
			flushSync(() => setState({ content, mode, mounted: true }));
		});
		exposeBenchmarkHook('__unmountMarkdown', () => {
			flushSync(() => setState((current) => ({ ...current, mounted: false })));
		});
		exposeBenchmarkHook('__reset', () => {
			flushSync(() => setState(EMPTY_STATE));
		});

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
