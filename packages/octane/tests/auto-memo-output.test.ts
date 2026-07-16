import { describe, expect, it } from 'vitest';
import { mount } from './_helpers';
import { AutoMemoOutputApp, AutoMemoOutputSafetyApp } from './_fixtures/auto-memo-output.tsrx';

function values(root: ReturnType<typeof mount>): string[] {
	return root.findAll('.output-value').map((node) => node.textContent ?? '');
}

function opaqueValues(root: ReturnType<typeof mount>): string[] {
	return root.findAll('.output-opaque-value').map((node) => node.textContent ?? '');
}

function nestedVersion(root: ReturnType<typeof mount>): number {
	return Number(root.find('.output-nested-value').textContent?.match(/(\d+)$/)?.[1]);
}

describe('imported render output', () => {
	it('reconciles safe to component to safe output from an imported calculation', () => {
		const root = mount(AutoMemoOutputSafetyApp);
		expect(root.find('#output-safety-value').textContent).toBe('safe');

		root.click('#output-safety-toggle');
		expect(root.find('#output-safety-value').textContent).toBe('unsafe');

		root.click('#output-safety-toggle');
		expect(root.find('#output-safety-value').textContent).toBe('safe');

		root.unmount();
	});

	it('preserves row identity and state while item and context values update', () => {
		const root = mount(AutoMemoOutputApp);
		const initialRows = root.findAll('.output-row');
		const initialOpaque = opaqueValues(root);
		const initialOpaqueVersion = Number(initialOpaque[0].split(':')[2]);
		expect(nestedVersion(root)).toBe(initialOpaqueVersion);
		expect(values(root)).toEqual(['t0:a:0', 't0:b:0']);
		expect(root.find('.output-proxy-value').textContent).toBe('proxy a');
		expect(initialOpaque).toEqual([`t0:a:${initialOpaqueVersion}`, `t0:b:${initialOpaqueVersion}`]);

		root.click('#output-tick');
		expect(root.findAll('.output-row')).toEqual(initialRows);
		expect(values(root)).toEqual(['t0:a:0', 't0:b:0']);
		// The imported non-memo row intentionally reads an opaque module value. The
		// inferred list cache must fall back, so a normal parent update still exposes
		// the value that changed in the event.
		expect(opaqueValues(root)).toEqual([
			`t0:a:${initialOpaqueVersion + 1}`,
			`t0:b:${initialOpaqueVersion + 1}`,
		]);
		expect(nestedVersion(root)).toBe(initialOpaqueVersion + 1);

		root.click('.output-own-1');
		expect(values(root)).toEqual(['t0:a:1', 't0:b:0']);

		root.click('#output-item');
		expect(root.findAll('.output-row')).toEqual(initialRows);
		expect(values(root)).toEqual(['t0:a!:1', 't0:b:0']);
		expect(root.find('.output-proxy-value').textContent).toBe('proxy a!');

		root.click('#output-context');
		expect(root.findAll('.output-row')).toEqual(initialRows);
		expect(values(root)).toEqual(['t0!:a!:1', 't0!:b:0']);
		expect(opaqueValues(root)).toEqual([
			`t0!:a!:${initialOpaqueVersion + 1}`,
			`t0!:b:${initialOpaqueVersion + 1}`,
		]);

		root.click('#output-tick');
		expect(root.findAll('.output-row')).toEqual(initialRows);
		expect(values(root)).toEqual(['t0!:a!:1', 't0!:b:0']);
		expect(opaqueValues(root)).toEqual([
			`t0!:a!:${initialOpaqueVersion + 2}`,
			`t0!:b:${initialOpaqueVersion + 2}`,
		]);
		expect(nestedVersion(root)).toBe(initialOpaqueVersion + 2);

		root.click('#output-clear');
		expect(root.findAll('.output-row')).toEqual([]);
		expect(root.findAll('.output-opaque-row')).toEqual([]);

		root.unmount();
	});
});
