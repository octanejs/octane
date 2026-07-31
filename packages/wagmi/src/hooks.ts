import { useCallback, useContext, useEffect, useRef, useSyncExternalStore } from 'octane';
import {
	getChainId,
	getChains,
	getConnection,
	getConnections,
	getConnectors,
	watchChainId,
	watchConnection,
	watchConnections,
	watchConnectors,
	type Config,
	type ConnectErrorType,
	type DisconnectErrorType,
	type GetBalanceErrorType,
	type ReadContractErrorType,
	type SendTransactionErrorType,
	type ResolvedRegister,
	type SignMessageErrorType,
	type SimulateContractErrorType,
	type SwitchChainErrorType,
	type SwitchConnectionErrorType,
	type WaitForTransactionReceiptErrorType,
	type WriteContractErrorType,
} from '@wagmi/core';
import { deepEqual, watchChains } from '@wagmi/core/internal';
import {
	connectMutationOptions,
	disconnectMutationOptions,
	getBalanceQueryOptions,
	readContractQueryOptions,
	sendTransactionMutationOptions,
	signMessageMutationOptions,
	simulateContractQueryOptions,
	switchChainMutationOptions,
	switchConnectionMutationOptions,
	waitForTransactionReceiptQueryOptions,
	writeContractMutationOptions,
	type ConnectData,
	type ConnectMutate,
	type ConnectMutateAsync,
	type ConnectOptions,
	type ConnectVariables,
	type DisconnectData,
	type DisconnectMutate,
	type DisconnectMutateAsync,
	type DisconnectOptions,
	type DisconnectVariables,
	type GetBalanceData,
	type GetBalanceOptions,
	type ReadContractData,
	type ReadContractOptions,
	type SendTransactionData,
	type SendTransactionMutate,
	type SendTransactionMutateAsync,
	type SendTransactionOptions,
	type SendTransactionVariables,
	type SignMessageData,
	type SignMessageMutate,
	type SignMessageMutateAsync,
	type SignMessageOptions,
	type SignMessageVariables,
	type SimulateContractData,
	type SimulateContractOptions,
	type SwitchChainData,
	type SwitchChainMutate,
	type SwitchChainMutateAsync,
	type SwitchChainOptions,
	type SwitchChainVariables,
	type SwitchConnectionData,
	type SwitchConnectionMutate,
	type SwitchConnectionMutateAsync,
	type SwitchConnectionOptions,
	type SwitchConnectionVariables,
	type WaitForTransactionReceiptData,
	type WaitForTransactionReceiptOptions,
	type WriteContractData,
	type WriteContractMutate,
	type WriteContractMutateAsync,
	type WriteContractOptions,
	type WriteContractVariables,
} from '@wagmi/core/query';
import type { Abi, ContractFunctionArgs, ContractFunctionName } from 'viem';
import {
	useMutation,
	useQuery,
	type UseMutationOptions,
	type UseMutationResult,
	type UseQueryOptions,
	type UseQueryResult,
} from '@octanejs/tanstack-query';
import { WagmiContext, subSlot } from './internal';
import { secureMutationOptions } from './security';

type ParametersWithConfig<config extends Config = Config> = {
	config?: config;
	[key: string]: unknown;
};

const useMutationWithSlot = useMutation as unknown as <data, error, variables, context>(
	options: UseMutationOptions<data, error, variables, context>,
	queryClient: undefined,
	slot: symbol | undefined,
) => UseMutationResult<data, error, variables, context>;

const useQueryWithSlot = useQuery as unknown as <queryData, error, data>(
	options: UseQueryOptions<queryData, error, data>,
	queryClient: undefined,
	slot: symbol | undefined,
) => UseQueryResult<data, error>;

function useOctaneMutation<data, error, variables, context>(
	options: UseMutationOptions<data, error, variables, context>,
	slot: symbol | undefined,
): UseMutationResult<data, error, variables, context> {
	return useMutationWithSlot(options, undefined, slot);
}

