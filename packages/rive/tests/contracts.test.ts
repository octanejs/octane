import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, renderHook } from '@octanejs/testing-library';
import Rive, {
	Alignment,
	EventType,
	Fit,
	Layout,
	useGlobalViewModelInstance,
	useRive,
	useRiveFile,
	useStateMachineInput,
	useViewModel,
	useViewModelInstance,
	useViewModelInstanceArtboard,
	useViewModelInstanceBoolean,
	useViewModelInstanceColor,
	useViewModelInstanceEnum,
	useViewModelInstanceFont,
	useViewModelInstanceImage,
	useViewModelInstanceList,
	useViewModelInstanceNumber,
	useViewModelInstanceString,
	useViewModelInstanceTrigger,
} from '../src/index.ts';

afterEach(cleanup);

describe('re-export surface', function reexportSurface() {
	it('exports the official canvas wrapper hooks, default Rive, and canvas types', function surface() {
		expect(typeof Rive).toBe('function');
		expect(typeof useRive).toBe('function');
		expect(typeof useStateMachineInput).toBe('function');
		expect(typeof useRiveFile).toBe('function');
		expect(typeof useViewModel).toBe('function');
		expect(typeof useViewModelInstance).toBe('function');
		expect(typeof useGlobalViewModelInstance).toBe('function');
		expect(typeof useViewModelInstanceNumber).toBe('function');
		expect(typeof useViewModelInstanceString).toBe('function');
		expect(typeof useViewModelInstanceBoolean).toBe('function');
		expect(typeof useViewModelInstanceColor).toBe('function');
		expect(typeof useViewModelInstanceEnum).toBe('function');
		expect(typeof useViewModelInstanceTrigger).toBe('function');
		expect(typeof useViewModelInstanceImage).toBe('function');
		expect(typeof useViewModelInstanceFont).toBe('function');
		expect(typeof useViewModelInstanceList).toBe('function');
		expect(typeof useViewModelInstanceArtboard).toBe('function');
		expect(EventType.Load).toBe('load');
		expect(Fit.Cover).toBe('cover');
		expect(Alignment.Center).toBe('center');
		expect(typeof Layout).toBe('function');
	});
});

describe('useRive', function useRiveContracts() {
	// Per packages/rive/upstream/canonical/test/useRive.test.tsx
	it('returns rive as null if no params are passed', function nullBeforeLoad() {
		function useProbe() {
			return useRive();
		}
		const view = renderHook(useProbe);
		expect(view.result.current.rive).toBe(null);
		expect(view.result.current.canvas).toBe(null);
		expect(typeof view.result.current.setCanvasRef).toBe('function');
		expect(typeof view.result.current.setContainerRef).toBe('function');
		expect(typeof view.result.current.RiveComponent).toBe('function');
	});

	// Per packages/rive/upstream/canonical/test/useRive.test.tsx
	it('RiveComponent renders a canvas wrapper', function rendersCanvas() {
		function useProbe() {
			return useRive();
		}
		const hook = renderHook(useProbe);
		const view = render(hook.result.current.RiveComponent);
		const canvas = view.container.querySelector('canvas');
		expect(canvas).not.toBeNull();
		expect(canvas?.tagName).toBe('CANVAS');
		expect(view.container.firstElementChild?.tagName).toBe('DIV');
	});
});

describe('Rive Component', function riveComponentContracts() {
	it('mounts with inherited MediaQueryList event methods', function inheritedMediaQueryListeners() {
		const originalMatchMedia = window.matchMedia;
		const mediaQueryPrototype = {
			addEventListener: function addEventListener() {},
			removeEventListener: function removeEventListener() {},
		};
		window.matchMedia = function matchMedia(query: string) {
			return Object.assign(Object.create(mediaQueryPrototype), {
				matches: false,
				media: query,
				onchange: null,
				dispatchEvent: function dispatchEvent() {
					return false;
				},
			}) as MediaQueryList;
		};

		try {
			const view = render(Rive, {
				props: {
					src: 'foo.riv',
					'aria-label': 'Inherited listener',
				},
			});
			expect(view.getByLabelText('Inherited listener').tagName).toBe('CANVAS');
		} finally {
			window.matchMedia = originalMatchMedia;
		}
	});

	// Per packages/rive/upstream/canonical/test/Rive.test.tsx
	it('renders the component as a canvas and a div wrapper', function wrapperAndCanvas() {
		const view = render(Rive, {
			props: {
				src: 'foo.riv',
				className: 'container-styles',
				'aria-label': 'Foo label',
			},
		});
		expect(view.container.firstElementChild).not.toBeNull();
		expect(view.container.firstElementChild?.className).toBe('container-styles');
		const canvas = view.getByLabelText('Foo label');
		expect(canvas.tagName).toBe('CANVAS');
	});
});

describe('useStateMachineInput', function stateMachineContracts() {
	// Per packages/rive/upstream/canonical/test/useStateMachine.test.tsx
	it('returns null if there is null rive object passed', function nullWithoutRive() {
		function useProbe() {
			return useStateMachineInput(null);
		}
		const view = renderHook(useProbe);
		expect(view.result.current).toBeNull();
	});
});
