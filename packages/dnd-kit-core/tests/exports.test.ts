/**
 * @octanejs/dnd-kit-core exports every runtime value that @dnd-kit/core@6.3.1
 * exports, with the same kind of value under each name.
 */
import { expect, it } from 'vitest';
import * as upstream from '@dnd-kit/core';
import * as port from '@octanejs/dnd-kit-core';
import { exportSurface } from './_export-surface';

it('exports the runtime surface of @dnd-kit/core@6.3.1', () => {
	expect(exportSurface(port)).toEqual(exportSurface(upstream));
});
