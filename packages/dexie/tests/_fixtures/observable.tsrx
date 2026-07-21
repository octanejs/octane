import { useDocument, useObservable } from '@octanejs/dexie';

export function ObservableReader({
	observable,
	defaultResult,
}: {
	observable: any;
	defaultResult?: string;
}) @{
	const value = useObservable(observable, defaultResult ?? 'loading');
	<div id="value">{value as string}</div>
}

export function TwoReaders({ first, second }: { first: any; second: any }) @{
	const left = useObservable(first, 'left');
	const right = useObservable(second, 'right');
	<div>
		<span id="left">{left as string}</span>
		<span id="right">{right as string}</span>
	</div>
}

export function FactoryReader({ observable, version }: { observable: any; version: number }) @{
	const value = useObservable(() => observable, [version], 'loading');
	<div id="value">{value as string}</div>
}

export function DocumentReader({ doc, nonce: _nonce }: { doc: any; nonce?: number }) @{
	const provider = useDocument(doc);
	<div id="document">{provider?.doc?.id as string}</div>
}
