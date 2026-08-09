import type { Page } from '@inertiajs/core';
import type { OctaneNode } from 'octane';
import PageContext from '../../src/PageContext';

let currentPage: Page;

export function setFixturePage(page: Page): void {
	currentPage = page;
}

export function PageProvider(props: { children: OctaneNode }) @{
	<PageContext.Provider value={currentPage}>{props.children}</PageContext.Provider>
}
