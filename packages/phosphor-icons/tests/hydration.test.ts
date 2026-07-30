import { createElement as createReactElement } from 'react';
import { renderToString as renderReactToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { flushSync, hydrateRoot } from 'octane';
import { Camera } from '@octanejs/phosphor-icons';
import { SSR as ReactPhosphor } from '@phosphor-icons/react';

describe('@octanejs/phosphor-icons — hydration', () => {
	it('adopts the server-rendered SVG host and keeps it live', () => {
		const props = { size: 32, color: 'purple', weight: 'duotone' as const, alt: 'Camera' };
		const container = document.createElement('div');
		container.innerHTML = renderReactToString(createReactElement(ReactPhosphor.Camera, props));
		document.body.appendChild(container);
		const serverSvg = container.querySelector('svg')!;
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});

		const root = hydrateRoot(container, Camera, props);
		expect(container.querySelector('svg')).toBe(serverSvg);
		expect(container.querySelectorAll('svg')).toHaveLength(1);
		expect(error).not.toHaveBeenCalled();
		flushSync(() => root.render(Camera, { ...props, color: 'green' }));
		expect(container.querySelector('svg')).toBe(serverSvg);
		expect(serverSvg.getAttribute('fill')).toBe('green');

		root.unmount();
		expect(container.querySelector('svg')).toBeNull();
		error.mockRestore();
		container.remove();
	});
});