function useOctaneQuery<queryData, error, data>(
	options: UseQueryOptions<queryData, error, data>,
	slot: symbol | undefined,
): UseQueryResult<data, error> {
	return useQueryWithSlot(options, undefined, slot);
}

function argumentsAndSlot(
	parameters: ParametersWithConfig | symbol | undefined,
	rest: unknown[],
): [ParametersWithConfig, symbol | undefined] {
	if (typeof parameters === 'symbol') return [{}, parameters];
	const tail = rest.at(-1);
	return [parameters ?? {}, typeof tail === 'symbol' ? tail : undefined];
}

export class WagmiProviderNotFoundError extends Error {
	override name = 'WagmiProviderNotFoundError';
	constructor() {
		super('`useConfig` must be used within `WagmiProvider` or receive a `config` option.');
	}
}

export function useConfig<config extends Config = ResolvedRegister['config']>(
	parameters: { config?: config } | symbol = {},
): config {
	const direct = typeof parameters === 'symbol' ? undefined : parameters.config;
	const context = useContext(WagmiContext);
	const config = direct ?? context;
	if (!config) throw new WagmiProviderNotFoundError();
	return config as config;
}

function useSnapshot<T>(
	subscribe: (onChange: () => void) => () => void,
	getSnapshot: () => T,
	slot: symbol | undefined,
): T {
	const cached = useRef<T | undefined>(undefined, subSlot(slot, 'cache'));
	const stableSnapshot = () => {
		const next = getSnapshot();
		if (cached.current !== undefined && deepEqual(cached.current, next)) return cached.current;
		cached.current = next;
		return next;
	};
	return useSyncExternalStore(
		subscribe,
		stableSnapshot,
		stableSnapshot,
		subSlot(slot, 'external-store'),
	);
}

export function useConnection<config extends Config = ResolvedRegister['config']>(
	parameters: ParametersWithConfig<config> | symbol = {},
	...rest: unknown[]
) {
	const [options, slot] = argumentsAndSlot(parameters, rest);
	const config = useConfig(options);
	const subscribe = useCallback(
		(onChange: () => void) => watchConnection(config, { onChange }),
		[config],
		subSlot(slot, 'subscribe'),
	);
	return useSnapshot(subscribe, () => getConnection(config), slot);
}

export function useChainId<config extends Config = ResolvedRegister['config']>(
	parameters: ParametersWithConfig<config> | symbol = {},
	...rest: unknown[]
) {
	const [options, slot] = argumentsAndSlot(parameters, rest);
	const config = useConfig(options);
	const subscribe = useCallback(
		(onChange: () => void) => watchChainId(config, { onChange }),
		[config],
		subSlot(slot, 'subscribe'),
	);
	return useSnapshot(subscribe, () => getChainId(config), slot);
}

export function useChains<config extends Config = ResolvedRegister['config']>(
	parameters: ParametersWithConfig<config> | symbol = {},
	...rest: unknown[]
) {
	const [options, slot] = argumentsAndSlot(parameters, rest);
	const config = useConfig(options);
	const subscribe = useCallback(
		(onChange: () => void) => watchChains(config, { onChange }),
		[config],
		subSlot(slot, 'subscribe'),
	);
	return useSnapshot(subscribe, () => getChains(config), slot);
}

export function useConnectors<config extends Config = ResolvedRegister['config']>(
	parameters: ParametersWithConfig<config> | symbol = {},
	...rest: unknown[]
) {
	const [options, slot] = argumentsAndSlot(parameters, rest);
	const config = useConfig(options);
	const subscribe = useCallback(
		(onChange: () => void) => watchConnectors(config, { onChange }),
		[config],
		subSlot(slot, 'subscribe'),
	);
	return useSnapshot(subscribe, () => getConnectors(config), slot);
}

