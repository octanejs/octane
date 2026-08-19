// Passed directly to page.evaluate. All observation lives outside the authored
// component, so counting label reads cannot change the compiler's purity proof.
export function runSelectionScenario({ component, rowCount, observed }) {
	const api = globalThis.__octaneSelectionWork;
	const container = document.createElement('div');
	document.body.appendChild(container);
	const root = api.createRoot(container);
	const counts = {};
	const semantics = [];
	let setters;
	let labelReads = 0;
	let identities = new Map();
	let expected = Array.from({ length: rowCount }, (_, index) => ({
		id: index + 1,
		label: `row ${index + 1}`,
	}));
	let selected = null;

	function check(condition, message) {
		if (!condition) throw new Error(`${component}/${rowCount}: ${message}`);
	}

	function makeRow(row) {
		if (!observed) return { id: row.id, label: row.label };
		const label = row.label;
		return {
			id: row.id,
			get label() {
				labelReads++;
				return label;
			},
		};
	}

	function verify(name) {
		const actual = Array.from(container.querySelectorAll('tbody tr'));
		check(actual.length === expected.length, `${name}: incorrect row count`);
		let checksum = 2166136261;
		const selectedIds = [];
		for (let index = 0; index < actual.length; index++) {
			const node = actual[index];
			const row = expected[index];
			const cells = node.querySelectorAll('td');
			const className = row.id === selected ? 'selected' : '';
			check(cells.length === 2, `${name}: row ${row.id} lost a cell`);
			check(cells[0].textContent === String(row.id), `${name}: incorrect id at ${index}`);
			check(cells[1].textContent === row.label, `${name}: incorrect label for ${row.id}`);
			check(node.className === className, `${name}: incorrect selected class for ${row.id}`);
			if (identities.has(row.id)) {
				check(identities.get(row.id) === node, `${name}: row ${row.id} lost DOM identity`);
			}
			if (className !== '') selectedIds.push(row.id);
			const text = `${row.id}\0${row.label}\0${className}\0`;
			for (let i = 0; i < text.length; i++) {
				checksum = Math.imul(checksum ^ text.charCodeAt(i), 16777619);
			}
		}
		semantics.push({ name, rows: actual.length, selectedIds, checksum: checksum >>> 0 });
		return actual;
	}

	function commit(name, update) {
		labelReads = 0;
		api.flushSync(update);
		counts[name] = labelReads;
		return verify(name);
	}

	function select(name, id) {
		selected = id;
		return commit(name, () => setters.setSelected(id));
	}

	try {
		api.flushSync(() => {
			root.render(api[component], {
				selectedClass: 'selected',
				onMounted(value) {
					setters = value;
				},
			});
		});
		api.drainPassiveEffects();
		check(setters !== undefined, 'mount did not expose its state setters');

		let rows = expected.map(makeRow);
		const mounted = commit('mount', () => setters.setRows(rows));
		identities = new Map(expected.map((row, index) => [row.id, mounted[index]]));
		const first = expected[Math.floor(rowCount / 2)].id;
		const second = expected[(Math.floor(rowCount / 2) + 1) % rowCount].id;
		select('select_first', first);
		select('reselect', first);
		select('select_another', second);
		select('reset', null);
		select('reset_again', null);

		labelReads = 0;
		for (let i = 0; i < 16; i++) {
			selected = i % 2 === 0 ? first : second;
			api.flushSync(() => setters.setSelected(selected));
			verify(`alternate_${i}`);
		}
		counts.alternate_cycle = labelReads;

		// A real data change must still run ordinary reconciliation. The selected
		// row survives by key, updates its label, then survives a full reorder.
		expected = expected.map((row) =>
			row.id === second ? { id: row.id, label: row.label + ' updated' } : row,
		);
		rows = rows.map((row, index) => (row.id === second ? makeRow(expected[index]) : row));
		commit('label_replacement', () => setters.setRows(rows));
		expected = expected.toReversed();
		rows = rows.toReversed();
		commit('reorder', () => setters.setRows(rows));
		select('select_after_reorder', first);
		select('reset_after_reorder', null);

		const removed = Array.from(identities.values());
		expected = [];
		commit('clear', () => setters.setRows([]));
		check(
			removed.every((node) => !node.isConnected),
			'clear left an old row connected',
		);
		identities = new Map();
		expected = Array.from({ length: rowCount }, (_, index) => ({
			id: index + 1,
			label: `refilled row ${index + 1}`,
		}));
		rows = expected.map(makeRow);
		const refilled = commit('refill', () => setters.setRows(rows));
		identities = new Map(expected.map((row, index) => [row.id, refilled[index]]));
		select('select_after_refill', second);
		select('reset_after_refill', null);
	} finally {
		root.unmount();
		api.drainPassiveEffects();
		check(container.childNodes.length === 0, 'unmount left managed DOM behind');
		container.remove();
	}

	return { counts, semantics };
}
