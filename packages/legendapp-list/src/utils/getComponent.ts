import { type ComponentType, createElement, isValidElement, type OctaneElement } from 'octane';

/**
 * Gets a component from a React component type or React element.
 * @param Component - The component to get.
 * @returns The component, or null if the component is not valid.
 */
export const getComponent = (Component: ComponentType<any> | OctaneElement) => {
	if (isValidElement<any>(Component)) {
		return Component;
	}
	if (Component) {
		return createElement(Component);
	}
	return null;
};
