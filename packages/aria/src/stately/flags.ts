// Ported from react-stately (source: .react-spectrum/packages/react-stately/src/flags/flags.ts).
// Internal feature flags (upstream ships them under `react-stately/private/flags/flags`).

let _tableNestedRows = false;
let _shadowDOM = false;

export function enableTableNestedRows(): void {
	_tableNestedRows = true;
}

export function tableNestedRows(): boolean {
	return _tableNestedRows;
}

export function enableShadowDOM(): void {
	_shadowDOM = true;
}

export function shadowDOM(): boolean {
	return _shadowDOM;
}
