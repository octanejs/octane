function ImportAliasIcon() {
	return <span class="alias-escaped-icon">alias icon</span>;
}

namespace ImportAliasIcon {
	export const tag = 'icon';
}

export import AliasedIcon = ImportAliasIcon;

export function ImportAliasChild() @{
	<main>
		<ImportAliasIcon />
	</main>
}
