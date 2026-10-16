import type { StorybookConfig } from '@storybook/react-vite';
import react from '@vitejs/plugin-react';
import { octane } from 'octane/compiler/vite';
import { mergeConfig } from 'vite';

const config: StorybookConfig = {
	stories: ['../src/**/*.stories.tsx'],
	framework: '@storybook/react-vite',
	typescript: { reactDocgen: false },
	async viteFinal(config) {
		return mergeConfig(config, {
			plugins: [octane({ requireDirective: true }), react()],
			// The workspace Octane package resolves to raw TypeScript source.
			optimizeDeps: { exclude: ['octane'], include: ['octane > devalue'] },
		});
	},
};

export default config;
