import { useSeparator } from '@octanejs/aria';

export function run() {
	return useSeparator({
		id: 'minimal-aria',
		'aria-label': 'Sections',
		orientation: 'vertical',
	}).separatorProps;
}
