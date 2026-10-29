/**
 * @octanejs/dnd-kit-sortable exports every runtime value that @dnd-kit/sortable@10.0.0
 * exports, with the same kind of value under each name.
 */
import { expect, it } from 'vitest';
import * as upstream from '@dnd-kit/sortable';
import * as port from '@octanejs/dnd-kit-sortable';
import { exportSurface } from '../../dnd-kit-core/tests/_export-surface';

it('exports the runtime surface of @dnd-kit/sortable@10.0.0', () => {
	expect(exportSurface(port)).toEqual(exportSurface(upstream));
});
