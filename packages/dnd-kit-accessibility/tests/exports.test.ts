/**
 * @octanejs/dnd-kit-accessibility exports every runtime value that @dnd-kit/accessibility@3.1.1
 * exports, with the same kind of value under each name.
 */
import { expect, it } from 'vitest';
import * as upstream from '@dnd-kit/accessibility';
import * as port from '@octanejs/dnd-kit-accessibility';
import { exportSurface } from '../../dnd-kit-core/tests/_export-surface';

it('exports the runtime surface of @dnd-kit/accessibility@3.1.1', () => {
	expect(exportSurface(port)).toEqual(exportSurface(upstream));
});
