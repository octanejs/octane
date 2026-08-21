import { createSubSlot } from 'octane';

export const subSlot = createSubSlot({
	parentDescriptionFallback: '@octanejs/mobx',
	slotlessPrefix: '@octanejs/mobx:',
	global: false,
	slotlessGlobal: true,
});
