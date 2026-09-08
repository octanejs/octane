import { describe, expect, it, vi } from 'vitest';
import { createTransactionExecutor, TransactionFailure } from '../src/transaction';

const base = { account: 'A', cluster: 'devnet', wallet: 'W', payload: {} };

describe('transaction seam', () => {
	it('signs, sends, and confirms only after explicit execution', async () => {
		const sign = vi.fn(async () => 'signed');
		const send = vi.fn(async () => 'signature');
		const confirm = vi.fn(async () => {});
		const execute = createTransactionExecutor({ getContext: () => base, sign, send, confirm });
		expect(sign).not.toHaveBeenCalled();
		await expect(execute()).resolves.toEqual({ status: 'confirmed', signature: 'signature' });
		expect(confirm).toHaveBeenCalledOnce();
	});

	it.each([
		[
			'signing-failed',
			{
				sign: async () => {
					throw new Error('reject');
				},
				send: async () => '',
				confirm: async () => {},
			},
		],
		[
			'sending-failed',
			{
				sign: async () => '',
				send: async () => {
					throw new Error('rpc');
				},
				confirm: async () => {},
			},
		],
	] as const)('types %s errors without retrying', async (code, steps) => {
		const execute = createTransactionExecutor({ getContext: () => base, ...steps });
		await expect(execute()).rejects.toMatchObject({ code });
	});

	it('reports a missing capability before invoking any transaction step', async () => {
		const sign = vi.fn(async () => 'signed');
		const send = vi.fn(async () => 'signature');
		const execute = createTransactionExecutor({
			getContext: () => base,
			sign,
			send,
		});

		await expect(execute()).rejects.toMatchObject({ code: 'missing-capability' });
		expect(sign).not.toHaveBeenCalled();
		expect(send).not.toHaveBeenCalled();
	});

	it('cancels a context change while signing without sending', async () => {
		let context = base;
		const signGate = Promise.withResolvers<string>();
		const send = vi.fn(async () => 'signature');
		const execute = createTransactionExecutor({
			getContext: () => context,
			sign: () => signGate.promise,
			send,
			confirm: async () => {},
		});
		const pending = execute();
		await Promise.resolve();
		context = { ...base, cluster: 'mainnet' };
		signGate.resolve('signed');
		await expect(pending).rejects.toMatchObject({ code: 'cancelled-before-dispatch' });
		expect(send).not.toHaveBeenCalled();
	});

	it('cancels a superseded signing operation without sending it', async () => {
		const firstSign = Promise.withResolvers<string>();
		const sign = vi
			.fn<() => Promise<string>>()
			.mockImplementationOnce(() => firstSign.promise)
			.mockResolvedValueOnce('second-signed');
		const send = vi.fn(async (signed: string) => `${signed}-signature`);
		const execute = createTransactionExecutor({
			getContext: () => base,
			sign,
			send,
			confirm: async () => {},
		});

		const first = execute();
		await Promise.resolve();
		await expect(execute()).resolves.toMatchObject({
			status: 'confirmed',
			signature: 'second-signed-signature',
		});
		firstSign.resolve('first-signed');
		await expect(first).rejects.toMatchObject({ code: 'cancelled-before-dispatch' });
		expect(send).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledWith('second-signed', base);
	});

	it('cancels a context change before signing starts', async () => {
		let context = base;
		const cancelled = createTransactionExecutor({
			getContext: () => context,
			sign: async () => '',
			send: async () => '',
			confirm: async () => {},
		});
		const cancellation = cancelled();
		context = { ...context, account: 'B' };
		await expect(cancellation).rejects.toEqual(
			expect.objectContaining<TransactionFailure>({ code: 'cancelled-before-dispatch' }),
		);
	});

	it.each(['context', 'operation'] as const)(
		'quarantines a %s change while sending without confirming',
		async (change) => {
			let context = base;
			const sendGate = Promise.withResolvers<string>();
			const supersedingSign = Promise.withResolvers<string>();
			const sign =
				change === 'operation'
					? vi
							.fn<() => Promise<string>>()
							.mockResolvedValueOnce('signed')
							.mockImplementationOnce(() => supersedingSign.promise)
					: vi.fn(async () => 'signed');
			const send = vi.fn(() => sendGate.promise);
			const confirm = vi.fn(async () => {});
			const execute = createTransactionExecutor({
				getContext: () => context,
				sign,
				send,
				confirm,
			});

			const pending = execute();
			await vi.waitFor(() => expect(send).toHaveBeenCalledOnce());
			if (change === 'context') context = { ...base, cluster: 'mainnet' };
			else void execute();
			sendGate.resolve('signature');

			await expect(pending).resolves.toMatchObject({
				status: 'indeterminate',
				signature: 'signature',
			});
			expect(confirm).not.toHaveBeenCalled();
		},
	);

	it('returns an indeterminate result with diagnostics and confirmation-only reconciliation', async () => {
		const timeout = new Error('timeout');
		const sign = vi.fn(async () => 'signed');
		const send = vi.fn(async () => 'signature');
		const confirm = vi
			.fn<() => Promise<void>>()
			.mockRejectedValueOnce(timeout)
			.mockResolvedValueOnce();
		const execute = createTransactionExecutor({ getContext: () => base, sign, send, confirm });

		const result = await execute();
		expect(result).toMatchObject({
			status: 'indeterminate',
			signature: 'signature',
			failure: { code: 'confirmation-failed', cause: timeout },
		});
		if (result.status !== 'indeterminate') throw new Error('Expected indeterminate result');
		await expect(result.reconcile()).resolves.toEqual({
			status: 'confirmed',
			signature: 'signature',
		});
		expect(sign).toHaveBeenCalledOnce();
		expect(send).toHaveBeenCalledOnce();
		expect(confirm).toHaveBeenCalledTimes(2);
	});

	it.each(['context', 'operation'] as const)(
		'quarantines a %s change while confirming',
		async (change) => {
			let context = base;
			const confirmGate = Promise.withResolvers<void>();
			const execute = createTransactionExecutor({
				getContext: () => context,
				sign: async () => 'signed',
				send: async () => 'signature',
				confirm: () => confirmGate.promise,
			});

			const pending = execute();
			await Promise.resolve();
			await Promise.resolve();
			if (change === 'context') context = { ...base, cluster: 'mainnet' };
			else void execute();
			confirmGate.resolve();

			const result = await pending;
			expect(result).toMatchObject({ status: 'indeterminate', signature: 'signature' });
		},
	);
});
