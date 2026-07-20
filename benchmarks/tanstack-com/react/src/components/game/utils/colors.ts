// Brand colors for the 3D island explorer game
// Vibrant cartoon style inspired by tropical mobile games

export const COLORS = {
	ocean: {
		floor: '#005570', // sea floor deep color
		deep: '#0066CC', // rich deep blue
		mid: '#0088DD', // mid blue
		surface: '#00AAEE', // bright surface blue
		shallow: '#40E0D0', // turquoise shallow
		foam: '#FFFFFF', // white foam
	},
	sand: {
		light: '#F5DEB3', // wheat/light sand
		mid: '#DEB887', // burlywood/golden sand
		dark: '#C4A35A', // wet sand
		beach: '#FFE4B5', // moccasin/dry beach
	},
	grass: {
		light: '#7CFC00', // lawn green highlight
		mid: '#32CD32', // lime green
		dark: '#228B22', // forest green shadow
	},
	palm: {
		trunk: '#8B4513', // saddle brown
		trunkDark: '#654321', // dark brown
		frond: '#32CD32', // lime green
		frondLight: '#7CFC00', // bright green
		frondDark: '#228B22', // forest green
		coconut: '#8B4513', // brown
	},
	sky: {
		top: '#1E90FF', // dodger blue
		mid: '#87CEEB', // sky blue
		horizon: '#B0E0E6', // powder blue
	},
	boat: {
		hull: '#DC143C', // crimson red
		hullDark: '#B22222', // firebrick
		hullLight: '#FF6347', // tomato highlight
		deck: '#DEB887', // burlywood wood
		accent: '#FFD700', // gold trim
	},
	wood: {
		light: '#DEB887', // burlywood
		dark: '#8B4513', // saddle brown
		bamboo: '#9ACD32', // yellow green
	},
	tiki: {
		roof: '#8B4513', // saddle brown
		thatch: '#DAA520', // goldenrod
		post: '#654321', // dark wood
	},
} as const;

// Library-specific colors for flags and beach chairs
// These map to the existing library brand colors
export const LIBRARY_COLORS: Record<string, string> = {
	query: '#EF4444', // red-500
	router: '#10B981', // emerald-500
	start: '#06B6D4', // cyan-500
	table: '#3B82F6', // blue-500
	form: '#EAB308', // yellow-500
	virtual: '#A855F7', // purple-500
	ranger: '#64748B', // slate-500
	store: '#B45309', // amber-700
	pacer: '#84CC16', // lime-500
	db: '#F97316', // orange-500
	ai: '#EC4899', // pink-500
	config: '#64748B', // slate-500
	devtools: '#94A3B8', // slate-400
} as const;

export function getLibraryColor(libraryId: string): string {
	return LIBRARY_COLORS[libraryId] || '#64748B';
}
