import { type ComponentType, createRoot } from 'octane';

export function mount(container: HTMLElement, Component: ComponentType) {
	createRoot(container).render(Component, {});
}
