import type { Framework, Library, LibrarySlim } from './types';
import { getLibrary } from './index';

export interface Maintainer {
	name: string;
	avatar: string;
	github: string;
	isCoreMaintainer?: boolean;
	creatorOf?: Library['id'][];
	maintainerOf?: Library['id'][]; // inherits from creatorOf
	contributorOf?: Library['id'][]; // inherits from maintainerOf
	consultantOf?: Library['id'][]; // inherits from maintainerOf
	frameworkExpertise?: Framework[];
	specialties?: string[];
	social?: {
		twitter?: string;
		bluesky?: string;
		linkedIn?: string;
		website?: string;
	};
	workshopsAvailable?: boolean;
}

const libraryMaintainerSortOrder = {
	start: [
		'tannerlinsley',
		'schiller-manuel',
		'sheraff',
		'brenelz',
		'seancassiere',
		'birkskyum',
		'chorobin',
		'brhx',
	],
	router: [
		'tannerlinsley',
		'schiller-manuel',
		'sheraff',
		'brenelz',
		'beaussan',
		'seancassiere',
		'birkskyum',
		'chorobin',
		'brhx',
		'nlynzaad',
	],
} satisfies Partial<Record<Library['id'], Array<Maintainer['github']>>>;

// order matters
export const allMaintainers: Maintainer[] = [
	{
		name: 'Tanner Linsley',
		isCoreMaintainer: true,
		avatar: 'https://github.com/tannerlinsley.png',
		github: 'tannerlinsley',
		creatorOf: [
			'start',
			'router',
			'query',
			'table',
			'form',
			'virtual',
			'ranger',
			'store',
			'pacer',
			'cli',
			'mcp',
			'react-charts',
		],
		maintainerOf: ['intent'],
		frameworkExpertise: ['react', 'solid'],
		specialties: ['Architecture', 'Core API', 'Documentation'],
		social: {
			twitter: 'https://x.com/tannerlinsley',
			bluesky: 'https://bsky.app/profile/tannerlinsley.com',
			website: 'https://tannerlinsley.com',
		},
		workshopsAvailable: false,
	},
	{
		name: 'Dominik Dorfmeister',
		isCoreMaintainer: true,
		avatar: 'https://github.com/tkdodo.png',
		github: 'tkdodo',
		maintainerOf: ['query'],
		contributorOf: ['router'],
		frameworkExpertise: ['react'],
		specialties: ['Core API', 'TypeScript', 'Documentation'],
		social: {
			bluesky: 'https://bsky.app/profile/tkdodo.eu',
			website: 'https://tkdodo.eu',
		},
	},
	{
		name: 'Nicolas Beaussart',
		avatar: 'https://github.com/beaussan.png',
		github: 'beaussan',
		maintainerOf: ['router'],
		frameworkExpertise: ['react'],
		specialties: ['Monorepo', 'Architecture', 'Typescript'],
		social: {
			twitter: 'https://x.com/beaussan',
			bluesky: 'https://bsky.app/profile/beaussan.io',
			website: 'https://beaussan.io/',
		},
		workshopsAvailable: true,
	},
	{
		name: 'Corbin Crutchley',
		isCoreMaintainer: true,
		avatar: 'https://github.com/crutchcorn.png',
		github: 'crutchcorn',
		creatorOf: ['form'],
		maintainerOf: ['store', 'config'],
		frameworkExpertise: ['react', 'solid', 'vue', 'angular', 'lit'],
		specialties: ['Forms', 'Validation', 'State Management'],
		social: {
			twitter: 'https://x.com/crutchcorn',
			bluesky: 'https://bsky.app/profile/crutchcorn.dev',
			website: 'https://playfulprogramming.com/people/crutchcorn',
		},
	},
	{
		name: 'Manuel Schiller',
		isCoreMaintainer: true,
		avatar: 'https://github.com/schiller-manuel.png',
		github: 'schiller-manuel',
		maintainerOf: ['start', 'router'],
		frameworkExpertise: ['react'],
		specialties: ['Architecture', 'Core API', 'Documentation'],
		social: {
			twitter: 'https://x.com/schanuelmiller',
			bluesky: 'https://bsky.app/profile/manuelschiller.bsky.social',
		},
	},
	{
		name: 'Kevin Van Cott',
		isCoreMaintainer: true,
		avatar: 'https://github.com/kevinvandy.png',
		github: 'kevinvandy',
		creatorOf: ['pacer', 'hotkeys'],
		maintainerOf: ['table', 'store'],
		contributorOf: ['virtual'],
		consultantOf: ['query'],
		frameworkExpertise: ['react', 'preact', 'solid'],
		specialties: ['Data Grids', 'Performance', 'Dashboards'],
		social: {
			twitter: 'https://x.com/kevinvancott',
			bluesky: 'https://bsky.app/profile/kevinvancott.dev',
			linkedIn: 'https://www.linkedin.com/in/kevinthomasvancott',
			website: 'https://kevinvancott.dev',
		},
		workshopsAvailable: true,
	},
	{
		name: 'Jack Herrington',
		isCoreMaintainer: true,
		avatar: 'https://github.com/jherr.png',
		github: 'jherr',
		creatorOf: ['ai', 'create-tsrouter-app'],
		frameworkExpertise: ['react'],
		specialties: ['Templates'],
		workshopsAvailable: true,
	},
	{
		name: 'Sean Cassiere',
		isCoreMaintainer: true,
		avatar: 'https://github.com/seancassiere.png',
		github: 'seancassiere',
		maintainerOf: ['start', 'router'],
		frameworkExpertise: ['react'],
		specialties: ['Architecture', 'Core API', 'Documentation'],
		social: {
			twitter: 'https://x.com/seancassiere',
			bluesky: 'https://bsky.app/profile/seancassiere.com',
			website: 'https://seancassiere.com',
		},
	},
	{
		name: 'Birk Skyum',
		avatar: 'https://github.com/birkskyum.png',
		github: 'birkskyum',
		maintainerOf: ['router', 'start'],
		contributorOf: ['pacer'],
		frameworkExpertise: ['solid'],
		specialties: [],
		social: {
			twitter: 'https://x.com/birkskyum',
			bluesky: 'https://bsky.app/profile/bskyum.bsky.social',
		},
	},
	{
		name: 'Florian Pellet',
		avatar: 'https://github.com/sheraff.png',
		github: 'sheraff',
		maintainerOf: ['start', 'router'],
		frameworkExpertise: ['react'],
		specialties: ['Performance'],
		social: {
			twitter: 'https://x.com/chaponflo',
			bluesky: 'https://bsky.app/profile/sheraff.bsky.social',
			website: 'https://florianpellet.com',
		},
	},
	{
		name: 'Christopher Horobin',
		isCoreMaintainer: true,
		avatar: 'https://github.com/chorobin.png',
		github: 'chorobin',
		maintainerOf: ['start', 'router'],
		frameworkExpertise: ['react'],
		specialties: ['TypeScript'],
		social: {
			twitter: 'https://x.com/c_horobin',
			bluesky: 'https://bsky.app/profile/chorobin.bsky.social',
		},
	},
	{
		name: 'Damian Pieczynski',
		isCoreMaintainer: true,
		avatar: 'https://github.com/piecyk.png',
		github: 'piecyk',
		maintainerOf: ['virtual'],
		frameworkExpertise: ['react'],
		specialties: ['Virtualization', 'Performance'],
	},
	{
		name: 'Kyle Mathews',
		isCoreMaintainer: true,
		avatar: 'https://github.com/KyleAMathews.png',
		github: 'KyleAMathews',
		creatorOf: ['db', 'intent'],
		frameworkExpertise: ['react'],
		specialties: ['Sync Engines'],
	},
	{
		name: 'Alem Tuzlak',
		isCoreMaintainer: true,
		avatar: 'https://github.com/AlemTuzlak.png',
		github: 'AlemTuzlak',
		creatorOf: ['ai', 'devtools'],
		contributorOf: ['pacer', 'form'],
		frameworkExpertise: ['react'],
		specialties: ['DevTools', 'Routers', 'Vite Plugins'],
		social: {
			twitter: 'https://x.com/AlemTuzlak',
			bluesky: 'https://bsky.app/profile/alem.forge42.dev',
			website: 'https://www.forge42.dev',
		},
		workshopsAvailable: true,
	},
	{
		name: 'Sam Willis',
		isCoreMaintainer: true,
		avatar: 'https://github.com/samwillis.png',
		github: 'samwillis',
		creatorOf: ['db'],
		frameworkExpertise: ['react'],
		specialties: ['Sync Engines', 'Incremental View Maintenance'],
	},
	{
		name: 'Vedanta Somnathe',
		avatar: 'https://github.com/theVedanta.png',
		github: 'theVedanta',
		maintainerOf: ['query', 'pacer'],
		frameworkExpertise: ['preact', 'angular'],
		social: {
			website: 'https://vedantas.xyz/',
			twitter: 'https://x.com/thvdnta',
			bluesky: 'https://bsky.app/profile/thvdnta.bsky.social',
			linkedIn: 'https://linkedin.com/in/thvdnta',
		},
	},
	{
		name: 'Leonardo Montini',
		avatar: 'https://github.com/Balastrong.png',
		github: 'Balastrong',
		maintainerOf: ['form'],
		frameworkExpertise: ['react'],
		social: {
			website: 'https://leonardomontini.dev/',
			twitter: 'https://x.com/Balastrong',
			bluesky: 'https://bsky.app/profile/leonardomontini.dev',
		},
		workshopsAvailable: true,
	},
	{
		name: 'Fredrik Höglund',
		avatar: 'https://github.com/ephem.png',
		github: 'ephem',
		maintainerOf: ['query'],
		frameworkExpertise: ['react'],
		specialties: ['Data Management', 'SSR', 'Hydration'],
		social: {
			bluesky: 'https://bsky.app/profile/ephem.dev',
			twitter: 'https://x.com/ephemjs',
			website: 'https://www.ephem.dev',
		},
	},
	{
		name: 'Aadit Olkar',
		avatar: 'https://github.com/aadito123.png',
		github: 'aadito123',
		maintainerOf: ['form'],
		frameworkExpertise: ['solid'],
		social: {
			twitter: 'https://x.com/swagdoctor19',
		},
	},
	{
		name: 'Harry Whorlow',
		avatar: 'https://github.com/harry-whorlow.png',
		github: 'harry-whorlow',
		maintainerOf: ['form', 'devtools'],
		frameworkExpertise: ['react'],
		social: {
			linkedIn: 'https://www.linkedin.com/in/harry-whorlow/',
			website: 'https://harry-whorlow.dev',
		},
	},
	{
		name: 'Luca Jakob',
		avatar: 'https://github.com/LeCarbonator.png',
		github: 'LeCarbonator',
		maintainerOf: ['form'],
		frameworkExpertise: ['react'],
	},
	{
		name: 'Jonghyeon Ko',
		avatar: 'https://github.com/manudeli.png',
		github: 'manudeli',
		maintainerOf: ['query'],
		frameworkExpertise: ['react'],
		specialties: ['TypeScript', 'Backport', 'Test'],
		social: {
			twitter: 'https://x.com/manudeli_',
			bluesky: 'https://bsky.app/profile/manudeli.bsky.social',
			linkedIn: 'https://www.linkedin.com/in/jonghyeonko',
		},
	},
	{
		name: 'Wonsuk Choi',
		avatar: 'https://github.com/sukvvon.png',
		github: 'sukvvon',
		maintainerOf: ['query'],
		frameworkExpertise: ['react'],
		specialties: ['TypeScript', 'Test'],
		social: {
			linkedIn: 'https://www.linkedin.com/in/sukvvon',
			twitter: 'https://x.com/sukvvon',
			bluesky: 'https://bsky.app/profile/sukvvon.bsky.social',
		},
	},
	{
		name: 'Sarah Gerrard',
		avatar: 'https://github.com/ladybluenotes.png',
		github: 'ladybluenotes',
		creatorOf: ['intent'],
		contributorOf: [
			'ai',
			'config',
			'db',
			'devtools',
			'form',
			'pacer',
			'query',
			'ranger',
			'router',
			'hotkeys',
			'start',
			'store',
			'table',
			'virtual',
		],
		frameworkExpertise: ['react', 'solid'],
		specialties: ['Documentation', 'Architecture'],
		social: {
			bluesky: 'https://bsky.app/profile/ladybluenotes.dev',
			twitter: 'https://x.com/ladybluenotes',
			website: 'https://sarahgerrard.me',
		},
	},
	{
		name: 'Lachlan Collins',
		isCoreMaintainer: true,
		avatar: 'https://github.com/lachlancollins.png',
		github: 'lachlancollins',
		maintainerOf: ['config', 'query'],
		contributorOf: ['start', 'router', 'virtual', 'table', 'form', 'db', 'pacer'],
		frameworkExpertise: ['react', 'svelte'],
		specialties: ['Architecture'],
	},
	{
		name: 'Riccardo Perra',
		avatar:
			'https://cdn.bsky.app/img/avatar/plain/did:plc:gtnigsmgu7jyrc4tnkvn62qw/bafkreiceysbj4o6jrbbniudtwj3tcsns6rvwcxyjsqiaumeojurwbkki5a@jpeg',
		github: 'riccardoperra',
		maintainerOf: ['table'],
		contributorOf: ['devtools', 'hotkeys', 'pacer'],
		frameworkExpertise: ['angular', 'solid'],
		specialties: [],
		social: {
			twitter: 'https://x.com/riccardoperra0',
			bluesky: 'https://bsky.app/profile/riccardoperra.bsky.social',
			website: 'https://riccardoperra.com',
		},
	},
	{
		name: 'Tom Beckenham',
		github: 'tombeckenham',
		avatar: 'https://github.com/tombeckenham.png',
		maintainerOf: ['ai'],
		frameworkExpertise: [],
		social: {
			twitter: 'https://x.com/tombeckenham',
		},
	},
	{
		name: 'Brenley Dueck',
		avatar: 'https://github.com/brenelz.png',
		github: 'brenelz',
		maintainerOf: ['start', 'router'],
		frameworkExpertise: ['react', 'solid'],
		specialties: [],
		social: {
			twitter: 'https://x.com/brenelz',
			bluesky: 'https://bsky.app/profile/brenelz.com',
			website: 'https://brenelz.com',
		},
	},
	{
		name: 'Brooke Holmes',
		avatar: 'https://github.com/brhx.png',
		github: 'brhx',
		maintainerOf: ['start', 'router'],
		frameworkExpertise: ['react'],
		specialties: ['TypeScript'],
		social: {
			twitter: 'https://x.com/brooke_lune',
			linkedIn: 'https://www.linkedin.com/in/brooke-holmes/',
			website: 'https://brooke.me',
		},
	},
	{
		name: 'Arnoud de Vries',
		avatar: 'https://github.com/arnoud-dv.png',
		github: 'arnoud-dv',
		maintainerOf: ['query'],
		frameworkExpertise: ['angular', 'react'],
		specialties: ['Architecture', 'Developer Experience', 'TypeScript', 'Reactivity'],
		social: {
			twitter: 'https://x.com/Arnoud_dv',
			bluesky: 'https://bsky.app/profile/arnoud.dev',
			linkedIn: 'https://www.linkedin.com/in/arnouddv/',
		},
		workshopsAvailable: true,
	},
	{
		name: 'Fülöp Kovács',
		avatar: 'https://github.com/fulopkovacs.png',
		github: 'fulopkovacs',
		maintainerOf: ['form'],
		frameworkExpertise: ['react'],
		social: {
			website: 'https://fulop.dev/',
			twitter: 'https://x.com/notacheetah',
			bluesky: 'https://bsky.app/profile/notacheetah.bsky.social',
		},
	},
	{
		name: 'Aryan Deora',
		avatar: 'https://github.com/ardeora.png',
		github: 'ardeora',
		maintainerOf: ['query'],
		frameworkExpertise: ['solid'],
		specialties: ['Dev Tools'],
		social: {
			twitter: 'https://x.com/aryan__deora',
			website: 'https://www.aryandeora.com/',
		},
	},
	{
		name: 'Mokshit Jain',
		avatar: 'https://github.com/Mokshit06.png',
		contributorOf: ['table'],
		frameworkExpertise: ['svelte', 'solid', 'vue'],
		github: 'Mokshit06',
		social: {
			twitter: 'https://x.com/mokshit06',
			website: 'https://mokshitjain.co',
		},
	},
	{
		name: 'Walker Lockard',
		github: 'walker-tx',
		avatar: 'https://github.com/walker-tx.png',
		contributorOf: ['table'],
		frameworkExpertise: ['svelte', 'react'],
		social: {
			twitter: 'https://x.com/walker_lockard',
			website: 'https://walker.dev',
		},
	},
	{
		name: 'Tom',
		github: 'tombuntus',
		avatar: 'https://github.com/tombuntus.png',
		contributorOf: ['table'],
		frameworkExpertise: ['react'],
		social: {},
	},
	{
		name: 'Damian Osipiuk',
		avatar: 'https://github.com/DamianOsipiuk.png',
		github: 'DamianOsipiuk',
		maintainerOf: ['query'],
		frameworkExpertise: ['vue'],
		specialties: [],
	},
	{
		name: 'Eliya Cohen',
		avatar: 'https://github.com/Newbie012.png',
		github: 'Newbie012',
		maintainerOf: ['query'],
		frameworkExpertise: [],
		specialties: ['eslint plugin'],
	},
	{
		name: 'Kevin De Porre',
		avatar: 'https://github.com/kevin-dp.png',
		github: 'kevin-dp',
		maintainerOf: ['db'],
		frameworkExpertise: ['react'],
		specialties: ['Sync Engines', 'Incremental View Maintenance'],
	},
	{
		name: 'Shruti Kapoor',
		avatar: 'https://github.com/shrutikapoor08.png',
		github: 'shrutikapoor08',
		contributorOf: ['start'],
		frameworkExpertise: ['react'],
		specialties: ['Education', 'Documentation'],
		social: {
			twitter: 'https://x.com/shrutikapoor08',
			bluesky: 'https://bsky.app/profile/shrutikapoor08.bsky.social',
		},
		workshopsAvailable: true,
	},
	{
		name: 'Nico Lynzaad',
		avatar: 'https://github.com/nlynzaad.png',
		github: 'nlynzaad',
		maintainerOf: ['router'],
		frameworkExpertise: ['react'],
		specialties: [],
		social: {
			twitter: 'https://twitter.com/NLynzaad',
		},
		workshopsAvailable: false,
	},
];

