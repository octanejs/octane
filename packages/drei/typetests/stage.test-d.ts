import { Stage, type StageProps } from '@octanejs/drei';

const props: StageProps = {
	preset: 'portrait',
	shadows: 'contact',
	adjustCamera: 1.2,
	environment: 'city',
	intensity: 0.5,
};
void props;
void Stage;

// @ts-expect-error unknown preset
const invalid: StageProps = { preset: 'dramatic' };
void invalid;
