/** @jsxImportSource react */
import type { StoryObj } from '@storybook/react-vite';
import { OctaneCompat } from 'octane/react';
import { Counter } from './Counter.tsrx';
import meta from './Counter.stories.tsx';

export const typedBridge = (
	<OctaneCompat component={Counter} props={{ label: 'Add two', step: 2, disabled: false }} />
);

export const wrongBridgeProp = (
	// @ts-expect-error — native component props stay typed across the React bridge.
	<OctaneCompat component={Counter} props={{ label: 'Add', step: '2', disabled: false }} />
);

export const typedStory = {
	args: { label: 'Add two', step: 2, disabled: false },
} satisfies StoryObj<typeof meta>;

export const wrongStoryProp = {
	args: {
		// @ts-expect-error — Storybook args retain the native component's prop types.
		step: '2',
	},
} satisfies StoryObj<typeof meta>;
