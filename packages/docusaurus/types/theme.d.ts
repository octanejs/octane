export interface OctaneDocusaurusThemePlugin {
	name: '@octanejs/docusaurus-theme-classic';
	getThemePath(): string;
	getClientModules(): string[];
}

export declare function octaneClassicTheme(): OctaneDocusaurusThemePlugin;
export default octaneClassicTheme;