export function useConnections(parameters: ParametersWithConfig | symbol = {}, ...rest: unknown[]) {
	const [options, slot] = argumentsAndSlot(parameters, rest);
	const config = useConfig(options);
	const subscribe = useCallback(
		(onChange: () => void) => watchConnections(config, { onChange }),
		[config],
		subSlot(slot, 'subscribe'),
	);
	return useSnapshot(subscribe, () => getConnections(config), slot);
}

function useFactoryMutation<data, error, variables, context>(
	factory: (
		config: Config,
		parameters: ParametersWithConfig,
	) => UseMutationOptions<data, error, variables, context>,
	parameters: ParametersWithConfig | symbol | undefined,
	rest: unknown[],
	privileged = false,
	securityAction: 'privileged' | 'switchChain' | 'switchConnection' = 'privileged',
): UseMutationResult<data, error, variables, context> {
	const [options, slot] = argumentsAndSlot(parameters, rest);
	const config = useConfig(options);
	const mutationOptions = factory(config, options);
	return useOctaneMutation(
		privileged
			? secureMutationOptions(config, mutationOptions, undefined, securityAction)
			: mutationOptions,
		subSlot(slot, 'mutation'),
	);
}

export type UseConnectParameters<
	config extends Config = Config,
	context = unknown,
> = ConnectOptions<config, context> & { config?: config };

export type UseConnectReturnType<config extends Config = Config, context = unknown> = Omit<
	UseMutationResult<
		ConnectData<config, config['connectors'][number], boolean>,
		ConnectErrorType,
		ConnectVariables<config, config['connectors'][number], boolean>,
		context
	>,
	'mutate' | 'mutateAsync'
> & {
	mutate: ConnectMutate<config, context>;
	mutateAsync: ConnectMutateAsync<config, context>;
	connect: ConnectMutate<config, context>;
	connectAsync: ConnectMutateAsync<config, context>;
	connectors: config['connectors'];
};

export function useConnect<config extends Config = ResolvedRegister['config'], context = unknown>(
	parameters?: UseConnectParameters<config, context> | symbol,
	...rest: unknown[]
): UseConnectReturnType<config, context>;
export function useConnect(parameters: ParametersWithConfig | symbol = {}, ...rest: unknown[]) {
	const [options, slot] = argumentsAndSlot(parameters, rest);
	const config = useConfig(options);
	const mutationOptions = connectMutationOptions(
		config,
		options as UseConnectParameters<typeof config>,
	);
	const mutation = useOctaneMutation(
		{ ...mutationOptions, retry: false },
		subSlot(slot, 'mutation'),
	);
	useEffect(
		() =>
			config.subscribe(
				({ status }) => status,
				(status, previous) => {
					if (previous === 'connected' && status === 'disconnected') mutation.reset();
				},
			),
		[config, mutation.reset],
		subSlot(slot, 'reset'),
	);
	return {
		...mutation,
		connect: mutation.mutate,
		connectAsync: mutation.mutateAsync,
		connectors: useConnectors({ config }, subSlot(slot, 'connectors')),
	} as UseConnectReturnType<typeof config>;
}

type AliasedMutationResult<data, error, variables, context, mutate, mutateAsync> = Omit<
	UseMutationResult<data, error, variables, context>,
	'mutate' | 'mutateAsync'
> & {
	mutate: mutate;
	mutateAsync: mutateAsync;
};

export type UseDisconnectParameters<context = unknown> = DisconnectOptions<context> & {
	config?: Config;
};
export type UseDisconnectReturnType<context = unknown> = AliasedMutationResult<
	DisconnectData,
	DisconnectErrorType,
	DisconnectVariables,
	context,
	DisconnectMutate<context>,
	DisconnectMutateAsync<context>
> & {
	disconnect: DisconnectMutate<context>;
	disconnectAsync: DisconnectMutateAsync<context>;
	connectors: ReturnType<typeof useConnections>[number]['connector'][];
};