export const coreMaintainers = allMaintainers.filter((maintainer) => maintainer.isCoreMaintainer);

export function getLibraryCreators(libraryId: string): Maintainer[] {
	return allMaintainers.filter((maintainer) =>
		maintainer.creatorOf?.includes(libraryId as Library['id']),
	);
}

export function getLibraryMaintainers(libraryId: string, includeCreators = true): Maintainer[] {
	const creators = getLibraryCreators(libraryId);
	const maintainers = allMaintainers.filter((maintainer) =>
		maintainer.maintainerOf?.includes(libraryId as Library['id']),
	);

	// Use Set to dedupe while preserving order
	const libraryMaintainers = includeCreators
		? [...new Set([...creators, ...maintainers])]
		: maintainers;

	return sortLibraryMaintainers(libraryId, libraryMaintainers);
}

function sortLibraryMaintainers(libraryId: string, maintainers: Maintainer[]): Maintainer[] {
	const order = Object.entries(libraryMaintainerSortOrder).find(
		([orderedLibraryId]) => orderedLibraryId === libraryId,
	)?.[1];

	if (!order) {
		return maintainers;
	}

	const orderIndexByGithub = new Map(order.map((github, index) => [github, index]));

	return [...maintainers].sort((left, right) => {
		const leftIndex = orderIndexByGithub.get(left.github);
		const rightIndex = orderIndexByGithub.get(right.github);

		if (leftIndex === undefined && rightIndex === undefined) {
			return 0;
		}

		if (leftIndex === undefined) {
			return 1;
		}

		if (rightIndex === undefined) {
			return -1;
		}

		return leftIndex - rightIndex;
	});
}

