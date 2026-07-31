import { QueryClientProvider } from '@octanejs/tanstack-query';
import {
	WagmiProvider,
	useBalance,
	useReadContract,
	useSendTransaction,
	useSignMessage,
	useSimulateContract,
	useWaitForTransactionReceipt,
	useWriteContract,
	type Config,
} from '@octanejs/wagmi';

const contract = '0x0000000000000000000000000000000000000002' as const;
const abi = [
	{
		type: 'function',
		name: 'value',
		stateMutability: 'view',
		inputs: [],
		outputs: [
			{ name: '', type: 'uint256' },
		],
	},
	{
		type: 'function',
		name: 'setValue',
		stateMutability: 'nonpayable',
		inputs: [
			{ name: 'next', type: 'uint256' },
		],
		outputs: [],
	},
	{
		type: 'function',
		name: 'ping',
		stateMutability: 'nonpayable',
		inputs: [],
		outputs: [],
	},
] as const;

function BalancePair(props: { address: `0x${string}` }) @{
	const first = useBalance({ address: props.address, query: { retry: false } });
	const second = useBalance({ address: props.address, query: { retry: false } });
	<>
		<span id="first">
			{first.isSuccess ? first.data.value.toString() : first.status}
		</span>
		<span id="second">
			{second.isSuccess ? second.data.value.toString() : second.status}
		</span>
		<span id="balance-error">
			{first.error ? first.error.message : '-'}
		</span>
	</>
}

export function BalanceApp(props: {
	address: `0x${string}`;
	config: Config;
	queryClient: unknown;
}) @{
	<WagmiProvider config={props.config} reconnectOnMount={false}>
		<QueryClientProvider client={props.queryClient}>
			<BalancePair address={props.address} />
		</QueryClientProvider>
	</WagmiProvider>
}

function Signer() @{
	const sign = useSignMessage();
	<>
		<button id="sign" onClick={() => sign.signMessage({ message: 'octane' })}>sign</button>
		<span id="sign-status">{sign.status}</span>
		<span id="signature">{sign.data ?? '-'}</span>
		<span id="sign-error">
			{sign.error ? sign.error.name + ':' + sign.error.message : '-'}
		</span>
	</>
}

export function SignApp(props: { config: Config; queryClient: unknown }) @{
	<WagmiProvider config={props.config} reconnectOnMount={false}>
		<QueryClientProvider client={props.queryClient}>
			<Signer />
		</QueryClientProvider>
	</WagmiProvider>
}

function ContractQueries(props: { hash: `0x${string}` }) @{
	const read = useReadContract({
		address: contract,
		abi,
		functionName: 'value',
		query: { retry: false },
	});
	const simulation = useSimulateContract({
		address: contract,
		abi,
		functionName: 'ping',
		query: { retry: false },
	});
	const receipt = useWaitForTransactionReceipt({
		hash: props.hash,
		confirmations: 1,
		query: { retry: false },
	});
	<>
		<span id="read">
			{read.isSuccess ? String(read.data) : read.status}
		</span>
		<span id="simulate">
			{simulation.isSuccess ? simulation.data.request.functionName : simulation.status}
		</span>
		<span id="simulate-error">
			{simulation.error ? simulation.error.message : '-'}
		</span>
		<span id="receipt">
			{receipt.isSuccess ? receipt.data.status : receipt.status}
		</span>
		<span id="receipt-error">
			{receipt.error ? receipt.error.message : '-'}
		</span>
	</>
}

export function ContractQueriesApp(props: {
	config: Config;
	hash: `0x${string}`;
	queryClient: unknown;
}) @{
	<WagmiProvider config={props.config} reconnectOnMount={false}>
		<QueryClientProvider client={props.queryClient}>
			<ContractQueries hash={props.hash} />
		</QueryClientProvider>
	</WagmiProvider>
}

function TransactionMutations() @{
	const write = useWriteContract();
	const send = useSendTransaction();
	<>
		<button
			id="write"
			onClick={() => write.writeContract({
				address: contract,
				abi,
				functionName: 'setValue',
				args: [7n],
			})}
		>
			write
		</button>
		<button id="send" onClick={() => send.sendTransaction({ to: contract, value: 1n })}>
			send
		</button>
		<span id="write-status">{write.status}</span>
		<span id="write-hash">{write.data ?? '-'}</span>
		<span id="write-error">
			{write.error ? write.error.message : '-'}
		</span>
		<span id="send-status">{send.status}</span>
		<span id="send-hash">{send.data ?? '-'}</span>
		<span id="send-error">
			{send.error ? send.error.message : '-'}
		</span>
	</>
}

export function TransactionMutationsApp(props: { config: Config; queryClient: unknown }) @{
	<WagmiProvider config={props.config} reconnectOnMount={false}>
		<QueryClientProvider client={props.queryClient}>
			<TransactionMutations />
		</QueryClientProvider>
	</WagmiProvider>
}
