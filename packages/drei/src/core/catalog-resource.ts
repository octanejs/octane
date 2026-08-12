export const MATCAP_LIST_URL = 'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/matcaps.json';
export const MATCAP_ROOT =
	'https://rawcdn.githack.com/emmelleppi/matcaps/9b36ccaaf0a24881a39062d05566c9e92be4aa0d';
export const NORMAL_ROOT =
	'https://rawcdn.githack.com/pmndrs/drei-assets/7a3104997e1576f83472829815b00880d88b32fb';
export const NORMAL_LIST_URL =
	'https://cdn.jsdelivr.net/gh/pmndrs/drei-assets@master/normals/normals.json';

export async function loadCatalogList(url: string): Promise<Record<string, string>> {
	const response = await fetch(url);
	return response.json() as Promise<Record<string, string>>;
}
