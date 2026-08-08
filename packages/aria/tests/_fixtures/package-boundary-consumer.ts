import { useSeparator } from '@octanejs/aria';

export function run() {
	return useSeparator({
		id: 'aria-bundle-separator',
		'aria-label': 'Sections',
		orientation: 'vertical',
	}).separatorProps;
}
