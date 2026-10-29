import type { DOMAttributes } from 'octane';
import type { Without } from '@octanejs/dnd-kit-utilities';

export type SyntheticEventName = keyof Without<
	DOMAttributes<any>,
	'children' | 'dangerouslySetInnerHTML'
>;
