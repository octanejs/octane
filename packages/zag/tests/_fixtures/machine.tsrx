import { createMachine } from '@zag-js/core';
import { Portal, useMachine } from '@octanejs/zag';

export const machine = createMachine<any>({
	initialState() {
		return 'idle';
	},
	context({ bindable }) {
		return {
			count: bindable(() => ({ defaultValue: 0 })),
		};
	},
	states: {
		idle: {
			on: {
				TOGGLE: {
					target: 'active',
					actions: ['increment'],
				},
				DOUBLE: {
					target: 'active',
					actions: ['increment', 'increment'],
				},
			},
		},
		active: {
			on: {
				TOGGLE: { target: 'idle' },
			},
		},
	},
	implementations: {
		actions: {
			increment({ context }) {
				context.set('count', context.get('count') + 1);
			},
		},
	},
});

export const lifecycleEvents: string[] = [];

export const lifecycleMachine = createMachine<any>({
	initialState() {
		return 'idle';
	},
	entry: ['rootEntry'],
	exit: ['rootExit'],
	effects: ['rootEffect'],
	states: {
		idle: {
			entry: ['idleEntry'],
			exit: ['idleExit'],
			effects: ['idleEffect'],
			on: {
				NEXT: {
					target: 'active',
					actions: ['transitionAction'],
				},
			},
		},
		active: {
			entry: ['activeEntry'],
			effects: ['activeEffect'],
		},
	},
	implementations: {
		actions: {
			rootEntry: () => lifecycleEvents.push('root-entry'),
			rootExit: () => lifecycleEvents.push('root-exit'),
			idleEntry: () => lifecycleEvents.push('idle-entry'),
			idleExit: () => lifecycleEvents.push('idle-exit'),
			activeEntry: () => lifecycleEvents.push('active-entry'),
			transitionAction: () => lifecycleEvents.push('transition-action'),
		},
		effects: {
			rootEffect: () => {
				lifecycleEvents.push('root-effect');
				return () => lifecycleEvents.push('root-cleanup');
			},
			idleEffect: () => {
				lifecycleEvents.push('idle-effect');
				return () => lifecycleEvents.push('idle-cleanup');
			},
			activeEffect: () => {
				lifecycleEvents.push('active-effect');
				return () => lifecycleEvents.push('active-cleanup');
			},
		},
	},
});

export function MachineFixture() @{
	const service = useMachine(machine);

	<div>
		<p id="machine-state">{service.state.get() + '/' + service.context.get('count')}</p>
		<button id="machine-toggle" onClick={() => service.send({ type: 'TOGGLE' })}>toggle</button>
		<button id="machine-double" onClick={() => service.send({ type: 'DOUBLE' })}>double</button>
	</div>
}

export function IndependentMachines() @{
	const first = useMachine(machine);
	const second = useMachine(machine);

	<div>
		<p id="first-machine">{first.state.get() + '/' + first.context.get('count')}</p>
		<p id="second-machine">{second.state.get() + '/' + second.context.get('count')}</p>
		<button id="first-toggle" onClick={() => first.send({ type: 'TOGGLE' })}>first</button>
		<button id="second-toggle" onClick={() => second.send({ type: 'TOGGLE' })}>second</button>
	</div>
}

export function LifecycleMachine() @{
	const service = useMachine(lifecycleMachine);

	<button id="lifecycle-next" onClick={() => service.send({ type: 'NEXT' })}>next</button>
}

export function PortalFixture(props: {
	target?: HTMLElement | null;
	disabled?: boolean;
	getRootNode?: () => Document | ShadowRoot | Node;
}) @{
	<div id="portal-owner">
		<Portal
			container={props.target === undefined ? undefined : { current: props.target }}
			disabled={props.disabled}
			getRootNode={props.getRootNode}
		>
			<span id="portalled-first">first</span>
			<span id="portalled-second">second</span>
		</Portal>
	</div>
}
