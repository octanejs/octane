import { type ComponentType, createElement } from 'react';
import { createRoot } from 'react-dom/client';

export function mount(container: HTMLElement, Component: ComponentType) {
	createRoot(container).render(createElement(Component));
}
