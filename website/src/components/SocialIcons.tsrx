// The X / Discord / GitHub icon row. Rendered twice by the Header — inline on
// the right of the bar at desktop width, and inside the hamburger menu at the
// bottom on small screens — so its styles live here (Octane scopes a component's
// <style> to that component) and both placements stay in sync.
import { SOCIAL } from '../constants/site.ts';
import xUrl from '../assets/x.svg';
import discordUrl from '../assets/discord.svg';
import githubUrl from '../assets/github.svg';

export function SocialIcons() @{
	<span class="social-group">
		<a
			class="nav-icon"
			href={SOCIAL.x}
			target="_blank"
			rel="noreferrer"
			title="X"
			aria-label="Octane on X"
		>
			<span class="nav-icon-glyph" style={'--icon:url("' + xUrl + '")'} aria-hidden="true"></span>
		</a>
		<a
			class="nav-icon"
			href={SOCIAL.discord}
			target="_blank"
			rel="noreferrer"
			title="Discord"
			aria-label="Octane on Discord"
		>
			<span
				class="nav-icon-glyph"
				style={'--icon:url("' + discordUrl + '")'}
				aria-hidden="true"
			></span>
		</a>
		<a
			class="nav-icon"
			href={SOCIAL.github}
			target="_blank"
			rel="noreferrer"
			title="GitHub"
			aria-label="Octane on GitHub"
		>
			<span
				class="nav-icon-glyph"
				style={'--icon:url("' + githubUrl + '")'}
				aria-hidden="true"
			></span>
		</a>
		<style>
			.social-group {
				display: inline-flex;
				align-items: center;
				gap: 0.25rem;
			}
			.nav-icon {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 36px;
				height: 36px;
				border-radius: 9999px;
				color: var(--text-secondary);
				transition:
					background 0.15s,
					color 0.15s;
			}
			.nav-icon:hover {
				color: var(--text);
				background: var(--surface);
				text-decoration: none;
			}
			/* The brand svgs live in assets/ and are tinted through a mask, so they
			   follow the link's currentColor on hover. The url() in --icon MUST stay
			   quoted: vite inlines these as data: URIs whose attributes carry raw '
			   quotes, which an unquoted url() token cannot hold — the mask would fall
			   back to none and paint a solid box. */
			.nav-icon-glyph {
				width: 20px;
				height: 20px;
				flex: none;
				background: currentColor;
				mask: var(--icon) center / contain no-repeat;
				-webkit-mask: var(--icon) center / contain no-repeat;
			}
		</style>
	</span>
}
