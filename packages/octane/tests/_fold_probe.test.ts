import { describe, it, expect } from 'vitest';
import { mount } from './_helpers';
import { Count } from './_fixtures/_return_count.tsrx';
import { AtBraceCount } from './_fixtures/_atbrace_count.tsrx';

describe('fold: return-based produces byte-identical DOM to @{}', () => {
	it('same innerHTML (markerless single-root mount)', () => {
		const a = mount(Count as any);
		const b = mount(AtBraceCount as any);
		expect(a.container.innerHTML).toBe(b.container.innerHTML);
		expect(a.container.innerHTML).toBe('<button>0</button>');
		a.unmount();
		b.unmount();
	});
});
