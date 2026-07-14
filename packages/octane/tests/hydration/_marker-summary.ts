type ProtocolMarker = {
	data: string;
	kind: 'open' | 'close';
	multiplicity: number;
};

function protocolMarker(data: string): ProtocolMarker | null {
	if (data === '[') return { data, kind: 'open', multiplicity: 1 };
	if (data === '[f0' || data === '[f1') return { data, kind: 'open', multiplicity: 1 };
	if (data === ']') return { data, kind: 'close', multiplicity: 1 };
	const match = /^(\[|\])([1-9]\d*)$/.exec(data);
	if (match === null) return null;
	const multiplicity = Number(match[2]);
	if (!Number.isSafeInteger(multiplicity) || multiplicity < 2) return null;
	return {
		data,
		kind: match[1] === '[' ? 'open' : 'close',
		multiplicity,
	};
}

/** Summarize legacy and counted hydration comments while validating balance. */
export function hydrationMarkerSummary(root: Node) {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
	const markers: ProtocolMarker[] = [];
	let node: Node | null;
	while ((node = walker.nextNode()) !== null) {
		const marker = protocolMarker((node as Comment).data);
		if (marker !== null) markers.push(marker);
	}

	let logicalPairs = 0;
	const stack: number[] = [];
	for (const marker of markers) {
		if (marker.kind === 'open') {
			stack.push(marker.multiplicity);
			logicalPairs += marker.multiplicity;
			continue;
		}
		const openMultiplicity = stack.pop();
		if (openMultiplicity !== marker.multiplicity) {
			throw new Error(
				`Unbalanced hydration marker ${marker.data}; matching open multiplicity was ${String(openMultiplicity)}`,
			);
		}
	}
	if (stack.length !== 0) throw new Error('Unclosed hydration marker');

	const opens = markers.filter((marker) => marker.kind === 'open');
	return {
		data: markers.map((marker) => marker.data),
		logicalPairs,
		physicalPairs: opens.length,
		countedPairs: opens.filter((marker) => marker.multiplicity > 1).length,
		singletonPairs: opens.filter((marker) => marker.multiplicity === 1).length,
	};
}