export function useDisconnect<context = unknown>(
	parameters?: UseDisconnectParameters<context> | symbol,
	...rest: unknown[]
): UseDisconnectReturnType<context>;
export function useDisconnect(parameters: ParametersWithConfig | symbol = {}, ...rest: unknown[]) {
	const mutation = useFactoryMutation<
		DisconnectData,
		DisconnectErrorType,
		DisconnectVariables,
		unknown
	>(
		(config, options) => disconnectMutationOptions(config, options as DisconnectOptions<unknown>),
		parameters,
		rest,
	);
	const [options, slot] = argumentsAndSlot(parameters, rest);
	const config = useConfig(options);
	return {
		...mutation,
		disconnect: mutation.mutate,
		disconnectAsync: mutation.mutateAsync,
		connectors: useConnections({ config }, subSlot(slot, 'connections')).map(
			(connection) => connection.connector,
		),
	} as UseDisconnectReturnType;
}

export type UseSwitchConnectionParameters<
	config extends Config = Config,
	context = unknown,
> = SwitchConnectionOptions<config, context> & { config?: config };
export type UseSwitchConnectionReturnType<
	config extends Config = Config,
	context = unknown,
> = AliasedMutationResult<
	SwitchConnectionData<config>,
	SwitchConnectionErrorType,
	SwitchConnectionVariables,
	context,
	SwitchConnectionMutate<config, context>,
	SwitchConnectionMutateAsync<config, context>
> & {
	switchConnection: SwitchConnectionMutate<config, context>;
	switchConnectionAsync: SwitchConnectionMutateAsync<config, context>;
	connectors: ReturnType<typeof useConnections>[number]['connector'][];
};

export function useSwitchConnection<
	config extends Config = ResolvedRegister['config'],
	context = unknown,
>(
	parameters?: UseSwitchConnectionParameters<config, context> | symbol,
	...rest: unknown[]
): UseSwitchConnectionReturnType<config, context>;
export function useSwitchConnection(
	parameters: ParametersWithConfig | symbol = {},
	...rest: unknown[]
) {
	const mutation = useFactoryMutation<
		SwitchConnectionData<Config>,
		SwitchConnectionErrorType,
		SwitchConnectionVariables,
		unknown
	>(
		(config, options) =>
			switchConnectionMutationOptions(config, options as SwitchConnectionOptions<Config, unknown>),
		parameters,
		rest,
		true,
		'switchConnection',
	);
	const [options, slot] = argumentsAndSlot(parameters, rest);
	const config = useConfig(options);
	return {
		...mutation,
		switchConnection: mutation.mutate,
		switchConnectionAsync: mutation.mutateAsync,
		connectors: useConnections({ config }, subSlot(slot, 'connections')).map(
			(connection) => connection.connector,
		),
	} as UseSwitchConnectionReturnType;
}

export type UseSwitchChainParameters<
	config extends Config = Config,
	context = unknown,
> = SwitchChainOptions<config, context> & { config?: config };
export type UseSwitchChainReturnType<
	config extends Config = Config,
	context = unknown,
> = AliasedMutationResult<
	SwitchChainData<config, config['chains'][number]['id']>,
	SwitchChainErrorType,
	SwitchChainVariables<config, config['chains'][number]['id']>,
	context,
	SwitchChainMutate<config, context>,
	SwitchChainMutateAsync<config, context>
> & {
	switchChain: SwitchChainMutate<config, context>;
	switchChainAsync: SwitchChainMutateAsync<config, context>;
	chains: config['chains'];
};

export function useSwitchChain<
	config extends Config = ResolvedRegister['config'],
	context = unknown,
