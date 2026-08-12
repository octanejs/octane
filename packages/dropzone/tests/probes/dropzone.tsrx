import Dropzone, { useDropzone } from '../../src/index.tsrx';
import { useEffect } from 'octane';

export function HookProbe(props: { options: any; rootRef: any; inputRef: any }) @{
	const state = useDropzone(props.options);
	<div {...state.getRootProps({ 'data-probe': 'root', ref: props.rootRef })}>
		<input {...state.getInputProps({ 'data-probe': 'input', ref: props.inputRef })} />
		<output>{`${state.acceptedFiles.map((file) => file.name).join(
			',',
		)}|${state.isProcessing}`}</output>
	</div>
}

export function ComponentProbe(props: { options: any; dropzoneRef: any }) @{
	<Dropzone {...props.options} ref={props.dropzoneRef}>
		{(state) => <div {...state.getRootProps({ 'data-probe': 'root' })}>
			<input {...state.getInputProps({ 'data-probe': 'input' })} />
			<span>{String(state.acceptedFiles.length)}</span>
		</div>}
	</Dropzone>
}

export function BlockChildrenProbe() @{
	<Dropzone>
		<section data-probe="block-child">{'idiomatic block child'}</section>
	</Dropzone>
}

export function ZeroArgProbe(props: { capture: (state: any) => void }) @{
	const state = useDropzone();
	useEffect(() => props.capture(state), [state, props.capture]);
	<div {...state.getRootProps({ 'data-probe': 'zero-arg' })} />
}

export function OptionsCallProbe(props: { capture: (state: any) => void }) @{
	const state = useDropzone({ noClick: true });
	useEffect(() => props.capture(state), [state, props.capture]);
	<div {...state.getRootProps({ 'data-probe': 'options-call' })} />
}

export function StateProbe(props: {
	options: any;
	rootRef?: any;
	inputRef?: any;
	rootProps?: any;
	inputProps?: any;
}) @{
	const state = useDropzone(props.options);
	<div {...state.getRootProps({ 'data-probe': 'root', ref: props.rootRef, ...props.rootProps })}>
		<input
			{...state.getInputProps({ 'data-probe': 'input', ref: props.inputRef, ...props.inputProps })}
		/>
		<output>{[
			state.isFocused,
			state.isFileDialogActive,
			state.isDragActive,
			state.isDragAccept,
			state.isDragReject,
			state.isDragUnknown,
		].join('|')}</output>
	</div>
}

export function AcquisitionProbe(props: { options: any; includeInput?: boolean }) @{
	const state = useDropzone(props.options);
	<div {...state.getRootProps({ 'data-probe': 'root' })}>
		{props.includeInput !== false && <input {...state.getInputProps({ 'data-probe': 'input' })} />}
		<output>{JSON.stringify({
			accepted: state.acceptedFiles.map((file) => file.name),
			rejected: state.fileRejections.map(
				({ file, errors }) => ({
					name: file.name,
					codes: errors.map((error) => error.code),
					messages: errors.map((error) => error.message),
				}),
			),
			processing: state.isProcessing,
			drag: [state.isDragActive, state.isDragAccept, state.isDragReject, state.isDragUnknown],
			global: state.isDragGlobal,
			dialog: state.isFileDialogActive,
		})}</output>
	</div>
}

export function RefKeyProbe(props: { userRef: any; capture: (value: any) => void }) @{
	const state = useDropzone();
	const rootProps = state.getRootProps({ refKey: 'innerRef', innerRef: props.userRef });
	useEffect(() => props.capture(rootProps.innerRef), [rootProps.innerRef, props.capture]);
	<div data-probe="ref-key" ref={rootProps.innerRef}>{'ref key'}</div>
}
