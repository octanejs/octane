import Dropzone from '../src/index.tsrx';

export const all = (
	<Dropzone
		onDrop={(acceptedFiles, fileRejections, event) =>
			console.log(acceptedFiles, fileRejections, event)
		}
		onDragEnter={(event) => console.log(event)}
		onDragOver={(event) => console.log(event)}
		onDragLeave={(event) => console.log(event)}
		onDropAccepted={(files, event) => console.log(files, event)}
		onDropRejected={(files, event) => console.log(files, event)}
		onFileDialogCancel={() => console.log('cancel')}
		onFileDialogOpen={() => console.log('open')}
		onError={(error) => console.log(error)}
		validator={(file) => ({ message: file.name, code: '' })}
		minSize={2000}
		maxSize={Number.POSITIVE_INFINITY}
		maxFiles={100}
		preventDropOnDocument
		noClick={false}
		noKeyboard={false}
		noDrag={false}
		noDragEventsBubbling={false}
		noPaste={false}
		disabled
		multiple={false}
		accept={{ 'image/*': ['.png'] }}
		useFsAccessApi={false}
		autoFocus
	>
		{({ getRootProps, getInputProps }) => (
			<div {...getRootProps()}>
				<input {...getInputProps()} />
			</div>
		)}
	</Dropzone>
);
