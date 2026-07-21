import { type Framework } from '~/libraries';

export const getExampleStartingPath = (framework: Framework, libraryId?: string) => {
	if (libraryId === 'start') {
		return 'src/routes/__root.tsx';
	}

	const dir = framework === 'angular' ? 'src/app' : 'src';

	return `${dir}/${getExampleStartingFileName(framework, libraryId)}` as const;
};

export function getExampleStartingFileName(framework: Framework, libraryId?: string) {
	const file =
		framework === 'angular'
			? 'app.component'
			: ['svelte', 'vue'].includes(framework)
				? 'App'
				: ['form', 'query', 'pacer', 'hotkeys'].includes(libraryId!)
					? 'index'
					: 'main';

	const ext =
		framework === 'svelte'
			? 'svelte'
			: framework === 'vue'
				? 'vue'
				: ['angular', 'lit'].includes(framework)
					? 'ts'
					: 'tsx';

	return `${file}.${ext}` as const;
}
