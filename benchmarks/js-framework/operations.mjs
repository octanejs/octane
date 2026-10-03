// The js-framework-benchmark operations and their browser-side gates, shared by
// the local runner (run.mjs) and the paired pull request harness (pair.mjs) so
// both drive exactly the same work.

export const ROW_COUNT = 1000;
export const ROW_COUNT_LARGE = 10000; // matches the canonical suite's runlots / clear table size

export const CANONICAL_OPS = [
	{ name: 'run', pre: 'empty', click: '#run' },
	{ name: 'replace', pre: 'rows', click: '#run' },
	// Canonical krausest "append 1,000 rows to a table of 1,000 rows". The
	// next op's ensureState sees 2000 rows ≠ 1000 and rebuilds via #run.
	{ name: 'add', pre: 'rows', click: '#add' },
	{ name: 'update', pre: 'rows', click: '#update' },
	{
		name: 'select',
		pre: 'rows',
		click: 'tbody tr:nth-child(5) td:nth-child(2) a',
		alternateClick: 'tbody tr:nth-child(6) td:nth-child(2) a',
	},
	{ name: 'swap', pre: 'rows', click: '#swaprows' },
	{ name: 'remove', pre: 'rows', click: 'tbody tr:nth-child(5) td:nth-child(3) a' },
	{ name: 'runlots', pre: 'empty', click: '#runlots' },
	{
		name: 'select_lots',
		pre: 'rows-large',
		click: 'tbody tr:nth-child(5000) td:nth-child(2) a',
		alternateClick: 'tbody tr:nth-child(5001) td:nth-child(2) a',
	},
	// Canonical js-framework-benchmark `clear` measures clearing the
	// 10K-row table that `runlots` populated — NOT the 1K-row table from
	// `run`. The previous `pre: 'rows'` rebuilt 1K rows before the timed
	// click, so reported numbers were ~10x too fast and not comparable to
	// the upstream suite. Use `rows-large` to ensure the 10K state first.
	{ name: 'clear', pre: 'rows-large', click: '#clear' },
];

// Mount optimizations must retain ordinary live-parent insertion semantics.
export const DIRECT_LIST_MOUNTS = [
	{ name: '1k', button: 'run', initialRows: 0, addedRows: ROW_COUNT },
	{ name: '10k', button: 'runlots', initialRows: 0, addedRows: ROW_COUNT_LARGE },
	{ name: 'append_1k', button: 'add', initialRows: ROW_COUNT, addedRows: ROW_COUNT },
	{
		name: 'prepend_100',
		button: 'prepend100',
		initialRows: ROW_COUNT,
		addedRows: 100,
		insertion: 'prepend',
	},
	{ name: 'append_100', button: 'append100', initialRows: ROW_COUNT, addedRows: 100 },
	{
		name: 'middle_100',
		button: 'insertmid100',
		initialRows: ROW_COUNT,
		addedRows: 100,
		insertion: 'middle',
	},
];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Use the same data stream for every target. Label generation is inside the
// measured create operations, so uncontrolled randomness would add dialect
// noise through different string lengths and allocation patterns.
export const seedRandom = (page) =>
	page.evaluate(() => {
		let state = 0x5eed5eed >>> 0;
		Math.random = () => {
			state = (state + 0x6d2b79f5) | 0;
			let value = Math.imul(state ^ (state >>> 15), 1 | state);
			value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
			return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
		};
	});

export async function ensureState(page, pre) {
	if (pre === 'empty') {
		await page.evaluate(() => {
			const btn = document.getElementById('clear');
			if (btn) btn.click();
		});
		await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 0, {
			timeout: 5000,
		});
	} else if (pre === 'rows') {
		const cnt = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
		if (cnt !== ROW_COUNT) {
			await page.evaluate(() => document.getElementById('run').click());
			await page.waitForFunction(
				(n) => document.querySelectorAll('tbody tr').length === n,
				ROW_COUNT,
				{ timeout: 5000 },
			);
		}
	} else if (pre === 'rows-large') {
		const cnt = await page.evaluate(() => document.querySelectorAll('tbody tr').length);
		if (cnt !== ROW_COUNT_LARGE) {
			await page.evaluate(() => document.getElementById('runlots').click());
			await page.waitForFunction(
				(n) => document.querySelectorAll('tbody tr').length === n,
				ROW_COUNT_LARGE,
				{ timeout: 5000 },
			);
		}
	}
	await sleep(20);
}