export function getLibraryContributors(libraryId: string, includeMaintainers = true): Maintainer[] {
	const maintainers = getLibraryMaintainers(libraryId);
	const contributors = allMaintainers.filter((maintainer) =>
		maintainer.contributorOf?.includes(libraryId as Library['id']),
	);

	return includeMaintainers ? [...new Set([...maintainers, ...contributors])] : contributors;
}

export function getPersonsCreatorOf(person: Maintainer): LibrarySlim[] {
	return person.creatorOf?.map((libraryId) => getLibrary(libraryId)) || [];
}

export function getPersonsMaintainerOf(person: Maintainer, includeCreatorOf = true): LibrarySlim[] {
	const creatorOf = getPersonsCreatorOf(person);
	const maintainerOf = person.maintainerOf?.map((libraryId) => getLibrary(libraryId)) || [];

	return includeCreatorOf ? [...new Set([...creatorOf, ...maintainerOf])] : maintainerOf;
}

export function getIsCreatorOfLibrary(person: Maintainer, libraryId: string) {
	return person.creatorOf?.includes(libraryId as Library['id']);
}

export function getIsMaintainerOfLibrary(person: Maintainer, libraryId: string) {
	return person.maintainerOf?.includes(libraryId as Library['id']);
}

export function getIsContributorOfLibrary(person: Maintainer, libraryId: string) {
	return person.contributorOf?.includes(libraryId as Library['id']);
}

