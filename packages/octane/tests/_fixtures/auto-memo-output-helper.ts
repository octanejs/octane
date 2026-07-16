import { createElement } from 'octane';
import {
	AutoMemoNestedCustomOutput,
	AutoMemoNestedDefaultOutput,
	AutoMemoOpaqueOutputRow,
	AutoMemoOutputRow,
	AutoMemoProxyOutput,
	AutoMemoUnsafeCalculationOutput,
} from './auto-memo-output-child.tsrx';

const revoked = Proxy.revocable({}, {});
revoked.revoke();

export function buildAutoMemoOutput(items: Array<{ id: number; label: string }>) {
	return items.map((item) =>
		createElement(AutoMemoOutputRow, {
			key: item.id,
			id: item.id,
			label: item.label,
		}),
	);
}

export function buildAutoMemoOpaqueOutput(items: Array<{ id: number; label: string }>) {
	return items.map((item) =>
		createElement(AutoMemoOpaqueOutputRow, {
			key: item.id,
			label: item.label,
		}),
	);
}

export function buildAutoMemoNestedOutput(items: Array<{ id: number; label: string }>) {
	return items.slice(0, 1).map((item) =>
		createElement(AutoMemoNestedDefaultOutput, {
			key: item.id,
			children: createElement(AutoMemoNestedCustomOutput, { label: item.label }),
		}),
	);
}

export function buildAutoMemoProxyOutput(items: Array<{ id: number; label: string }>) {
	return items.slice(0, 1).map((item) =>
		createElement(AutoMemoProxyOutput, {
			key: item.id,
			label: item.label,
			data: revoked.proxy,
		}),
	);
}

export function buildAutoMemoSafetyTransitionOutput(unsafe: boolean) {
	return unsafe ? createElement(AutoMemoUnsafeCalculationOutput, {}) : 'safe';
}
