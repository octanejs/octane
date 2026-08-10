import { ErrorCode, useDropzone } from '@octanejs/react-dropzone';
import { useState } from 'octane';

export function ReactDropzoneDemo() @{
	const [accepted, setAccepted] = useState<readonly string[]>([]);
	const [rejected, setRejected] = useState<readonly string[]>([]);
	const dropzone = useDropzone({
		accept: { 'image/*': ['.png', '.jpg', '.jpeg'] },
		maxFiles: 3,
		maxSize: 2_000_000,
		async validator(file) {
			// Represents local asynchronous inspection; this demo performs no upload.
			await new Promise((resolve) => setTimeout(resolve, 75));
			return file.name.toLowerCase().includes('private')
				? { code: 'private-name', message: 'Remove “private” from the file name.' }
				: null;
		},
		onDrop(acceptedFiles, fileRejections) {
			setAccepted(acceptedFiles.map((file) => file.name));
			setRejected(
				fileRejections.map(
					({ file, errors }) => `${file.name}: ${errors.map((error) => error.message).join(', ')}`,
				),
			);
		},
	});

	<div>
		<h2 class="demo-title">{'React Dropzone on Octane'}</h2>
		<p
			class="demo-blurb"
		>{'Drop, paste, or choose up to three PNG/JPEG files. Validation stays local; nothing is uploaded.'}</p>
		<section
			{...dropzone.getRootProps({
				class: 'panel',
				style: 'min-height: 11rem; display: grid; place-items: center; text-align: center; border-style: dashed;',
			})}
		>
			<input {...dropzone.getInputProps()} />
			<div>
				<strong>
					{dropzone.isProcessing
						? 'Checking files…'
						: dropzone.isDragReject
							? 'Those files will be rejected'
							: dropzone.isDragAccept
								? 'Release to accept files'
								: 'Drop files here, click, or paste'}
				</strong>
				<p>{'PNG/JPEG · 2 MB each · maximum 3'}</p>
				<button
					type="button"
					class="btn"
					onClick={(event) => {
						event.stopPropagation();
						dropzone.open();
					}}
				>{'Choose files programmatically'}</button>
			</div>
		</section>
		<div class="panel">
			<h3>{'Accepted'}</h3>
			<p>
				{accepted.length ? accepted.join(', ') : 'No accepted files yet.'}
			</p>
			<h3>{'Rejected'}</h3>
			<p>
				{rejected.length ? rejected.join(' · ') : 'No rejected files yet.'}
			</p>
			<small>{`Built-in rejection code example: ${ErrorCode.FileTooLarge}`}</small>
		</div>
	</div>
}
