import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	collectBrowserDiagnostics,
	settleBrowserFrames,
	type BrowserDiagnostics,
} from '../../_shared/e2e/browser.ts';

const runtimeDiagnostics = new WeakMap<Page, BrowserDiagnostics>();

test.beforeEach(async ({ page }) => {
	runtimeDiagnostics.set(page, collectBrowserDiagnostics(page));
});

test.afterEach(async ({ page }, testInfo) => {
	const diagnostics = runtimeDiagnostics.get(page);
	if (diagnostics === undefined) return;
	try {
		await settleBrowserFrames(page);
		diagnostics.assertClean(testInfo.title);
	} finally {
		diagnostics.stop();
	}
});

async function openBoard(page: Page, path = '/boards/launch') {
	await page.goto(path);
	await expect(page.getByTestId('board-ready')).toBeVisible();
	await expect(page.getByRole('application', { name: 'Draftboard canvas' })).toBeVisible();
}

async function shapePosition(shape: Locator) {
	return {
		x: Number(await shape.getAttribute('data-x')),
		y: Number(await shape.getAttribute('data-y')),
	};
}

async function shapeBodyBox(shape: Locator) {
	const box = await shape.locator('rect').first().boundingBox();
	if (!box) throw new Error('shape body must be visible');
	return box;
}

async function storedShapeX(page: Page, boardId: string, shapeId: string) {
	return page.evaluate(
		({ boardId, shapeId }) => {
			const raw = localStorage.getItem(`draftboard.document.v1.${boardId}`);
			if (raw === null) return null;
			const document = JSON.parse(raw) as { shapes?: Array<{ id?: string; x?: number }> };
			return document.shapes?.find((shape) => shape.id === shapeId)?.x ?? null;
		},
		{ boardId, shapeId },
	);
}