// Time `repeat` clicks and their DOM commits without adding a frame or paint
// wait, and return the elapsed milliseconds for all of them. A gc() right
// before each sample keeps a surprise collection from inflating it.
//
// Click i targets selectors[i % selectors.length], so a repeated selection
// alternates rows and every click does real work. Targets are resolved before
// the timed window, except `remove`, whose target is the new fifth row each time.
//
// Targets that schedule a later commit expose window.__benchFlush: Octane uses
// public flushSync and Vue awaits nextTick. The call stays in the timed window.
// Verify the resulting DOM after t1, before any further async work, so this
// semantic gate cannot inflate the timing or accidentally observe a later commit.
export async function timeClick(page, op, selectors, repeat = 1) {
	return await page.evaluate(
		async ({ op, selectors, repeat }) => {
			const query = (selector) => {
				const el = document.querySelector(selector);
				if (!el) throw new Error('selector not found: ' + selector);
				return el;
			};
			const targets = op === 'remove' ? null : selectors.map(query);
			const first = targets ? targets[0] : query(selectors[0]);
			const last = targets ? targets[(repeat - 1) % targets.length] : null;
			const tbody = document.querySelector('tbody');
			const firstRow = tbody?.querySelector('tr');
			const secondRow = op === 'swap' ? tbody?.rows[1] : null;
			const removedRow = op === 'remove' ? first.closest('tr') : null;
			const oldLabel =
				op === 'update' ? firstRow?.querySelector('td:nth-child(2) a')?.textContent : null;
			const flush = window.__benchFlush;
			(window.gc || (() => {}))();
			void document.body?.offsetHeight;
			const t0 = performance.now();
			for (let i = 0; i < repeat; i++) {
				(targets ? targets[i % targets.length] : query(selectors[0])).click();
				if (flush) await flush();
			}
			const elapsed = performance.now() - t0;
			const expectedRows = {
				run: 1000,
				replace: 1000,
				add: 2000,
				update: 1000,
				select: 1000,
				swap: 1000,
				remove: 1000 - repeat,
				runlots: 10000,
				select_lots: 10000,
				clear: 0,
				clear_1k: 0,
			}[op];
			if (tbody?.rows.length !== expectedRows) {
				throw new Error(
					`${op}: commit was not inside timed click (expected ${expectedRows} rows, found ${tbody?.rows.length})`,
				);
			}
			// An even number of swaps restores the original order, so callers that
			// need the swap verified repeat it an odd number of times.
			const swappedRow = repeat % 2 === 1 ? tbody.rows[998] : tbody.rows[1];
			if (
				(op === 'replace' && firstRow === tbody.rows[0]) ||
				(op === 'update' &&
					oldLabel === tbody.rows[0]?.querySelector('td:nth-child(2) a')?.textContent) ||
				(op === 'swap' && secondRow !== swappedRow) ||
				(op === 'remove' && removedRow?.isConnected) ||
				((op === 'select' || op === 'select_lots') &&
					!last.closest('tr')?.classList.contains('danger'))
			) {
				throw new Error(`${op}: the expected DOM change was not committed inside the timed click`);
			}
			return elapsed;
		},
		{ op: op.name, selectors, repeat },
	);
}

export async function verifySelection(page, selector) {
	await page.evaluate((selector) => {
		const expected = document.querySelector(selector)?.closest('tr');
		const selected = document.querySelectorAll('tbody tr.danger');
		if (expected && selected.length === 1 && selected[0] === expected) return;

		const rowId = (row) => row.querySelector('td')?.textContent || '(missing id)';
		throw new Error(
			'selection gate failed: expected only ' +
				(expected ? rowId(expected) : '(missing row)') +
				', found ' +
				(Array.from(selected, rowId).join(', ') || '(none)'),
		);
	}, selector);
}