>(
	parameters?: UseSwitchChainParameters<config, context> | symbol,
	...rest: unknown[]
): UseSwitchChainReturnType<config, context>;
export function useSwitchChain(parameters: ParametersWithConfig | symbol = {}, ...rest: unknown[]) {
	const mutation = useFactoryMutation<
		SwitchChainData<Config, Config['chains'][number]['id']>,
		SwitchChainErrorType,
		SwitchChainVariables<Config, Config['chains'][number]['id']>,
		unknown
	>(
		(config, options) =>
			switchChainMutationOptions(config, options as SwitchChainOptions<Config, unknown>),
		parameters,
		rest,
		true,
		'switchChain',
	);
	const [options, slot] = argumentsAndSlot(parameters, rest);
	const config = useConfig(options);
	return {
		...mutation,
		switchChain: mutation.mutate,
		switchChainAsync: mutation.mutateAsync,
		chains: useChains({ config }, subSlot(slot, 'chains')),
	} as UseSwitchChainReturnType;
}

function useCoreQuery(
	factory: unknown,
	parameters: ParametersWithConfig | symbol | undefined,
	rest: unknown[],
	options: { account?: boolean; chain?: boolean } = {},
) {
	const [input, slot] = argumentsAndSlot(parameters, rest);
	const config = useConfig(input);
	const chainId = useChainId({ config }, subSlot(slot, 'chain'));
	const connection = options.account
		? useConnection({ config }, subSlot(slot, 'connection'))
		: undefined;
	const queryOptions = (
		factory as (
			config: Config,
			parameters: ParametersWithConfig,
		) => UseQueryOptions<unknown, unknown, unknown>
	)(config, {
		...input,
		...(options.account
			? {
					account: input.account ?? connection?.address,
					connector: input.connector ?? connection?.connector,
				}
			: {}),
		...(options.chain ? { chainId: input.chainId ?? chainId } : {}),
	});
	return useOctaneQuery(queryOptions, subSlot(slot, 'query'));
}

export type UseBalanceParameters<
	config extends Config = Config,
	selectData = GetBalanceData,
> = GetBalanceOptions<config, selectData> & { config?: config };
export type UseBalanceReturnType<selectData = GetBalanceData> = UseQueryResult<
	selectData,
	GetBalanceErrorType
>;

export function useBalance<
	config extends Config = ResolvedRegister['config'],
	selectData = GetBalanceData,
>(
	parameters?: UseBalanceParameters<config, selectData> | symbol,
	...rest: unknown[]
): UseBalanceReturnType<selectData>;
export function useBalance(parameters: ParametersWithConfig | symbol = {}, ...rest: unknown[]) {
	return useCoreQuery(getBalanceQueryOptions, parameters, rest, { chain: true });
}

export type UseReadContractParameters<
	abi extends Abi | readonly unknown[] = Abi,
	functionName extends ContractFunctionName<abi, 'pure' | 'view'> = ContractFunctionName<
		abi,
		'pure' | 'view'
	>,
	args extends ContractFunctionArgs<abi, 'pure' | 'view', functionName> = ContractFunctionArgs<
		abi,
		'pure' | 'view',
		functionName
	>,
	config extends Config = Config,
	selectData = ReadContractData<abi, functionName, args>,
> = ReadContractOptions<abi, functionName, args, config, selectData> & { config?: config };
export type UseReadContractReturnType<
	abi extends Abi | readonly unknown[],
	functionName extends ContractFunctionName<abi, 'pure' | 'view'>,
	args extends ContractFunctionArgs<abi, 'pure' | 'view', functionName>,
	selectData = ReadContractData<abi, functionName, args>,
> = UseQueryResult<selectData, ReadContractErrorType>;

export function useReadContract<
	const abi extends Abi | readonly unknown[],
	functionName extends ContractFunctionName<abi, 'pure' | 'view'>,
	const args extends ContractFunctionArgs<abi, 'pure' | 'view', functionName>,
	config extends Config = ResolvedRegister['config'],
	selectData = ReadContractData<abi, functionName, args>,
>(
	parameters?: UseReadContractParameters<abi, functionName, args, config, selectData> | symbol,
	...rest: unknown[]
): UseReadContractReturnType<abi, functionName, args, selectData>;
export function useReadContract(
	parameters: ParametersWithConfig | symbol = {},
	...rest: unknown[]
) {
	return useCoreQuery(readContractQueryOptions, parameters, rest, { chain: true });
}

