export type MediaKind = 'Film' | 'Series';

export interface Credit {
	name: string;
	role: string;
}

export interface Title {
	__typename: 'Title';
	id: string;
	name: string;
	tagline: string;
	year: number;
	rating: number;
	runtime: string;
	kind: MediaKind;
	genres: string[];
	poster: string;
	overview: string;
	credits: Credit[];
}

export interface CatalogData {
	catalog: Title[];
}

export interface CatalogVariables {
	search: string;
	genre: string;
	recover: boolean;
}

export interface TitleData {
	title: Title | null;
}

export interface TitleVariables {
	id: string;
}

export interface Editorial {
	kicker: string;
	title: string;
	copy: string;
	featuredId: string;
}

export type Route =
	| { kind: 'catalog'; search: string; genre: string }
	| { kind: 'title'; id: string }
	| { kind: 'watchlist' }
	| { kind: 'not-found' };