export function getIsConsultantOfLibrary(person: Maintainer, libraryId: string) {
	return person.consultantOf?.includes(libraryId as Library['id']);
}

export function getRoleInLibrary(person: Maintainer, libraryId: string) {
	if (getIsCreatorOfLibrary(person, libraryId)) return 'Creator';
	if (getIsMaintainerOfLibrary(person, libraryId)) return 'Maintainer';
	if (getIsContributorOfLibrary(person, libraryId)) return 'Contributor';
	if (getIsConsultantOfLibrary(person, libraryId)) return 'Consultant';
	return 'Contributor';
}

export function getRoleForFilteredLibraries(
	person: Maintainer,
	libraryIds: Library['id'][] | undefined,
): 'creator' | 'maintainer' | 'contributor' | 'other' {
	// If no libraries are filtered, use global roles
	if (!libraryIds || libraryIds.length === 0) {
		if (person.creatorOf && person.creatorOf.length > 0) return 'creator';
		if (person.maintainerOf && person.maintainerOf.length > 0) return 'maintainer';
		if (person.contributorOf && person.contributorOf.length > 0) return 'contributor';
		return 'other';
	}

	// Check roles only for the filtered libraries
	const isCreatorOfFiltered = libraryIds.some((lib) => person.creatorOf?.includes(lib));
	const isMaintainerOfFiltered = libraryIds.some((lib) => person.maintainerOf?.includes(lib));
	const isContributorOfFiltered = libraryIds.some((lib) => person.contributorOf?.includes(lib));

	if (isCreatorOfFiltered) return 'creator';
	if (isMaintainerOfFiltered) return 'maintainer';
	if (isContributorOfFiltered) return 'contributor';
	return 'other';
}

export function getRolePriorityForFilteredLibraries(
	person: Maintainer,
	libraryIds: Library['id'][] | undefined,
): number {
	const role = getRoleForFilteredLibraries(person, libraryIds);

	// Higher numbers = higher priority (sorted first)
	switch (role) {
		case 'creator':
			return 4;
		case 'maintainer':
			return 3;
		case 'contributor':
			return 2;
		case 'other':
			return 1;
		default:
			return 0;
	}
}

export function getIsCoreMaintainerForFilteredLibraries(
	person: Maintainer,
	libraryIds: Library['id'][] | undefined,
): boolean {
	// If no libraries are filtered, use global core maintainer status
	if (!libraryIds || libraryIds.length === 0) {
		return person.isCoreMaintainer || false;
	}

	// When filtering, core maintainer status is only relevant if they have a role in filtered libraries
	const role = getRoleForFilteredLibraries(person, libraryIds);
	return role !== 'other' && (person.isCoreMaintainer || false);
}
