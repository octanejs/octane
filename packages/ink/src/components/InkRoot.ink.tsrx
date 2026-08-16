/** @jsxImportSource @octanejs/ink/intrinsics */
import { universalComponent, type UniversalComponent } from 'octane/universal/native';
import type { InkComponent } from '../component.js';
import type { CursorPosition } from '../log-update.js';
import { accessibilityContext as AccessibilityContext } from './AccessibilityContext.js';
import App from './App.ink.tsrx';
import type { SuspendTerminal } from './AppContext.js';

export interface InkRootProps<P> {
	readonly component: InkComponent<P>;
	readonly componentProps: P;
	readonly stdin: NodeJS.ReadStream;
	readonly stdout: NodeJS.WriteStream;
	readonly stderr: NodeJS.WriteStream;
	readonly exitOnCtrlC: boolean;
	readonly interactive: boolean;
	readonly renderThrottleMs: number;
	readonly isScreenReaderEnabled: boolean;
	readonly writeToStdout: (data: string) => void;
	readonly writeToStderr: (data: string) => void;
	readonly setCursorPosition: (position: CursorPosition | undefined) => void;
	readonly onExit: (errorOrResult?: unknown) => void;
	readonly onWaitUntilRenderFlush: () => Promise<void>;
	readonly onSuspendTerminal: SuspendTerminal;
	readonly onRegisterInputControl: (pauseInput: () => void, resumeInput: () => void) => void;
}

export function InkRoot<P>({ component, componentProps, ...props }: InkRootProps<P>) @{
	<AccessibilityContext.Provider value={{ isScreenReaderEnabled: props.isScreenReaderEnabled }}>
		<App
			stdin={props.stdin}
			stdout={props.stdout}
			stderr={props.stderr}
			exitOnCtrlC={props.exitOnCtrlC}
			interactive={props.interactive}
			renderThrottleMs={props.renderThrottleMs}
			writeToStdout={props.writeToStdout}
			writeToStderr={props.writeToStderr}
			setCursorPosition={props.setCursorPosition}
			onExit={props.onExit}
			onWaitUntilRenderFlush={props.onWaitUntilRenderFlush}
			onSuspendTerminal={props.onSuspendTerminal}
			onRegisterInputControl={props.onRegisterInputControl}
		>{universalComponent(
			'ink',
			component as unknown as UniversalComponent<P>,
			componentProps as unknown as Readonly<Record<string, unknown>>,
		)}</App>
	</AccessibilityContext.Provider>
}
