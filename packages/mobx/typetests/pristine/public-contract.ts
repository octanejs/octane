import * as A from 'mobx-react-lite';
import type { ReactNode } from 'react';
import type { Reaction } from 'mobx';
import type { Assert, Equal } from '../../../../scripts/react-port/type-assertions';
type ObserverContract = Assert<Equal<ReturnType<typeof A.Observer>, ReactNode>>;
const observed = A.observer((props: { value: number }) => null);
type PropsContract = Assert<Equal<Parameters<typeof observed>[0], { value: number }>>;
type LocalContract = Assert<
	Equal<ReturnType<typeof A.useLocalObservable<{ value: number }>>, { value: number }>
>;
type StaticContract = Assert<Equal<typeof A.enableStaticRendering, (enable: boolean) => void>>;
type StaticReadContract = Assert<Equal<typeof A.isUsingStaticRendering, () => boolean>>;
type RegistryContract = Assert<
	Equal<
		Parameters<typeof A._observerFinalizationRegistry.register>,
		[target: object, value: { reaction: Reaction | null }, token?: object]
	>
>;
// The npm declaration intentionally types this timer utility as any. Exercise its
// actual callable shape, while the native binding strengthens it to () => void.
A.clearTimers satisfies () => void;
A.Observer({ children: () => null });
// @ts-expect-error children and render remain mutually exclusive
A.Observer({ children: () => null, render: () => null });
// @ts-expect-error the observed component preserves required numeric props
observed({ value: 'invalid' });

type RegistryTokenContract = Assert<
	Equal<Parameters<typeof A._observerFinalizationRegistry.unregister>, [token: object]>
>;

A.observer satisfies <P extends object>(
	component: import('react').FunctionComponent<P>,
) => import('react').FunctionComponent<P>;

type ObserverNameContract = Assert<Equal<typeof A.Observer.displayName, string>>;
// @ts-expect-error the upstream display name remains a string
A.Observer.displayName = 1;