export type UseSimulateContractParameters<
	abi extends Abi | readonly unknown[] = Abi,
	functionName extends ContractFunctionName<abi, 'nonpayable' | 'payable'> = ContractFunctionName<
		abi,
		'nonpayable' | 'payable'
	>,
	args extends ContractFunctionArgs<abi, 'nonpayable' | 'payable', functionName> =
		ContractFunctionArgs<abi, 'nonpayable' | 'payable', functionName>,
	config extends Config = Config,
	chainId extends config['chains'][number]['id'] | undefined = config['chains'][number]['id'],
	selectData = SimulateContractData<abi, functionName, args, config, chainId>,
> = SimulateContractOptions<abi, functionName, args, config, chainId, selectData> & {
	config?: config;
};
export type UseSimulateContractReturnType<
	abi extends Abi | readonly unknown[],
	functionName extends ContractFunctionName<abi, 'nonpayable' | 'payable'>,
	args extends ContractFunctionArgs<abi, 'nonpayable' | 'payable', functionName>,
	config extends Config,
	chainId extends config['chains'][number]['id'] | undefined,
	selectData = SimulateContractData<abi, functionName, args, config, chainId>,
> = UseQueryResult<selectData, SimulateContractErrorType>;

export function useSimulateContract<
	const abi extends Abi | readonly unknown[],
	functionName extends ContractFunctionName<abi, 'nonpayable' | 'payable'>,
	const args extends ContractFunctionArgs<abi, 'nonpayable' | 'payable', functionName>,
	config extends Config = ResolvedRegister['config'],
	chainId extends config['chains'][number]['id'] | undefined = config['chains'][number]['id'],
	selectData = SimulateContractData<abi, functionName, args, config, chainId>,
>(
	parameters?:
		UseSimulateContractParameters<abi, functionName, args, config, chainId, selectData> | symbol,
	...rest: unknown[]
): UseSimulateContractReturnType<abi, functionName, args, config, chainId, selectData>;
export function useSimulateContract(
	parameters: ParametersWithConfig | symbol = {},
	...rest: unknown[]
) {
	return useCoreQuery(simulateContractQueryOptions, parameters, rest, {
		account: true,
		chain: true,
	});
}

export type UseWaitForTransactionReceiptParameters<
	config extends Config = Config,
	chainId extends config['chains'][number]['id'] = config['chains'][number]['id'],
	selectData = WaitForTransactionReceiptData<config, chainId>,
> = WaitForTransactionReceiptOptions<config, chainId, selectData> & { config?: config };
export type UseWaitForTransactionReceiptReturnType<selectData> = UseQueryResult<
	selectData,
	WaitForTransactionReceiptErrorType
>;

export function useWaitForTransactionReceipt<
	config extends Config = ResolvedRegister['config'],
	chainId extends config['chains'][number]['id'] = config['chains'][number]['id'],
	selectData = WaitForTransactionReceiptData<config, chainId>,
>(
	parameters?: UseWaitForTransactionReceiptParameters<config, chainId, selectData> | symbol,
	...rest: unknown[]
): UseWaitForTransactionReceiptReturnType<selectData>;
export function useWaitForTransactionReceipt(
	parameters: ParametersWithConfig | symbol = {},
	...rest: unknown[]
) {
	return useCoreQuery(waitForTransactionReceiptQueryOptions, parameters, rest, { chain: true });
}

export type UseWriteContractParameters<
	config extends Config = Config,
	context = unknown,
> = WriteContractOptions<config, context> & { config?: config };
export type UseWriteContractReturnType<
	config extends Config = Config,
	context = unknown,
> = AliasedMutationResult<
	WriteContractData,
	WriteContractErrorType,
	WriteContractVariables<Abi, string, readonly unknown[], config, config['chains'][number]['id']>,
	context,
	WriteContractMutate<config, context>,
	WriteContractMutateAsync<config, context>