// Mount optimizations must retain ordinary live-parent insertion semantics.
// Keep browser-visible instrumentation entirely outside every timed sample.
export async function verifyDirectListMount(page, operation) {
	await ensureState(page, operation.initialRows === 0 ? 'empty' : 'rows');
	return await page.evaluate(async (operation) => {
		const tbody = document.querySelector('tbody');
		if (!tbody?.isConnected) throw new Error('mount gate: missing connected table body');
		const before = Array.from(tbody.querySelectorAll('tr'));
		if (before.length !== operation.initialRows) {
			throw new Error(`mount gate: expected ${operation.initialRows} initial rows`);
		}
		const rowId = (row) => Number(row.firstElementChild?.textContent);
		const survivors = new Map(before.map((row) => [rowId(row), row]));

		const work = { liveParentInsertions: 0, fragmentCommits: 0, fragmentRows: 0 };
		const originals = [];
		const instrument = (prototype, name) => {
			const original = prototype[name];
			if (typeof original !== 'function') return;
			originals.push([prototype, name, original]);
			prototype[name] = function (...args) {
				if (this === tbody) {
					work.liveParentInsertions++;
					for (const node of args) {
						if (node?.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
							work.fragmentCommits++;
							work.fragmentRows += node.querySelectorAll('tr').length;
						}
					}
				}
				return Reflect.apply(original, this, args);
			};
		};
		for (const name of ['insertBefore', 'appendChild', 'replaceChild']) {
			instrument(Node.prototype, name);
		}
		for (const name of ['append', 'prepend', 'replaceChildren']) {
			instrument(Element.prototype, name);
		}

		try {
			const button = document.getElementById(operation.button);
			if (!button) throw new Error(`mount gate: missing #${operation.button}`);
			button.click();
			if (window.__benchFlush) await window.__benchFlush();
		} finally {
			for (const [prototype, name, original] of originals.reverse()) {
				prototype[name] = original;
			}
		}

		const rows = Array.from(tbody.querySelectorAll('tr'));
		const expectedRows = operation.initialRows + operation.addedRows;
		if (rows.length !== expectedRows) {
			throw new Error(`mount gate: expected ${expectedRows} rows, found ${rows.length}`);
		}
		const insertionIndex =
			operation.insertion === 'prepend'
				? 0
				: operation.insertion === 'middle'
					? operation.initialRows >> 1
					: operation.initialRows;
		const inserted = rows.slice(insertionIndex, insertionIndex + operation.addedRows);
		const firstInsertedId = rowId(inserted[0]);
		if (!Number.isSafeInteger(firstInsertedId)) throw new Error('mount gate: invalid row id');
		let survivorIndex = 0;
		for (let index = 0; index < rows.length; index++) {
			const row = rows[index];
			const id = rowId(row);
			const isInserted = index >= insertionIndex && index < insertionIndex + operation.addedRows;
			if (!row.isConnected || !Number.isSafeInteger(id)) {
				throw new Error(`mount gate: incorrect row identity or connectivity at ${index}`);
			}
			if (isInserted) {
				if (survivors.has(id) || id !== firstInsertedId + index - insertionIndex) {
					throw new Error(`mount gate: incorrect inserted-row order at ${index}`);
				}
			} else if (row !== before[survivorIndex++] || survivors.get(id) !== row) {
				throw new Error(`mount gate: survivor order or DOM identity changed at ${index}`);
			}
		}
		if (survivorIndex !== before.length) throw new Error('mount gate: missing surviving rows');

		const selectedRow = inserted[Math.min(4, inserted.length - 1)];
		const action = selectedRow.querySelector('td:nth-child(2) a');
		if (!action) throw new Error('mount gate: missing row action');
		action.click();
		if (window.__benchFlush) await window.__benchFlush();
		const selected = tbody.querySelectorAll('tr.danger');
		if (selected.length !== 1 || selected[0] !== selectedRow) {
			throw new Error('mount gate: inserted-row identity, delegated event, or selection failed');
		}

		if (work.liveParentInsertions !== operation.addedRows || work.fragmentCommits !== 0) {
			throw new Error(
				`mount gate: ${operation.name} required ${operation.addedRows} direct row insertions; ` +
					`got ${work.liveParentInsertions} live-parent insertions, ` +
					`${work.fragmentCommits} fragment commits, ${work.fragmentRows} fragment rows`,
			);
		}
		return work;
	}, operation);
}
