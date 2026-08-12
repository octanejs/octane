/** @jsxImportSource octane */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReferenceProviderHarness } from '../runtime/_fixtures/Harness.tsrx';
import { createRootTracker, settle } from './_helpers';

const { tracked, cleanup } = createRootTracker();
afterEach(function cleanupReferenceSuite() {
	cleanup();
	vi.restoreAllMocks();
});

// Ported from packages/popper/upstream/tag/src/Reference.test.js
describe('Arrow component', function referenceSuite() {
	it('renders the expected markup', function rendersExpectedMarkup() {
		const setReferenceNode = vi.fn();
		const root = tracked(ReferenceProviderHarness, { setReferenceNode });
		settle();
		// Upstream snapshot is a single empty <div />; id is a query aid only.
		const reference = root.find('#reference');
		expect(reference).toBeInstanceOf(HTMLDivElement);
		expect(reference.tagName).toBe('DIV');
		expect(reference.childNodes.length).toBe(0);
		expect(root.container.querySelectorAll('*').length).toBe(1);
		expect(root.container.firstElementChild).toBe(reference);
	});

	it('consumes the ManagerReferenceNodeSetterContext from Manager', function consumesManagerContext() {
		const setReferenceNode = vi.fn();
		tracked(ReferenceProviderHarness, { setReferenceNode });
		settle();
		expect(setReferenceNode).toHaveBeenCalled();
	});

	it('warns when setReferenceNode is present', function warnsWhenPresent() {
		const error = vi.spyOn(console, 'error').mockImplementation(function noop() {});
		tracked(ReferenceProviderHarness, { setReferenceNode: vi.fn() });
		settle();
		expect(error).not.toHaveBeenCalled();
	});

	it('does not warn when setReferenceNode is not present', function doesNotWarnWhenAbsent() {
		const error = vi.spyOn(console, 'error').mockImplementation(function noop() {});
		const root = tracked(ReferenceProviderHarness, { setReferenceNode: undefined });
		settle();
		expect(root.container.querySelectorAll('*').length).toBe(1);
		expect(root.find('#reference')).toBeInstanceOf(HTMLDivElement);
		expect(error).toHaveBeenCalledWith(
			'Warning: `Reference` should not be used outside of a `Manager` component.',
		);
	});
});
