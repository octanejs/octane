import { Activity } from 'octane';
import type { CaughtRevealProps } from './caught-reveal-model';

function MaybeThrow(props: { error: Error | null }) @{
	if (props.error !== null) throw props.error;
	<>.</>
}

function CaughtCell(props: { error: Error | null }) @{
	@try {
		<MaybeThrow error={props.error} />
	} @catch (_error: unknown, _reset: () => void) {
		<>.</>
	}
}

export function HiddenCaughtReveal(props: CaughtRevealProps) @{
	<Activity mode={props.mode}>
		<output data-caught-reveal="">
			@for (const index of props.indices; key index) {
				<CaughtCell error={props.errors === null ? null : props.errors[index]} />
			}
		</output>
	</Activity>
}
