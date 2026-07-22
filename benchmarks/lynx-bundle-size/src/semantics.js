export const LYNX_MODE_ROWS = Object.freeze([
	Object.freeze({ id: 'm9-alpha-key', label: 'M9 Alpha row', score: 3, token: 'm9-alpha-score-3' }),
	Object.freeze({ id: 'm9-bravo-key', label: 'M9 Bravo row', score: 5, token: 'm9-bravo-score-5' }),
	Object.freeze({
		id: 'm9-charlie-key',
		label: 'M9 Charlie row',
		score: 8,
		token: 'm9-charlie-score-8',
	}),
	Object.freeze({
		id: 'm9-delta-key',
		label: 'M9 Delta row',
		score: 13,
		token: 'm9-delta-score-13',
	}),
]);

export const LYNX_MODE_TITLE = 'Octane Lynx mode benchmark';

export function lynxModeChecksum(rows = LYNX_MODE_ROWS) {
	let checksum = 0;
	for (let index = 0; index < rows.length; index++) {
		const row = rows[index];
		checksum += (index + 1) * row.score;
		for (let offset = 0; offset < row.id.length; offset++) {
			checksum += row.id.charCodeAt(offset) * (index + 1);
		}
	}
	return checksum;
}

export function lynxModeVisibleSemanticMarkers() {
	return Object.freeze([
		'lynx-mode-shell',
		'lynx-mode-title',
		'lynx-mode-selection',
		'lynx-mode-checksum',
		LYNX_MODE_TITLE,
		'Selected: ',
		'Checksum: ',
		'lynx-mode-row-',
		...LYNX_MODE_ROWS.flatMap((row) => [row.id, row.label, row.token]),
	]);
}

export function lynxModeBackgroundSemanticMarkers() {
	return Object.freeze([...lynxModeVisibleSemanticMarkers(), 'lynx-mode-event-']);
}
