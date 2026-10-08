// Page controls for the root-suspension browser fixture, shared by the
// production work lane (root-work.mjs) and the profile counter lane
// (profile-counters.mjs) so both drive and verify the same interaction.
// The function is serialized into the fixture entry; it must not close over
// anything in this module.
export function installControls() {
	const bridge = window.__suspenseHydration;
	const shape = new URLSearchParams(location.search).get('shape');
	const container = document.querySelector('#suspense-root');
	const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
	const check = (actual, expected, label) => {
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			throw new Error(
				`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
			);
		}
	};
	let input;
	let keep;
	let reader;
	let rootHost;
	let initialHtml;
	const markup = () => container.innerHTML.replace(/<!--[\s\S]*?-->/g, '');
	const snapshot = () => ({
		...bridge.snapshot(),
		readerSame: container.querySelector('#root-suspension-value') === reader,
		rootSame: container.firstElementChild === rootHost,
	});
	window.__rootPrepare = () => {
		input = container.querySelector('#root-suspension-input');
		keep = container.querySelector('[data-root-key="keep"]');
		reader = container.querySelector('#root-suspension-value');
		rootHost = container.firstElementChild;
		input.value = 'browser-owned draft';
		bridge.prepareInput();
		initialHtml = markup();
		window.__rootVerifyHold();
	};
	window.__rootHold = async () => {
		bridge.urgent();
		await frame();
	};
	window.__rootRetry = async () => {
		bridge.resolve();
		const deadline = performance.now() + 10000;
		while (bridge.snapshot().value !== 'B') {
			if (performance.now() > deadline) throw new Error('Root retry did not commit B');
			await frame();
		}
	};
	window.__rootVerifyHold = () => {
		const state = snapshot();
		const expected = {
			inputSame: true,
			inputConnected: true,
			activeId: 'root-suspension-input',
			inputValue: 'browser-owned draft',
			selectionStart: 2,
			selectionEnd: 9,
			keepSame: true,
			emptyCount: 0,
			value: 'A',
			replacementCount: 0,
			nativeEvents: [],
			lifecycle: ['input:mount'],
			globalFailures: [],
			readerSame: true,
			rootSame: true,
		};
		for (const [key, value] of Object.entries(expected))
			check(state[key], value, `${shape}/hold/${key}`);
		check(markup(), initialHtml, `${shape}/held DOM`);
		return { ...expected, markup: markup() };
	};
	window.__rootVerifyRetry = () => {
		const state = snapshot();
		const expected = {
			inputSame: false,
			inputConnected: false,
			keepSame: shape !== 'empty',
			emptyCount: shape === 'empty' ? 1 : 0,
			value: 'B',
			replacementCount: shape === 'keyed' || shape === 'empty' ? 0 : 1,
			lifecycle: ['input:mount', 'input:cleanup'],
			globalFailures: [],
			readerSame: shape !== 'root',
			rootSame: shape !== 'root',
		};
		for (const [key, value] of Object.entries(expected))
			check(state[key], value, `${shape}/retry/${key}`);
		return { ...expected, markup: markup() };
	};
	window.__rootCleanup = () => {
		bridge.unmount();
		const state = bridge.snapshot();
		check(container.childNodes.length, 0, `${shape}/unmount DOM`);
		check(state.lifecycle, ['input:mount', 'input:cleanup'], `${shape}/unmount lifetime`);
		check(state.globalFailures, [], `${shape}/unmount errors`);
	};
	window.__rootObserve = async (operation) => {
		const counts = {
			childListRecords: 0,
			addedNodes: 0,
			removedNodes: 0,
			attributeWrites: 0,
			characterDataWrites: 0,
			removedInputRanges: 0,
			removedKeepRanges: 0,
		};
		const record = (records) => {
			for (const mutation of records) {
				if (mutation.type === 'attributes') counts.attributeWrites++;
				else if (mutation.type === 'characterData') counts.characterDataWrites++;
				else {
					counts.childListRecords++;
					counts.addedNodes += mutation.addedNodes.length;
					counts.removedNodes += mutation.removedNodes.length;
					for (const node of mutation.removedNodes) {
						if (node === input || node.contains(input)) counts.removedInputRanges++;
						if (keep !== null && (node === keep || node.contains(keep))) counts.removedKeepRanges++;
					}
				}
			}
		};
		const observer = new MutationObserver(record);
		observer.observe(container, {
			subtree: true,
			childList: true,
			attributes: true,
			characterData: true,
		});
		try {
			await (operation === 'hold' ? window.__rootHold() : window.__rootRetry());
			record(observer.takeRecords());
		} finally {
			observer.disconnect();
		}
		const semantic = operation === 'hold' ? window.__rootVerifyHold() : window.__rootVerifyRetry();
		if (operation === 'hold') {
			check(counts.removedInputRanges, 0, `${shape}/held input removals`);
			check(counts.removedKeepRanges, 0, `${shape}/held survivor removals`);
		}
		return { counts, semantic };
	};
	window.__ready = bridge.kind === 'root-suspension';
}

export const adapterSource = `\n(${installControls.toString()})();\n`;
