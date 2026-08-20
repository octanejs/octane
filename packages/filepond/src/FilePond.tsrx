import { useImperativeHandle, useLayoutEffect, useRef } from 'octane';
import { create, supported, type FilePond as Pond, type FilePondOptions } from 'filepond';

const isSupported = supported();

const filteredMethods = [
	'setOptions',
	'on',
	'off',
	'onOnce',
	'appendTo',
	'insertAfter',
	'insertBefore',
	'isAttachedTo',
	'replaceElement',
	'restoreElement',
	'destroy',
];

type FilteredMethods =
	| 'setOptions'
	| 'on'
	| 'off'
	| 'onOnce'
	| 'appendTo'
	| 'insertAfter'
	| 'insertBefore'
	| 'isAttachedTo'
	| 'replaceElement'
	| 'restoreElement'
	| 'destroy';

export type FilePondHandle =
	{
		pond: Pond | null;
	} & Partial<Omit<Pond, FilteredMethods | keyof FilePondOptions>>;

export interface FilePondProps extends FilePondOptions {
	acceptedFileTypes?: string[];
	ref?: { current: FilePondHandle | null } | ((handle: FilePondHandle | null) => void) | null;
}

function pondOptionsFromProps(props: FilePondProps): FilePondOptions {
	const options: Record<string, unknown> = {};
	for (const key in props) {
		if (key === 'ref') continue;
		options[key] = (props as Record<string, unknown>)[key];
	}
	return options as FilePondOptions;
}

function copyPondMethods(handle: FilePondHandle, pond: Pond) {
	const keys = Object.keys(pond);
	for (let i = 0; i < keys.length; i++) {
		const key = keys[i]!;
		if (filteredMethods.indexOf(key) !== -1) continue;
		(handle as unknown as Record<string, unknown>)[key] = (pond as unknown as Record<
			string,
			unknown
		>)[key];
	}
}

export function FilePond(props: FilePondProps) @{
	const elementRef = useRef<HTMLDivElement | null>(null);
	const pondRef = useRef<Pond | undefined>(undefined);
	const inputCloneRef = useRef<HTMLInputElement | null>(null);
	const allowFilesSyncRef = useRef(true);
	const handleRef = useRef<FilePondHandle>({ pond: null });

	useLayoutEffect(function createPond() {
		const root = elementRef.current;
		if (!root) return;

		const input = root.querySelector('input[type="file"]') as HTMLInputElement | null;
		if (!input) return;
		inputCloneRef.current = input.cloneNode() as HTMLInputElement;

		if (!isSupported) return;

		const options = pondOptionsFromProps(props);
		if (options.onupdatefiles) {
			const cb = options.onupdatefiles;
			options.onupdatefiles = function onupdatefiles(items) {
				allowFilesSyncRef.current = false;
				cb(items);
			};
		}

		const pond = create(input, options);
		pondRef.current = pond;
		handleRef.current.pond = pond;
		copyPondMethods(handleRef.current, pond);

		return function destroyPond() {
			if (!pondRef.current) return;

			const bin = document.createElement('div');
			const pondElement = pondRef.current.element;
			if (pondElement) {
				bin.append(pondElement);
			}
			pondRef.current.destroy();
			pondRef.current = undefined;
			handleRef.current.pond = null;

			if (elementRef.current && inputCloneRef.current) {
				elementRef.current.append(inputCloneRef.current);
			}
		};
	}, []);

	useLayoutEffect(function syncPondOptions() {
		if (!pondRef.current) return;
		if (!allowFilesSyncRef.current) {
			allowFilesSyncRef.current = true;
			return;
		}
		const options = pondOptionsFromProps(props);
		delete (options as { onupdatefiles?: unknown }).onupdatefiles;
		pondRef.current.setOptions(options);
	}, null);

	useImperativeHandle(props.ref, function getHandle() {
		return handleRef.current;
	}, []);

	const accept =
		Array.isArray(props.acceptedFileTypes) ? props.acceptedFileTypes.join(',') : undefined;

	<div class="filepond--wrapper" ref={elementRef}>
		<input
			type="file"
			name={props.name}
			id={props.id ?? undefined}
			accept={accept}
			multiple={props.allowMultiple}
			required={props.required}
			class={props.className ?? undefined}
		/>
	</div>
}
