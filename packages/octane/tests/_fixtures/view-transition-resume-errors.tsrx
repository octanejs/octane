import { ViewTransition, startTransition, useEffect, useLayoutEffect, useState } from 'octane';

interface ResumeProps {
	read: () => string;
	controls: Record<string, (value: string) => void>;
	events: string[];
	passiveUrgent?: boolean;
}

function Value(props: ResumeProps & { id: string }) @{
	const [value, setValue] = useState('initial');
	useLayoutEffect(() => {
		props.controls[props.id] = setValue;
	}, []);
	useEffect(() => {
		if (props.id === 'queued') {
			props.events.push('passive');
			const update = () => props.controls.passive('from passive');
			if (props.passiveUrgent) update();
			else startTransition(update);
		}
	}, []);
	<span data-value={props.id}>{value as string}</span>
}

function Resolved(props: ResumeProps) @{
	const value = props.read();
	<span data-value="resume">{value as string}</span>
}

export function ResumeBatchApp(props: ResumeProps) @{
	<div>
		<ViewTransition scope="element" name="resume">
			<section data-owner="resume">
				@try {
					<Resolved {...props} />
				} @pending {
					<span data-value="resume">Waiting</span>
				}
			</section>
		</ViewTransition>
		<ViewTransition scope="element" name="queued">
			<section data-owner="queued">
				<Value {...props} id="queued" />
			</section>
		</ViewTransition>
		<ViewTransition scope="element" name="passive">
			<section data-owner="passive">
				<Value {...props} id="passive" />
			</section>
		</ViewTransition>
	</div>
}

interface FailureProps {
	fail: boolean;
	error: unknown;
	label?: string;
}

function ThrowingValue(props: FailureProps) @{
	if (props.fail) throw props.error;
	<span>{props.label ?? 'Initial'}</span>
}

export function RenderFailureApp(props: FailureProps) @{
	<ViewTransition name="failure">
		<section>
			<ThrowingValue {...props} />
		</section>
	</ViewTransition>
}

export function EnteringBoundaryApp(props: { show: boolean }) @{
	<>
		@if (props.show) {
			<ViewTransition name="entering">
				<section>Entered</section>
			</ViewTransition>
		} @else {
			<span>Initial</span>
		}
	</>
}

function LayoutValue(props: FailureProps) @{
	const [fail, setFail] = useState(false);
	useLayoutEffect(() => {
		if (props.fail) setFail(true);
	}, [props.fail]);
	if (fail) throw props.error;
	<span>
		{props.fail ? 'Prepared' : 'Initial'}
	</span>
}

export function UnsupportedScopeFailureApp(props: FailureProps) @{
	<ViewTransition scope="element" name="unsupported">
		<section>
			<LayoutValue {...props} />
		</section>
	</ViewTransition>
}
