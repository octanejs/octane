import { renderToStaticMarkup } from 'octane/server';
import { renderWithTailwind } from './tailwind/index.ts';

export interface RenderOptions {
	pretty?: boolean;
}

export type EmailComponent<Props> = (props: Props) => unknown;

const DOCTYPE =
	'<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

const HEAD_BOUNDARY = /<body[^>]*data-octane-email-head=["']head["'][^>]*>([\s\S]*?)<\/body>/gi;

/** Render an Octane email component to non-hydratable email HTML. */
export async function render<Props>(
	component: EmailComponent<Props>,
	props?: Props,
	options?: RenderOptions,
): Promise<string> {
	const document = await renderWithTailwind(() => {
		const { html, css } = renderToStaticMarkup(component, props);
		const cleanHtml = html.replace(/<!DOCTYPE.*?>/i, '');
		let authoredHead = '';
		const bodyHtml = cleanHtml.replace(HEAD_BOUNDARY, (_boundary, content: string) => {
			authoredHead += content;
			return '';
		});
		const htmlStart = bodyHtml.indexOf('<html');
		let documentHtml = bodyHtml;
		if (htmlStart >= 0) {
			const hoistedHead = bodyHtml.slice(0, htmlStart);
			const root = bodyHtml.slice(htmlStart);
			const head = `${hoistedHead}${authoredHead}${css}`;
			if (head.length > 0) {
				const openingEnd = root.indexOf('>') + 1;
				documentHtml = `${root.slice(0, openingEnd)}<head>${head}</head>${root.slice(openingEnd)}`;
			}
		} else if (authoredHead.length > 0 || css.length > 0) {
			documentHtml = bodyHtml.replace('<head>', `<head>${authoredHead}${css}`);
		}
		return `${DOCTYPE}${documentHtml}`;
	});
	return options?.pretty ? formatEmailHtml(document) : document;
}

export function formatEmailHtml(html: string): string {
	return html.replace(/></g, '>\n<');
}
