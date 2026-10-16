/** @jsxImportSource react */
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Counter } from './Counter.tsrx';
import { asReact } from './asReact.tsx';

const meta = {
	title: 'Octane/Counter',
	component: asReact(Counter),
	args: { label: 'Increment', step: 1, disabled: false },
	argTypes: {
		label: { control: 'text' },
		step: { control: 'number' },
		disabled: { control: 'boolean' },
	},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const LargeStep: Story = {
	args: { label: 'Add five', step: 5 },
};
