import { HiddenText, LiveRegion, useAnnouncement } from '@octanejs/dnd-kit-accessibility';
import type { Assert, Equal } from '../../../scripts/react-port/type-assertions';

const { announce, announcement } = useAnnouncement();
type _announce = Assert<Equal<typeof announce, (value: string | undefined) => void>>;
type _announcement = Assert<Equal<typeof announcement, string>>;
type _liveRegion = Assert<
	Equal<
		Parameters<typeof LiveRegion>[0],
		{ id: string; announcement: string; ariaLiveType?: 'polite' | 'assertive' | 'off' }
	>
>;
type _hiddenText = Assert<Equal<Parameters<typeof HiddenText>[0], { id: string; value: string }>>;

// @ts-expect-error live regions accept only ARIA live values
LiveRegion({ id: 'region', announcement: '', ariaLiveType: 'loud' });
