import { useLayoutEffect, useMemo, use } from '@octanejs/three/renderer';
import { RepeatWrapping, type Texture, Vector2 } from 'three';
import { slotDefault } from './compiler-slot.js';
import { resolveRenderChildren, type RenderChildren } from './octane-children.js';
import { resourcePromise } from './resource.js';
import { useTexture } from './Texture.three.tsrx';
import {
	loadCatalogList,
	MATCAP_LIST_URL,
	MATCAP_ROOT,
	NORMAL_LIST_URL,
	NORMAL_ROOT,
} from './catalog-resource.js';

function getFormatString(format: number) {
	switch (format) {
		case 64:
			return '-64px';
		case 128:
			return '-128px';
		case 256:
			return '-256px';
		case 512:
			return '-512px';
		default:
			return '';
	}
}

export function useMatcapTexture(
	id: number | string = 0,
	format = 1024,
	onLoad?: (texture: Texture | Texture[]) => void,
): [Texture, string, number] {
	id = slotDefault(id, 0);
	format = slotDefault(format, 1024);
	onLoad = slotDefault(onLoad, undefined);
	const matcapList = use(resourcePromise(loadCatalogList, [MATCAP_LIST_URL]));
	const defaultMatcap = matcapList[0];
	const total = useMemo(() => Object.keys(matcapList).length, []);
	const fileHash = useMemo(() => {
		if (typeof id === 'string') return id;
		if (typeof id === 'number') return matcapList[id];
		return null;
	}, [id]);
	const fileName = `${fileHash || defaultMatcap}${getFormatString(format)}.png`;
	const url = `${MATCAP_ROOT}/${format}/${fileName}`;
	const texture = useTexture(url, onLoad) as Texture;
	return [texture, url, total];
}

export function MatcapTexture({
	children,
	id,
	format,
	onLoad,
}: {
	children?: RenderChildren<ReturnType<typeof useMatcapTexture>>;
	id?: Parameters<typeof useMatcapTexture>[0];
	format?: Parameters<typeof useMatcapTexture>[1];
	onLoad?: Parameters<typeof useMatcapTexture>[2];
}) @{
	const texture = useMatcapTexture(id, format, onLoad);
	<>{resolveRenderChildren(children, texture)}</>
}

type Settings = {
	repeat?: number[];
	anisotropy?: number;
	offset?: number[];
};

export function useNormalTexture(
	id = 0,
	settings: Settings = {},
	onLoad?: (texture: Texture | Texture[]) => void,
): [Texture, string, number] {
	id = slotDefault(id, 0);
	settings = slotDefault(settings, {});
	onLoad = slotDefault(onLoad, undefined);
	const { repeat = [1, 1], anisotropy = 1, offset = [0, 0] } = settings;
	const normalsList = use(resourcePromise(loadCatalogList, [NORMAL_LIST_URL]));
	const total = useMemo(() => Object.keys(normalsList).length, []);
	const defaultNormal = normalsList[0];
	const imageName = normalsList[id] || defaultNormal;
	const url = `${NORMAL_ROOT}/normals/${imageName}`;
	const texture = useTexture(url, onLoad) as Texture;
	useLayoutEffect(() => {
		if (!texture) return;
		texture.wrapS = texture.wrapT = RepeatWrapping;
		texture.repeat = new Vector2(repeat[0], repeat[1]);
		texture.offset = new Vector2(offset[0], offset[1]);
		texture.anisotropy = anisotropy;
	}, [texture, anisotropy, repeat, offset]);
	return [texture, url, total];
}

export function NormalTexture({ children, id, onLoad, ...settings }: {
	children?: RenderChildren<ReturnType<typeof useNormalTexture>>;
	id?: Parameters<typeof useNormalTexture>[0];
	onLoad?: Parameters<typeof useNormalTexture>[2];
} & Settings) @{
	const value = useNormalTexture(id, settings, onLoad);
	<>{resolveRenderChildren(children, value)}</>
}
