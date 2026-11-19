import { motion, m, RetainedPresence, useAnimationControls, useIsPresent } from '@octanejs/motion';
import { Activity, useLayoutEffect, useState } from 'octane';
import type { Ref } from 'octane';
import type { LegacyAnimationControls } from 'motion-dom';

function Row({
	record,
	hostRef,
	exit = true,
	label = 'Row',
	hostComplete,
	animate = 1,
	display,
	disabled = false,
	end = false,
}: {
	record: (event: string) => void;
	hostRef?: Ref<HTMLButtonElement>;
	exit?: boolean;
	label?: string;
	hostComplete?: () => void;
	animate?: number;
	display?: string;
	disabled?: boolean;
	end?: boolean;
}) @{
	const present = useIsPresent();
	const Host = disabled ? m.button : motion.button;
	const [count, setCount] = useState(0);
	useLayoutEffect(() => {
		record('mount');
		return () => record('cleanup');
	}, [record]);
	<Host
		id="row"
		ref={hostRef}
		initial={false}
		animate={{ opacity: animate, ...(display ? { display } : {}) }}
		exit={exit ? { opacity: 0, ...(end ? { transitionEnd: { display: 'none' } } : {}) } : undefined}
		transition={{ duration: 0.42 }}
		inert={!present}
		aria-hidden={!present}
		onClick={() => setCount(count + 1)}
		onAnimationComplete={() => {
			record('host-complete');
			hostComplete?.();
		}}
	>
		{`${label}:${count}`}
	</Host>
}

export function RetainedToggle({
	show,
	record,
	hostRef,
	exit,
	label,
	hostComplete,
	animate,
	display,
	disabled,
	end,
	activity = 'visible',
	rowKey = 'row',
}: {
	show: boolean;
	record: (event: string) => void;
	hostRef?: Ref<HTMLButtonElement>;
	exit?: boolean;
	label?: string;
	activity?: 'visible' | 'hidden';
	rowKey?: string;
	hostComplete?: () => void;
	animate?: number;
	display?: string;
	disabled?: boolean;
	end?: boolean;
}) @{
	<Activity mode={activity}>
		<RetainedPresence onExitComplete={() => record('complete')}>
			{show ? (
				<Row
					key={rowKey}
					record={record}
					hostRef={hostRef}
					exit={exit}
					label={label}
					hostComplete={hostComplete}
					animate={animate}
					display={display}
					disabled={disabled}
					end={end}
				/>
			) : null}
		</RetainedPresence>
	</Activity>
}

export function InvalidPresence({ record }: { record: (event: string) => void }) @{
	<RetainedPresence>
		<Row record={record} />
	</RetainedPresence>
}

function RemovableRow({
	record,
	initial = false,
}: {
	record: (event: string) => void;
	initial?: false | { opacity: number };
}) @{
	const present = useIsPresent();
	const [version, setVersion] = useState(0);
	useLayoutEffect(() => () => record('cleanup'), [record]);
	<div id="removable" data-present={present}>
		<button id="replace-host" onClick={() => setVersion(version + 1)}>
			Replace
		</button>
		<button id="remove-host" onClick={() => setVersion(-1)}>
			Remove
		</button>
		@if (version >= 0) {
			<motion.div
				key={version}
				id="exit-host"
				initial={initial}
				animate={{ opacity: 1 }}
				exit={{ opacity: 0 }}
			/>
		}
	</div>
}

export function RetainedRemovable({
	show,
	record,
	initial,
}: {
	show: boolean;
	record: (event: string) => void;
	initial?: false | { opacity: number };
}) @{
	<RetainedPresence onExitComplete={() => record('complete')}>
		{show ? <RemovableRow key="row" record={record} initial={initial} /> : null}
	</RetainedPresence>
}

function ControllerRow({
	record,
	onReady,
	forceSecond,
}: {
	record: (event: string) => void;
	onReady?: (controls: LegacyAnimationControls) => void;
	forceSecond?: boolean;
}) @{
	const first = useAnimationControls(),
		second = useAnimationControls();
	const [mode, setMode] = useState(0);
	useLayoutEffect(() => onReady?.(first), [first, onReady]);
	<div>
		<button id="switch-controller" onClick={() => setMode(mode + 1)}>
			Switch
		</button>
		<motion.div
			id="controller-exit"
			initial={false}
			style={{ opacity: 0 }}
			animate={forceSecond ? second : mode === 0 ? first : mode === 1 ? second : { opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.15, ease: 'linear' }}
			onAnimationComplete={() => record('host-complete')}
		/>
	</div>
}

export function RetainedControllerToggle({
	show,
	record,
	onReady,
	forceSecond,
}: {
	show: boolean;
	record: (event: string) => void;
	onReady?: (controls: LegacyAnimationControls) => void;
	forceSecond?: boolean;
}) @{
	<RetainedPresence onExitComplete={() => record('complete')}>
		{show ? (
			<ControllerRow key="row" record={record} onReady={onReady} forceSecond={forceSecond} />
		) : null}
	</RetainedPresence>
}

function NamedRow({
	record,
	label: externalLabel,
}: {
	record: (event: string) => void;
	label?: string;
}) @{
	const [label, setLabel] = useState('first');
	<div>
		<button id="change-label" onClick={() => setLabel('second')}>
			Change
		</button>
		<motion.div
			id="named-exit"
			initial={false}
			animate={externalLabel ?? label}
			variants={{ first: { opacity: 1 }, second: { opacity: 1 } }}
			exit={{ opacity: 0 }}
			onAnimationComplete={(definition) =>
				record(typeof definition === 'string' ? definition : 'exit')
			}
		/>
	</div>
}

export function RetainedNamedToggle({
	show,
	record,
	label,
}: {
	show: boolean;
	record: (event: string) => void;
	label?: string;
}) @{
	<RetainedPresence onExitComplete={() => record('complete')}>
		{show ? <NamedRow key="row" record={record} label={label} /> : null}
	</RetainedPresence>
}
