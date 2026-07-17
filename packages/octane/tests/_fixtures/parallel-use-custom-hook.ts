import { use } from 'octane';

type LoadResource = (resource: string, version: number) => Promise<string>;

// Data hooks commonly live outside the component module. These reads do not
// depend on one another, so both resources can begin in the same attempt.
export function useImportedPair(load: LoadResource, version: number) {
	const project = use(load('project', version));
	const viewer = use(load('viewer', version));
	return { project, viewer };
}

export function useImportedDependent(
	loadProject: () => Promise<{ ownerId: string }>,
	loadOwner: (ownerId: string) => Promise<string>,
) {
	const project = use(loadProject());
	const owner = use(loadOwner(project.ownerId));
	return { project, owner };
}

// Promise factories often receive callbacks. The outer version remains a
// reactive input even when a narrower block uses the same spelling, while a
// JavaScript label is control-flow syntax rather than a runtime value.
export function useImportedCaptured(load: LoadResource, version: number) {
	const captured = use(
		load(
			'captured',
			(() => {
				if (version < 0) {
					const version = 0;
					return version;
				}
				resume: {
					break resume;
				}
				return version;
			})(),
		),
	);
	return captured;
}
