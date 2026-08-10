import { PositionalAudio, type PositionalAudioProps } from '../src/index.js';

const props: PositionalAudioProps = {
	url: '/sound.ogg',
	distance: 4,
	loop: false,
	autoplay: true,
};
PositionalAudio;
props;

// @ts-expect-error url is required
const missingUrl: PositionalAudioProps = { distance: 2 };
// @ts-expect-error distance is numeric
const invalidDistance: PositionalAudioProps = { url: '/sound.ogg', distance: 'near' };
