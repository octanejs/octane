import { gql, type TypedDocumentNode } from '@octanejs/apollo-client';
import type { CatalogData, CatalogVariables, TitleData, TitleVariables } from './types.js';

const TITLE_FIELDS = gql`
	fragment TitleFields on Title {
		id
		name
		tagline
		year
		rating
		runtime
		kind
		genres
		poster
		overview
		credits {
			name
			role
		}
		__typename
	}
`;

export const CATALOG_QUERY: TypedDocumentNode<CatalogData, CatalogVariables> = gql`
	query Catalog($search: String!, $genre: String!, $recover: Boolean!) {
		catalog(search: $search, genre: $genre, recover: $recover) {
			...TitleFields
		}
	}
	${TITLE_FIELDS}
`;

export const TITLE_QUERY: TypedDocumentNode<TitleData, TitleVariables> = gql`
	query Title($id: ID!) {
		title(id: $id) {
			...TitleFields
		}
	}
	${TITLE_FIELDS}
`;
