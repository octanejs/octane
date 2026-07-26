import { describe, expect, it } from 'vitest';
import { renderToString } from 'octane/server';
import {
	AlertFixture,
	BreadcrumbFixture,
	ButtonAsChildFixture,
	ButtonFixture,
	CardFixture,
	EmptyFixture,
	InputFixture,
	ItemFixture,
	KbdFixture,
	LabelFixture,
	NativeSelectFixture,
	PaginationFixture,
	SeparatorFixture,
	SkeletonFixture,
	SpinnerFixture,
	TableFixture,
	TextareaFixture,
} from '../_fixtures/tier1-app.tsrx';

const FIXTURES: Array<[string, () => unknown, string[]]> = [
	['Alert', AlertFixture, ['data-slot="alert"', 'role="alert"', 'text-destructive']],
	['Button', ButtonFixture, ['data-slot="button"', 'text-destructive', 'type="submit"']],
	['Button asChild', ButtonAsChildFixture, ['<a', 'data-slot="button"', 'href="#docs"', 'h-9']],
	[
		'Breadcrumb',
		BreadcrumbFixture,
		['data-slot="breadcrumb"', 'aria-current="page"', 'cn-rtl-flip'],
	],
	['Card', CardFixture, ['data-slot="card"', 'data-size="sm"', 'data-slot="card-footer"']],
	['Empty', EmptyFixture, ['data-slot="empty"', 'data-slot="empty-icon"', 'bg-muted']],
	['Input', InputFixture, ['data-slot="input"', 'type="email"']],
	['Item', ItemFixture, ['data-slot="item-group"', 'border', 'data-slot="item-separator"']],
	['Kbd', KbdFixture, ['data-slot="kbd-group"', 'data-slot="kbd"']],
	['Label', LabelFixture, ['data-slot="label"', 'for="name"']],
	[
		'NativeSelect',
		NativeSelectFixture,
		[
			'data-slot="native-select-wrapper"',
			'data-slot="native-select"',
			'data-slot="native-select-icon"',
		],
	],
	[
		'Pagination',
		PaginationFixture,
		[
			'data-slot="pagination"',
			'data-slot="pagination-link"',
			'aria-current="page"',
			'data-slot="pagination-ellipsis"',
		],
	],
	['Separator', SeparatorFixture, ['data-slot="separator"']],
	['Skeleton', SkeletonFixture, ['data-slot="skeleton"']],
	['Spinner', SpinnerFixture, ['data-slot="spinner"', 'role="status"']],
	[
		'Table',
		TableFixture,
		['data-slot="table-container"', 'data-slot="table-caption"', 'data-slot="table-cell"'],
	],
	['Textarea', TextareaFixture, ['data-slot="textarea"']],
];

describe('@octanejs/shadcn — server rendering (Tier 1)', () => {
	for (const [name, fixture, markers] of FIXTURES) {
		it(`${name} renders on the server with its contract markers`, () => {
			const { html } = renderToString(fixture as any);
			for (const marker of markers) {
				expect(html).toContain(marker);
			}
		});
	}
});
