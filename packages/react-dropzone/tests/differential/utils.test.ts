import { describe, expect, it, vi } from 'vitest';
import * as octane from '../../src/utils/index';
import * as react from '../../upstream/canonical/src/utils/index';

function observe<T>(fn: () => T) {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		return { value: fn(), warnings: warn.mock.calls.map((args) => args.join(' ')) };
	} finally {
		warn.mockRestore();
	}
}

describe('react-dropzone U2 pure utility differential', () => {
	// @parity-case differential:utils-validation
	it('matches accept flattening, picker filters, and input serialization tables', () => {
		const tables = [
			undefined,
			{},
			{ 'image/*': ['.png', '.jpg'], 'application/pdf': '.pdf' },
			[
				{ description: 'Images', accept: { 'image/jpeg': ['.jpg'], 'image/png': [] } },
				{ accept: { 'image/jpeg': '.jpeg', 'application/pdf': '.pdf' } },
			],
			[{ description: '', accept: { invalid: ['png'], 'text/plain': ['.txt'] } }],
		] as const;
		for (const accept of tables) {
			expect(observe(() => octane.flattenAccept(accept as any))).toEqual(
				observe(() => react.flattenAccept(accept as any)),
			);
			expect(observe(() => octane.pickerOptionsFromAccept(accept as any))).toEqual(
				observe(() => react.pickerOptionsFromAccept(accept as any)),
			);
			const flattened = octane.flattenAccept(accept as any);
			expect(octane.acceptPropAsAcceptAttr(flattened)).toEqual(
				react.acceptPropAsAcceptAttr(flattened),
			);
			expect(
				octane.acceptPropAsAcceptAttr(flattened, {
					omitWildcardMimeTypesWithExtensions: true,
				}),
			).toEqual(
				react.acceptPropAsAcceptAttr(flattened, {
					omitWildcardMimeTypesWithExtensions: true,
				}),
			);
		}
	});

	// @parity-case differential:utils-errors
	it('matches type, size, quantity, and drag verdict tables', () => {
		const files = [
			new File(['ok'], 'ok.txt', { type: 'text/plain' }),
			new File(['large'], 'large.png', { type: 'image/png' }),
		];
		for (const file of files) {
			for (const accept of [undefined, 'text/plain,.txt', 'image/*,.png']) {
				expect(octane.fileAccepted(file, accept)).toEqual(react.fileAccepted(file, accept));
			}
			for (const [min, max] of [
				[undefined, undefined],
				[0, 2],
				[10, 100],
			] as const) {
				expect(octane.fileMatchSize(file, min, max)).toEqual(react.fileMatchSize(file, min, max));
			}
		}
		const options = {
			files,
			accept: 'text/plain,image/png',
			minSize: 0,
			maxSize: 20,
			multiple: true,
			maxFiles: 2,
		};
		expect(octane.allFilesAccepted(options)).toBe(react.allFilesAccepted(options));
		expect(octane.getDragVerdict(options)).toBe(react.getDragVerdict(options));
		expect(octane.getDragVerdict({ ...options, validator: async () => null })).toBe(
			react.getDragVerdict({ ...options, validator: async () => null }),
		);
	});

	// @parity-case differential:utils-events
	it('matches event, exception, propagation, and thenable classification', () => {
		const eventTables = [
			{},
			{ target: { files: [] } },
			{ dataTransfer: { types: ['Files'], items: [] } },
			{ dataTransfer: { types: ['text/plain'], items: [{ kind: 'file' }] } },
			{ clipboardData: { types: ['text/plain'], items: [{ kind: 'string' }] } },
		];
		for (const event of eventTables) {
			expect(octane.isEvtWithFiles(event)).toBe(react.isEvtWithFiles(event));
			expect(octane.isPropagationStopped(event)).toBe(react.isPropagationStopped(event));
		}
		for (const value of [Promise.resolve(), { then() {} }, null, {}, 1]) {
			expect(octane.isThenable(value)).toBe(react.isThenable(value));
		}
		for (const error of [
			new DOMException('cancel', 'AbortError'),
			new DOMException('blocked', 'SecurityError'),
			new DOMException('policy', 'NotAllowedError'),
			new Error('other'),
		]) {
			expect([
				octane.isAbort(error),
				octane.isSecurityError(error),
				octane.isNotAllowedError(error),
			]).toEqual([
				react.isAbort(error),
				react.isSecurityError(error),
				react.isNotAllowedError(error),
			]);
		}
	});
});