function expectNear(actual: number, expected: number, tolerance = 4) {
	expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

test('loads deterministic deep-linked boards and turns an empty canvas into a saved document', async ({
	page,
}) => {
	await page.goto('/boards/launch');
	await expect(page.getByLabel('Loading whiteboard')).toHaveAttribute('aria-busy', 'true');
	await expect(page.getByTestId('board-ready')).toBeVisible();
	await expect(page).toHaveURL(/\/boards\/launch$/);
	await expect(page.locator('[data-shape-id]')).toHaveCount(4);
	await expect(page.getByText('4 objects loaded')).toBeVisible();
	const audience = page.locator('[data-shape-id="audience"]');
	await audience.click();
	await page.getByRole('button', { name: 'Focus canvas' }).click();
	await page.keyboard.press('ArrowRight');
	await expect(audience).toHaveAttribute('data-x', '114');
	await expect(page.getByText('Saving latest changes…')).toBeVisible();

	await page.getByRole('link', { name: /Blank/ }).click();
	await expect(page).toHaveURL(/\/boards\/empty$/);
	await expect(page.getByRole('heading', { name: 'Blank exploration' })).toBeVisible();
	await expect(page.getByText('This canvas is ready for its first idea')).toBeVisible();
	await expect(page.locator('[data-shape-id]')).toHaveCount(0);

	await page.getByRole('button', { name: 'Create first idea' }).click();
	await expect(page.locator('[data-shape-id="first-idea"]')).toHaveAttribute(
		'data-selected',
		'true',
	);
	await expect(page.getByText('1 object · 1 selected')).toBeVisible();
	await expect(page.getByText('Saving latest changes…')).toBeVisible();

	await page.getByRole('link', { name: /Launch/ }).click();
	await expect(page.getByTestId('board-ready')).toBeVisible();
	await expect(page.locator('[data-shape-id="audience"]')).toHaveAttribute('data-x', '114');
	await page.getByRole('link', { name: /Blank/ }).click();
	await expect(page.getByTestId('board-ready')).toBeVisible();
	await expect(page.locator('[data-shape-id="first-idea"]')).toHaveCount(1);

	await page.reload();
	await expect(page.getByTestId('board-ready')).toBeVisible();
	await expect(page.locator('[data-shape-id="first-idea"]')).toHaveCount(1);

	const safeShape = {
		id: 'poison',
		label: 'Poison',
		x: 100,
		y: 100,
		width: 120,
		height: 80,
		fill: '#ffd166',
	};
	const corruptDocuments = [
		{
			id: 'launch',
			title: 'Launch narrative',
			updatedBy: 'Maya',
			shapes: [{ ...safeShape, x: 20_000 }],
		},
		{
			id: 'launch',
			title: 'Launch narrative',
			updatedBy: 'Maya',
			shapes: [{ ...safeShape, width: 8_000 }],
		},
		{
			id: 'launch',
			title: 'Launch narrative',
			updatedBy: 'Maya',
			shapes: [{ ...safeShape, fill: 'url(#unsafe)' }],
		},
		{
			id: 'launch',
			title: 'Launch narrative',
			updatedBy: 'Maya',
			shapes: [{ ...safeShape, label: 'x'.repeat(121) }],
		},
		{ id: 'launch', title: 'Launch narrative', updatedBy: 'x'.repeat(121), shapes: [safeShape] },
	];
	for (const corruptDocument of corruptDocuments) {
		await page.evaluate((value) => {
			localStorage.setItem('draftboard.document.v1.launch', JSON.stringify(value));
		}, corruptDocument);
		await page.goto('/boards/launch');
		await expect(page.getByTestId('board-ready')).toBeVisible();
		await expect(page.locator('[data-shape-id]')).toHaveCount(4);
		await expect(page.locator('[data-shape-id="audience"]')).toHaveCount(1);
		await expect(page.locator('[data-shape-id="poison"]')).toHaveCount(0);
	}
});

test('captures a high-frequency group drag outside the canvas and preserves an unaffected keyed object', async ({
	page,
}) => {
	await openBoard(page);
	const audience = page.locator('[data-shape-id="audience"]');
	const prototype = page.locator('[data-shape-id="prototype"]');
	const survivor = page.locator('[data-shape-id="launch-plan"]');
	await survivor.evaluate((element) => {
		(window as Window & { draftboardSurvivor?: Element }).draftboardSurvivor = element;
	});

	await audience.click();
	await prototype.click({ modifiers: ['Shift'] });
	await expect(page.getByRole('heading', { name: '2 items selected' })).toBeVisible();
	await expect(audience).toHaveAttribute('data-selected', 'true');
	await expect(prototype).toHaveAttribute('data-selected', 'true');

	const audienceBefore = await shapePosition(audience);
	const prototypeBefore = await shapePosition(prototype);
	const audienceBox = await audience.boundingBox();
	const canvasBox = await page
		.getByRole('application', { name: 'Draftboard canvas' })
		.boundingBox();
	if (!audienceBox || !canvasBox) throw new Error('canvas and selected object must be visible');
	const start = {
		x: audienceBox.x + audienceBox.width / 2,
		y: audienceBox.y + audienceBox.height / 2,
	};
	const outside = {
		x: canvasBox.x + canvasBox.width + 70,
		y: canvasBox.y + canvasBox.height * 0.72,
	};

	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(outside.x, outside.y, { steps: 28 });
	await page.mouse.up();
	await expect(page.getByText('2 objects moved together')).toBeVisible();

	const audienceAfter = await shapePosition(audience);
	const prototypeAfter = await shapePosition(prototype);
	expect(audienceAfter.x).toBeGreaterThan(audienceBefore.x + 300);
	expect(prototypeAfter.x - prototypeBefore.x).toBeCloseTo(audienceAfter.x - audienceBefore.x, 0);
	expect(
		await survivor.evaluate(
			(element) =>
				(window as Window & { draftboardSurvivor?: Element }).draftboardSurvivor === element,
		),
	).toBe(true);

	await page.mouse.move(canvasBox.x + 30, canvasBox.y + 30);
	await expect(audience).toHaveAttribute('data-x', String(audienceAfter.x));
});

test('draws a rectangle, zooms through the imperative canvas API, and pans the SVG surface', async ({
	page,
}) => {
	await openBoard(page);
	const canvas = page.getByRole('application', { name: 'Draftboard canvas' });
	const box = await canvas.boundingBox();
	if (!box) throw new Error('canvas must be visible');

	await page.getByRole('button', { name: /Rectangle/ }).click();
	const start = { x: box.x + box.width * 0.16, y: box.y + box.height * 0.7 };
	const end = { x: start.x + 168, y: start.y + 94 };
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(end.x, end.y, { steps: 18 });
	await expect(page.getByTestId('draft-shape')).toBeVisible();
	await page.mouse.up();

	const drawn = page.locator('[data-shape-id="shape-launch-1"]');
	await expect(drawn).toHaveCount(1);
	await expect(drawn).toHaveAttribute('data-selected', 'true');
	await expect(page.getByText('5 objects · 1 selected')).toBeVisible();
	const initialBody = await shapeBodyBox(drawn);
	expectNear(initialBody.x, start.x);
	expectNear(initialBody.y, start.y);
	expectNear(initialBody.width, end.x - start.x);
	expectNear(initialBody.height, end.y - start.y);
	const worldX = await page.locator('output[aria-label="Selected X coordinate"]').textContent();
	const worldY = await page.locator('output[aria-label="Selected Y coordinate"]').textContent();

	await page.getByRole('button', { name: 'Zoom in' }).click();
	await page.getByRole('button', { name: 'Zoom in' }).click();
	const zoomedBody = await shapeBodyBox(drawn);
	expectNear(zoomedBody.width, initialBody.width * 1.4);
	expectNear(zoomedBody.height, initialBody.height * 1.4);
	await page.getByRole('button', { name: 'Fit selection' }).click();
	await expect(page.getByText('Fit 1 selected object')).toBeVisible();
	const fitBody = await shapeBodyBox(drawn);
	expectNear(fitBody.x + fitBody.width / 2, box.x + box.width / 2);
	expectNear(fitBody.y + fitBody.height / 2, box.y + box.height / 2);
	expect(fitBody.width).toBeGreaterThan(zoomedBody.width);

	await page.getByRole('button', { name: /Hand/ }).click();
	const panStart = { x: box.x + box.width * 0.22, y: box.y + box.height * 0.22 };
	const panDelta = { x: 82, y: 48 };
	await page.mouse.move(panStart.x, panStart.y);
	await page.mouse.down();
	await page.mouse.move(panStart.x + panDelta.x, panStart.y + panDelta.y, { steps: 12 });
	await page.mouse.up();
	await expect(page.getByText('Canvas panned')).toBeVisible();
	const pannedBody = await shapeBodyBox(drawn);
	expectNear(pannedBody.x - fitBody.x, panDelta.x);
	expectNear(pannedBody.y - fitBody.y, panDelta.y);
	await expect(page.locator('output[aria-label="Selected X coordinate"]')).toHaveText(worldX ?? '');
	await expect(page.locator('output[aria-label="Selected Y coordinate"]')).toHaveText(worldY ?? '');

	await page.getByRole('button', { name: /Rectangle/ }).click();
	const transformedStart = { x: box.x + 78, y: box.y + 72 };
	const transformedEnd = { x: transformedStart.x + 132, y: transformedStart.y + 84 };
	await page.mouse.move(transformedStart.x, transformedStart.y);
	await page.mouse.down();
	await page.mouse.move(transformedEnd.x, transformedEnd.y, { steps: 16 });
	await page.mouse.up();
	const transformedDrawn = page.locator('[data-shape-id="shape-launch-2"]');
	const transformedBody = await shapeBodyBox(transformedDrawn);
	expectNear(transformedBody.x, transformedStart.x);
	expectNear(transformedBody.y, transformedStart.y);
	expectNear(transformedBody.width, transformedEnd.x - transformedStart.x);
	expectNear(transformedBody.height, transformedEnd.y - transformedStart.y);
	expect(
		Number.isFinite(
			Number(await page.locator('output[aria-label="Selected X coordinate"]').textContent()),
		),
	).toBe(true);
	expect(
		Number.isFinite(
			Number(await page.locator('output[aria-label="Selected Y coordinate"]').textContent()),
		),
	).toBe(true);
});

test('focuses the canvas imperatively, runs keyboard history, and restores focus from portaled help', async ({
	page,
}) => {
	await openBoard(page);
	const canvas = page.getByRole('application', { name: 'Draftboard canvas' });
	const skipLink = page.getByRole('link', { name: 'Skip to canvas' });
	await page.keyboard.press('Tab');
	await expect(skipLink).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(canvas).toBeFocused();
	await expect(page.getByText('Canvas focused. Keyboard shortcuts are ready.')).toBeVisible();
	await page.keyboard.press('Tab');
	const audience = page.locator('[data-shape-id="audience"]');
	await expect(audience).toBeFocused();
	await expect(audience).toHaveAttribute('data-selected', 'true');
	await page.keyboard.press('Alt+ArrowRight');
	const prototype = page.locator('[data-shape-id="prototype"]');
	await expect(prototype).toBeFocused();
	await expect(prototype).toHaveAttribute('data-selected', 'true');
	await prototype.evaluate((element) => {
		const probe = globalThis as typeof globalThis & {
			e2eRetiredPrototype?: WeakRef<Element>;
		};
		probe.e2eRetiredPrototype = new WeakRef(element);
	});
	const start = await shapePosition(prototype);
	await page.keyboard.press('Shift+ArrowRight');
	await expect(prototype).toHaveAttribute('data-x', String(start.x + 10));
	await page.keyboard.press('Delete');
	await expect(prototype).toHaveCount(0);
	await expect(page.locator('[data-shape-id="launch-plan"]')).toBeFocused();
	await expect
		.poll(async () => {
			await page.requestGC();
			return page.evaluate(() => {
				const probe = globalThis as typeof globalThis & {
					e2eRetiredPrototype?: WeakRef<Element>;
				};
				return probe.e2eRetiredPrototype?.deref() === undefined;
			});
		})
		.toBe(true);

	await page.keyboard.press('Control+z');
	await expect(page.locator('[data-shape-id="prototype"]')).toHaveAttribute(
		'data-x',
		String(start.x + 10),
	);
	await page.keyboard.press('Control+z');
	await expect(page.locator('[data-shape-id="prototype"]')).toHaveAttribute(
		'data-x',
		String(start.x),
	);
	await page.keyboard.press('Control+Shift+z');
	await expect(page.locator('[data-shape-id="prototype"]')).toHaveAttribute(
		'data-x',
		String(start.x + 10),
	);

	const shortcuts = page.getByRole('button', { name: 'Shortcuts' });
	await shortcuts.focus();
	await page.keyboard.press('Enter');
	const dialog = page.getByRole('dialog', { name: 'Draftboard shortcuts' });
	await expect(dialog).toBeVisible();
	expect(await dialog.evaluate((element) => element.closest('#modal-root') !== null)).toBe(true);
	const closeShortcuts = page.getByRole('button', { name: 'Close shortcuts' });
	const acceptShortcuts = page.getByRole('button', { name: 'Got it' });
	await expect(closeShortcuts).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(acceptShortcuts).toBeFocused();
	await page.keyboard.press('Tab');
	await expect(closeShortcuts).toBeFocused();
	await page.keyboard.press('Shift+Tab');
	await expect(acceptShortcuts).toBeFocused();
	await page.keyboard.press('Escape');
	await expect(dialog).toHaveCount(0);
	await expect(shortcuts).toBeFocused();
});

test('retries failures while overlapping saves and offline edits converge to the latest persisted canvas', async ({
	page,
	context,
}) => {
	await page.goto('/boards/launch?scenario=load-failure,save-failure,save-race');
	await expect(page.getByRole('alert')).toContainText('We couldn’t load this board');
	await page.getByRole('button', { name: 'Retry loading' }).click();
	await expect(page.getByTestId('board-ready')).toBeVisible();
	const persistenceControls = page.getByRole('region', {
		name: 'Autosave persistence controls',
	});
	const completeOldestSave = persistenceControls.getByRole('button', {
		name: 'Complete oldest pending save',
	});
	const completeNewestSave = persistenceControls.getByRole('button', {
		name: 'Complete newest pending save',
	});
	const persistenceStatus = persistenceControls.getByRole('status');
	await expect(persistenceControls).toBeVisible();

	const audience = page.locator('[data-shape-id="audience"]');
	await audience.click();
	await page.getByRole('button', { name: 'Focus canvas' }).click();
	for (let index = 0; index < 6; index++) await page.keyboard.press('ArrowRight');
	await expect(audience).toHaveAttribute('data-x', '124');
	await expect(page.getByRole('alert')).toContainText('We couldn’t save the latest board');
	await page.getByRole('button', { name: 'Retry save' }).click();
	await expect(persistenceStatus).toContainText('1 save is waiting for persistence.');
	await completeNewestSave.click();
	await expect(page.getByText('Synced · all changes saved')).toBeVisible();
	await expect.poll(() => storedShapeX(page, 'launch', 'audience')).toBe(124);

	// Hold two real save attempts at the persistence boundary, then complete the newest first.
	// Releasing the older request afterward must not regress the durable or user-visible result.
	await page.getByRole('button', { name: 'Focus canvas' }).click();
	await page.keyboard.press('ArrowRight');
	await expect(audience).toHaveAttribute('data-x', '126');
	await expect(persistenceStatus).toContainText('1 save is waiting for persistence.');
	await page.keyboard.press('ArrowRight');
	await expect(audience).toHaveAttribute('data-x', '128');
	await expect(persistenceStatus).toContainText('2 saves are waiting for persistence.');
	await completeNewestSave.click();
	await expect(persistenceStatus).toContainText('1 save is waiting for persistence.');
	await expect(persistenceStatus).toContainText('Latest save completion applied.');
	await expect.poll(() => storedShapeX(page, 'launch', 'audience')).toBe(128);
	await expect(page.getByText('Synced · all changes saved')).toBeVisible();
	await completeOldestSave.click();
	await expect(persistenceStatus).toContainText('No saves are waiting for persistence.');
	await expect(persistenceStatus).toContainText(
		'Older save completion ignored; latest saved canvas was preserved.',
	);
	expect(await storedShapeX(page, 'launch', 'audience')).toBe(128);
	await expect(page.getByText('Synced · all changes saved')).toBeVisible();

	await context.setOffline(true);
	await expect(page.getByText('Working offline.')).toBeVisible();
	await page.getByRole('button', { name: 'Focus canvas' }).click();
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('Shift+ArrowDown');
	await expect(audience).toHaveAttribute('data-y', '142');
	await expect(page.getByText('Offline · 3 changes queued')).toBeVisible();
	await page.getByRole('link', { name: /Blank/ }).click();
	await expect(page.getByTestId('board-ready')).toBeVisible();
	await page.getByRole('button', { name: 'Create first idea' }).click();
	await page.getByRole('button', { name: 'Focus canvas' }).click();
	await page.keyboard.press('Shift+ArrowRight');
	await expect(page.locator('[data-shape-id="first-idea"]')).toHaveAttribute('data-x', '400');
	await page.getByRole('link', { name: /Launch/ }).click();
	await expect(page.getByTestId('board-ready')).toBeVisible();
	await expect(page.locator('[data-shape-id="audience"]')).toHaveAttribute('data-x', '128');
	await expect(page.locator('[data-shape-id="audience"]')).toHaveAttribute('data-y', '142');
	await page.getByRole('link', { name: /Blank/ }).click();
	await expect(page.getByTestId('board-ready')).toBeVisible();
	await expect(page.locator('[data-shape-id="first-idea"]')).toHaveAttribute('data-x', '400');

	await context.setOffline(false);
	await expect(page.getByText('Synced · all changes saved')).toBeVisible();
	await page.goto('/boards/launch');
	await expect(page.getByTestId('board-ready')).toBeVisible();
	await expect(page.locator('[data-shape-id="audience"]')).toHaveAttribute('data-x', '128');
	await expect(page.locator('[data-shape-id="audience"]')).toHaveAttribute('data-y', '142');
	await page.goto('/boards/empty');
	await expect(page.getByTestId('board-ready')).toBeVisible();
	await expect(page.locator('[data-shape-id="first-idea"]')).toHaveAttribute('data-x', '400');
});
