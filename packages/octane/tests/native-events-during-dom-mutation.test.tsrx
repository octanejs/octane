import { expect, it, vi } from 'vitest';
import { useState } from 'octane';
import { mount } from './_helpers';

declare module 'octane/jsx-runtime' {
	namespace Octane {
		namespace JSX {
			interface IntrinsicElements {
				'octane-mutation-event': IntrinsicElements['div'];
			}
		}
	}
}

// Like a browser firing blur when a focused input becomes disabled, a custom
// element can dispatch a native event synchronously during a DOM attribute update.
customElements.define(
	'octane-mutation-event',
	class extends HTMLElement {
		static observedAttributes = ['data-value'];
		attributeChangedCallback(_name: string, previous: string | null, value: string | null) {
			if (this.isConnected && previous !== null && previous !== value) {
				this.dispatchEvent(new Event('input', { bubbles: true }));
			}
		}
	},
);

function MutationChild({ value, onInput }: { value: number; onInput: () => void }) {
	return <octane-mutation-event data-value={value} onInput={onInput} />;
}

function MutationParent({ value }: { value: number }) {
	const [events, setEvents] = useState(0);
	return <section>
		<MutationChild value={value} onInput={() => setEvents((count) => count + 1)} />
		<output>{events as number}</output>
	</section>;
}

it(
	'commits native event updates from a child DOM mutation without render-phase diagnostics',
	() => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const view = mount(MutationParent, { value: 0 });
		try {
			expect(view.find('output').textContent).toBe('0');
			view.update(MutationParent, { value: 1 });
			expect(view.find('output').textContent).toBe('1');
			expect(error).not.toHaveBeenCalled();
			view.update(MutationParent, { value: 2 });
			expect(view.find('output').textContent).toBe('2');
			expect(error).not.toHaveBeenCalled();
		} finally {
			view.unmount();
			error.mockRestore();
		}
	},
);
