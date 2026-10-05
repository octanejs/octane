import { useEffect, useLayoutEffect } from 'octane';

type FailureMode = 'none' | 'render' | 'layout' | 'passive' | 'layout-cleanup' | 'passive-cleanup';

interface FailureProps {
	mode: FailureMode;
	message: string;
	log: (entry: string) => void;
}

function Failure(props: FailureProps) @{
	if (props.mode === 'render') throw new Error(props.message);
	useLayoutEffect(() => {
		props.log(`mount:${props.message}`);
		return () => props.log(`cleanup:${props.message}`);
	}, []);
	useLayoutEffect(() => {
		if (props.mode === 'layout') throw new Error(props.message);
		return () => {
			if (props.mode === 'layout-cleanup') throw new Error(props.message);
		};
	}, [props.mode]);
	useEffect(() => {
		if (props.mode === 'passive') throw new Error(props.message);
		return () => {
			if (props.mode === 'passive-cleanup') throw new Error(props.message);
		};
	}, [props.mode]);
	<content name={props.message} />
}

interface CatchProps {
	bodyMode: FailureMode;
	fallbackMode: FailureMode;
	sibling?: boolean;
	log: (entry: string) => void;
}

export function CatchEffects(props: CatchProps) @{
	<scene>
		@try {
			<>
				<Failure mode={props.bodyMode} message="primary" log={props.log} />
				@if (props.sibling) {
					<Failure mode={props.bodyMode} message="sibling" log={props.log} />
				}
			</>
		} @catch (error, reset) {
			<inner-fallback error={String(error)} onPress={() => reset()}>
				<Failure mode={props.fallbackMode} message="fallback" log={props.log} />
			</inner-fallback>
		}
	</scene>
}

export function NestedCatchEffects(props: CatchProps) @{
	<scene>
		@try {
			<CatchEffects {...props} />
		} @catch (error, reset) {
			<outer-fallback error={String(error)} onPress={() => reset()} />
		}
	</scene>
}
