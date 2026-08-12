import Dropzone from '../src/index.tsrx';

export const fileDialog = (
	<Dropzone
		onDrop={(files) => console.log(files)}
		onFileDialogCancel={() => console.log('cancel')}
		onFileDialogOpen={() => console.log('open')}
	>
		{({ getRootProps, getInputProps, open, isFileDialogActive, isProcessing }) => (
			<div {...getRootProps()} data-active={isFileDialogActive} data-processing={isProcessing}>
				<input {...getInputProps()} />
				<button type="button" onClick={open}>
					Open file dialog
				</button>
			</div>
		)}
	</Dropzone>
);
