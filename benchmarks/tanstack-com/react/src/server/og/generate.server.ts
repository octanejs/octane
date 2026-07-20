import { ImageResponse, type ImageResponseOptions } from '@takumi-rs/image-response';
import takumiWasmModule from '@takumi-rs/wasm/auto';
import { findLibrary } from '~/libraries';
import type { LibraryId } from '~/libraries';
import { loadOgAssets as loadNodeOgAssets } from './assets.server';
import { getAccentColor } from './colors';
import { buildOgTree } from './template';
import { MAX_OG_DESCRIPTION_LENGTH, MAX_OG_TITLE_LENGTH, clampOgText } from '~/utils/og-limits';

const ISLAND_KEY = 'island';

type GenerateInput = {
	libraryId: LibraryId | string;
	requestUrl?: string;
	title?: string;
	description?: string;
};

export type OgLibraryNotFoundError = {
	kind: 'library-not-found';
	libraryId: string;
};

export async function generateOgImageResponse(
	input: GenerateInput,
	init?: ResponseInit,
): Promise<ImageResponse | OgLibraryNotFoundError> {
	const library = findLibrary(input.libraryId);
	if (!library) {
		return { kind: 'library-not-found', libraryId: input.libraryId };
	}

	const assets = await loadNodeOgAssets(input.requestUrl);
	const tree = buildOgTree({
		libraryName: library.name,
		accentColor: getAccentColor(library.id),
		islandSrc: ISLAND_KEY,
		pitch: clampOgText(library.tagline ?? '', MAX_OG_DESCRIPTION_LENGTH),
		docTitle: input.title?.trim() ? clampOgText(input.title, MAX_OG_TITLE_LENGTH) : undefined,
		description: input.description?.trim()
			? clampOgText(input.description, MAX_OG_DESCRIPTION_LENGTH)
			: undefined,
	});

	const options: ImageResponseOptions = {
		width: 1200,
		height: 630,
		format: 'png',
		fonts: [
			{
				name: 'Inter',
				data: assets.interRegular,
				weight: 400,
				style: 'normal',
			},
			{
				name: 'Inter',
				data: assets.interExtraBold,
				weight: 800,
				style: 'normal',
			},
			{
				name: 'Inter',
				data: assets.interBlack,
				weight: 900,
				style: 'normal',
			},
		],
		images: [{ src: ISLAND_KEY, data: assets.islandPng }],
		module: takumiWasmModule,
		...init,
	};

	return new ImageResponse(tree, options);
}
