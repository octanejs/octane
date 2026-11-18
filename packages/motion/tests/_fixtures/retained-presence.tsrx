import { motion, m, RetainedPresence, useIsPresent } from '@octanejs/motion';
import { Activity, useLayoutEffect, useState } from 'octane';
import type { Ref } from 'octane';

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

function RemovableRow({ record }: { record: (event: string) => void }) @{
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
			<motion.div key={version} id="exit-host" exit={{ opacity: 0 }} />
		}
	</div>
}

export function RetainedRemovable({
	show,
	record,
}: {
	show: boolean;
	record: (event: string) => void;
}) @{
	<RetainedPresence onExitComplete={() => record('complete')}>
		{show ? <RemovableRow key="row" record={record} /> : null}
	</RetainedPresence>
}
