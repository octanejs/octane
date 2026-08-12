import type { PortalProps } from '@octanejs/drei';

const props: PortalProps = {
	blend: 0.5,
	blur: 0.2,
	resolution: 128,
	worldUnits: true,
	eventPriority: 2,
};
void props;

// @ts-expect-error resolution must be numeric
const invalid: PortalProps = { resolution: '128' };
void invalid;
