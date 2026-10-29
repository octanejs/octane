/**
 * @octanejs/dnd-kit-utilities exports every runtime value that @dnd-kit/utilities@3.2.2
 * exports, with the same kind of value under each name.
 */
import { expect, it } from 'vitest';
import * as upstream from '@dnd-kit/utilities';
import * as port from '@octanejs/dnd-kit-utilities';
import { exportSurface } from '../../dnd-kit-core/tests/_export-surface';

it('exports the runtime surface of @dnd-kit/utilities@3.2.2', () => {
	expect(exportSurface(port)).toEqual(exportSurface(upstream));
});
