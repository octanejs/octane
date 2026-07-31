import type { Config } from '@wagmi/core';
import {
	useBalance,
	useConnect,
	useDisconnect,
	useReadContract,
	useSendTransaction,
	useSignMessage,
	useSimulateContract,
	useSwitchChain,
	useSwitchConnection,
	useWaitForTransactionReceipt,
	useWriteContract,
	type UseBalanceParameters,
} from '@octanejs/wagmi';

declare function expectType<T>(value: T): void;
declare const config: Config;
declare const connector: Config['connectors'][number];
const address = '0x0000000000000000000000000000000000000001' as const;
const tokenAbi = [
	{
		type: 'function',
		name: 'balanceOf',
		stateMutability: 'view',
		inputs: [{ name: 'account', type: 'address' }],
		outputs: [{ type: 'uint256' }],
	},
	{
		type: 'function',
		name: 'transfer',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'to', type: 'address' },
			{ name: 'amount', type: 'uint256' },
		],
		outputs: [{ type: 'bool' }],
	},
] as const;

function consumerTypeFixtures() {
	const balanceOptions = {
		address: '0x0000000000000000000000000000000000000001',
		query: { select: (balance: { value: bigint }) => balance.value },
	} satisfies UseBalanceParameters<Config, bigint>;
	const balance = useBalance(balanceOptions);
	expectType<bigint | undefined>(balance.data);
	expectType<Error | null>(balance.error);

	const connect = useConnect({ config });
	expectType<void>(connect.connect({ connector: config.connectors[0]! }));
	expectType<Promise<unknown>>(connect.connectAsync({ connector: config.connectors[0]! }));
	expectType<'idle' | 'pending' | 'error' | 'success'>(connect.status);

	const sign = useSignMessage();
	expectType<void>(sign.mutate({ message: 'octane' }));
	expectType<Promise<`0x${string}`>>(sign.signMessageAsync({ message: 'octane' }));
	expectType<`0x${string}` | undefined>(sign.data);

	const disconnect = useDisconnect();
	expectType<void>(disconnect.disconnect());
	expectType<Promise<void>>(disconnect.disconnectAsync());

	const switchConnection = useSwitchConnection({ config });
	expectType<void>(switchConnection.switchConnection({ connector }));
	expectType<Promise<unknown>>(switchConnection.switchConnectionAsync({ connector }));
	expectType<Config['connectors'][number] | undefined>(switchConnection.connectors[0]);

	const switchChain = useSwitchChain({ config });
	expectType<void>(switchChain.switchChain({ chainId: 1 }));
	expectType<Promise<unknown>>(switchChain.switchChainAsync({ chainId: 1 }));

	const read = useReadContract({
		abi: tokenAbi,
		address,
		functionName: 'balanceOf',
		args: [address],
	});
	expectType<bigint | undefined>(read.data);

	const simulation = useSimulateContract({
		abi: tokenAbi,
		address,
		functionName: 'transfer',
		args: [address, 1n],
	});
	expectType<boolean | undefined>(simulation.data?.result);

	const write = useWriteContract();
	expectType<void>(
		write.writeContract({
			abi: tokenAbi,
			address,
			functionName: 'transfer',
			args: [address, 1n],
		}),
	);
	expectType<Promise<`0x${string}`>>(
		write.writeContractAsync({
			abi: tokenAbi,
			address,
			functionName: 'transfer',
			args: [address, 1n],
		}),
	);

	const send = useSendTransaction();
	expectType<void>(send.sendTransaction({ to: address, value: 1n }));
	expectType<Promise<`0x${string}`>>(send.sendTransactionAsync({ to: address, value: 1n }));

	const receipt = useWaitForTransactionReceipt({
		hash: '0x1234',
		query: { select: (value) => value.status },
	});
	expectType<'success' | 'reverted' | undefined>(receipt.data);

	// @ts-expect-error connect variables require a live connector.
	connect.mutate({});
	// @ts-expect-error balance addresses are hex-prefixed.
	useBalance({ address: 'not-an-address' });
	// @ts-expect-error switchConnection requires a connector.
	switchConnection.switchConnection({});
	// @ts-expect-error chain identifiers are numeric.
	switchChain.switchChain({ chainId: '1' });
	// @ts-expect-error ABI function names are preserved.
	useReadContract({ abi: tokenAbi, address, functionName: 'missing' });
	write.writeContract({
		abi: tokenAbi,
		address,
		functionName: 'transfer',
		// @ts-expect-error transfer amount must be bigint.
		args: [address, '1'],
	});
	// @ts-expect-error transaction values are bigint.
	send.sendTransaction({ to: address, value: '1' });
}

void consumerTypeFixtures;
