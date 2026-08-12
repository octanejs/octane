import { threeRenderers } from '@octanejs/three/config';

export const dreiRenderers = {
	...threeRenderers,
	boundaries: {
		...threeRenderers.boundaries,
		'@octanejs/drei': {
			Html: { ownerRenderer: 'three', childRenderer: 'dom', prop: 'children' },
		},
	},
} as const;

export const renderers = dreiRenderers;
export default dreiRenderers;