> & {
	writeContract: WriteContractMutate<config, context>;
	writeContractAsync: WriteContractMutateAsync<config, context>;
};

export function useWriteContract<
	config extends Config = ResolvedRegister['config'],
	context = unknown,
>(
	parameters?: UseWriteContractParameters<config, context> | symbol,
	...rest: unknown[]
): UseWriteContractReturnType<config, context>;
export function useWriteContract(
	parameters: ParametersWithConfig | symbol = {},
	...rest: unknown[]
) {
	const mutation = useFactoryMutation<
		WriteContractData,
		WriteContractErrorType,
		WriteContractVariables<Abi, string, readonly unknown[], Config, Config['chains'][number]['id']>,
		unknown
	>(
		(config, options) =>
			writeContractMutationOptions(config, options as WriteContractOptions<Config, unknown>),
		parameters,
		rest,
		true,
	);
	return {
		...mutation,
		writeContract: mutation.mutate,
		writeContractAsync: mutation.mutateAsync,
	} as UseWriteContractReturnType;
}

export type UseSendTransactionParameters<
	config extends Config = Config,
	context = unknown,
> = SendTransactionOptions<config, context> & { config?: config };
export type UseSendTransactionReturnType<
	config extends Config = Config,
	context = unknown,
> = AliasedMutationResult<
	SendTransactionData,
	SendTransactionErrorType,
	SendTransactionVariables<config, config['chains'][number]['id']>,
	context,
	SendTransactionMutate<config, context>,
	SendTransactionMutateAsync<config, context>
> & {
	sendTransaction: SendTransactionMutate<config, context>;
	sendTransactionAsync: SendTransactionMutateAsync<config, context>;
};

export function useSendTransaction<
	config extends Config = ResolvedRegister['config'],
	context = unknown,
>(
	parameters?: UseSendTransactionParameters<config, context> | symbol,
	...rest: unknown[]
): UseSendTransactionReturnType<config, context>;
export function useSendTransaction(
	parameters: ParametersWithConfig | symbol = {},
	...rest: unknown[]
) {
	const mutation = useFactoryMutation<
		SendTransactionData,
		SendTransactionErrorType,
		SendTransactionVariables<Config, Config['chains'][number]['id']>,
		unknown
	>(
		(config, options) =>
			sendTransactionMutationOptions(config, options as SendTransactionOptions<Config, unknown>),
		parameters,
		rest,
		true,
	);
	return {
		...mutation,
		sendTransaction: mutation.mutate,
		sendTransactionAsync: mutation.mutateAsync,
	} as UseSendTransactionReturnType;
}

export type UseSignMessageParameters<context = unknown> = SignMessageOptions<context> & {
	config?: Config;
};
export type UseSignMessageReturnType<context = unknown> = Omit<
	UseMutationResult<SignMessageData, SignMessageErrorType, SignMessageVariables, context>,
	'mutate' | 'mutateAsync'
> & {
	mutate: SignMessageMutate<context>;
	mutateAsync: SignMessageMutateAsync<context>;
	signMessage: SignMessageMutate<context>;
	signMessageAsync: SignMessageMutateAsync<context>;
};

export function useSignMessage<context = unknown>(
	parameters: UseSignMessageParameters<context> | symbol = {},
	...rest: unknown[]
): UseSignMessageReturnType<context> {
	const mutation = useFactoryMutation<
		SignMessageData,
		SignMessageErrorType,
		SignMessageVariables,
		unknown
	>(
		(config, options) => signMessageMutationOptions(config, options as SignMessageOptions<context>),
		parameters as ParametersWithConfig | symbol,
		rest,
		true,
	);
	return {
		...mutation,
		signMessage: mutation.mutate,
		signMessageAsync: mutation.mutateAsync,
	} as UseSignMessageReturnType<context>;
}
