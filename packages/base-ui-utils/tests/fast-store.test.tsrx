import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@octanejs/testing-library';
import { fastComponent } from '../src/fastHooks';
import { ReactStore } from '../src/store/ReactStore';

const selectors = {
	open: (state: { open: boolean; payload: number }) => state.open,
	payload: (state: { open: boolean; payload: number }) => state.payload,
};

type PopupStore = ReactStore<{ open: boolean; payload: number }, {}, typeof selectors>;
const Popup = fastComponent(function Popup({ store }: { store: PopupStore }) {
	const open = store.useState('open');
	const payload = store.useState('payload');
	return <output aria-label="popup">{`${open}:${payload}` as string}</output>;
});

describe('fast store subscriptions', () => {
	// @parity-case ordinary:base-ui-utils-native-store
	it('renders the latest values of every selector after consecutive updates', async () => {
		const store = new ReactStore({ open: false, payload: 0 }, {}, selectors);
		render(<Popup store={store} />);
		expect(screen.getByLabelText('popup').textContent).toBe('false:0');
		await act(() => {
			store.set('payload', 8);
			store.set('open', true);
		});
		expect(screen.getByLabelText('popup').textContent).toBe('true:8');
		await act(() => {
			store.set('open', false);
			store.set('payload', 9);
		});
		expect(screen.getByLabelText('popup').textContent).toBe('false:9');
	});
});
