import { createRoot } from 'octane';
import { AcquisitionProbe, HookProbe } from '../dropzone.tsrx';

function BrowserProbe() @{
	<section>
		<HookProbe
			options={{
				onDrop(files: File[]) {
					document.body.dataset.lastDrop = files.map((file) => file.name).join(',');
				},
			}}
			rootRef={null}
			inputRef={null}
		/>
		<AcquisitionProbe
			options={{
				useFsAccessApi: true,
				accept: [
					{ description: 'Text', accept: { 'text/plain': ['.txt'] } },
				],
				onDrop(files: File[]) {
					document.body.dataset.lastPicker = files.map((file) => file.name).join(',');
				},
			}}
		/>
	</section>
}

const root = createRoot(document.querySelector('#app')!);
root.render(BrowserProbe);
