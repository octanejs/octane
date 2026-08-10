import type { Machine, Service } from '@zag-js/core';
import type { OctaneNode } from 'octane';
import type { PortalProps } from '../src/portal.ts';
import {
	mergeProps,
	normalizeProps,
	Portal,
	useMachine,
	useSyncExternalStore,
} from '../src/index.ts';

declare function expectType<T>(value: T): void;

declare const machine: Machine<any>;
const service = useMachine(machine);
expectType<Service<any>>(service);
expectType<(event: { type: string }) => void>(service.send);
expectType<() => any>(service.state.get);

const merged = mergeProps({ id: 'a' }, { name: 'b' });
expectType<{ id: string } & { name: string }>(merged);

const inputProps = normalizeProps.input({ id: 'field' });
expectType<string | undefined>(inputProps.id);

type PortalChildren = Parameters<typeof Portal>[0]['children'];
expectType<OctaneNode | undefined>(null as unknown as PortalChildren);

type Disabled = PortalProps['disabled'];
expectType<boolean | undefined>(null as unknown as Disabled);

declare function subscribe(onStoreChange: () => void): () => void;
declare function getSnapshot(): number;
expectType<number>(useSyncExternalStore(subscribe, getSnapshot));

// @ts-expect-error useMachine requires a machine argument
useMachine();

// @ts-expect-error mergeProps requires object arguments
mergeProps(null);
