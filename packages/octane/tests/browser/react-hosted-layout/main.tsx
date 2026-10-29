import * as React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { OctaneCompat } from 'octane/react';
import { Title } from './Title.tsrx';

const label = 'A-long-unbroken-example-text-'.repeat(3);

// The same shrinkable title twice: once as a direct flex item, once hosted by
// OctaneCompat. The hosted row must lay out exactly like the direct one.
function Rows(props: { wide: boolean }) {
	const buttonStyle = { width: props.wide ? 96 : 48 };
	return (
		<>
			<div className="row" id="direct">
				<span className="title">{label}</span>
				<button style={buttonStyle}>Toggle</button>
			</div>
			<div className="row" id="hosted">
				<OctaneCompat component={Title} props={{ label }} />
				<button style={buttonStyle}>Toggle</button>
			</div>
		</>
	);
}

const root = createRoot(document.getElementById('root')!);
flushSync(() => root.render(<Rows wide={false} />));

window.__hostedLayout = {
	render(wide: boolean) {
		flushSync(() => root.render(<Rows wide={wide} />));
	},
	measure(rowId: string) {
		const row = document.getElementById(rowId)!.getBoundingClientRect();
		const title = document.querySelector(`#${rowId} .title`)!.getBoundingClientRect();
		const button = document.querySelector(`#${rowId} button`)!.getBoundingClientRect();
		return {
			rowWidth: row.width,
			titleWidth: title.width,
			buttonRight: button.right - row.left,
		};
	},
	hostDisplay() {
		const host = document.querySelector('[data-octane-compat]');
		return host === null ? null : getComputedStyle(host).display;
	},
};

declare global {
	interface Window {
		__hostedLayout: {
			render(wide: boolean): void;
			measure(rowId: string): { rowWidth: number; titleWidth: number; buttonRight: number };
			hostDisplay(): string | null;
		};
	}
}
