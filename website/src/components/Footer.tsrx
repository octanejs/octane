// The site footer strip: the license line on the left, and the project's
// social icons — X, Discord, GitHub, in the same order as the header — on the
// right, tinted through the same mask technique the header's nav icons use so
// they follow currentColor on hover. Layout decides whether it renders at all —
// the playground fills the viewport below the nav and has no footer under it.
import { SOCIAL } from '../constants/site.ts';
import xUrl from '../assets/x.svg';
import discordUrl from '../assets/discord.svg';
import githubUrl from '../assets/github.svg';

export function Footer() @{
	<footer class="footer">
		<div class="footer-inner">
			<p class="footer-note">{'MIT licensed. Built with Octane (TSRX).'}</p>
			<nav aria-label="Octane on social media">
				<ul class="footer-social">
					<li>
						<a
							class="footer-icon"
							href={SOCIAL.x}
							target="_blank"
							rel="noreferrer"
							title="X"
							aria-label="Octane on X"
						>
							<span
								class="footer-icon-glyph"
								style={'--icon:url("' + xUrl + '")'}
								aria-hidden="true"
							></span>
						</a>
					</li>
					<li>
						<a
							class="footer-icon"
							href={SOCIAL.discord}
							target="_blank"
							rel="noreferrer"
							title="Discord"
							aria-label="Octane on Discord"
						>
							<span
								class="footer-icon-glyph"
								style={'--icon:url("' + discordUrl + '")'}
								aria-hidden="true"
							></span>
						</a>
					</li>
					<li>
						<a
							class="footer-icon"
							href={SOCIAL.github}
							target="_blank"
							rel="noreferrer"
							title="GitHub"
							aria-label="Octane on GitHub"
						>
							<span
								class="footer-icon-glyph"
								style={'--icon:url("' + githubUrl + '")'}
								aria-hidden="true"
							></span>
						</a>
					</li>
				</ul>
			</nav>
		</div>
		<style>
			.footer {
				border-top: 1px solid var(--border);
				margin-top: 4rem;
			}
			.footer-inner {
				max-width: 1420px;
				margin: 0 auto;
				padding: 1rem 1.5rem;
				display: flex;
				justify-content: space-between;
				align-items: center;
				flex-wrap: wrap;
				gap: 0.5rem 2rem;
				color: var(--text-secondary);
				font-size: 0.875rem;
			}
			.footer-note {
				margin: 0;
			}
			/* The icons are a list, so assistive tech announces the group's size;
			   the list chrome itself is stripped. */
			.footer-social {
				display: flex;
				align-items: center;
				gap: 0.25rem;
				margin: 0;
				padding: 0;
				list-style: none;
			}
			.footer-social li {
				display: flex;
			}
			.footer-icon {
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
			.footer-icon:hover {
				color: var(--text);
				background: rgba(255, 255, 255, 0.06);
				text-decoration: none;
			}
			/* Tinted through a mask so the svg follows the link's currentColor on
			   hover. The url() in --icon MUST stay quoted: vite inlines these as
			   data: URIs whose attributes carry raw ' quotes, which an unquoted
			   url() token cannot hold — the mask would fall back to none and paint
			   a solid box. */
			.footer-icon-glyph {
				width: 20px;
				height: 20px;
				flex: none;
				background: currentColor;
				mask: var(--icon) center / contain no-repeat;
				-webkit-mask: var(--icon) center / contain no-repeat;
			}
		</style>
	</footer>
}
