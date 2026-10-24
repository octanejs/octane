import { useState } from 'octane';

// JSX outside a recognized component: module values, registry callbacks,
// registration calls, factories, and multi-declarator statements (#2213).
const screens = new Map();

function registerScreen(name, render) {
	screens.set(name, render);
}

function makeCounter(label) {
	function Counter() {
		const [count, setCount] = useState(0);
		return <counter label={label} count={count} increment={() => setCount(count + 1)} />;
	}
	return Counter;
}

const makeBadge = (tone) => {
	const Badge = () => <badge tone={tone} />;
	return Badge;
};

const banner = <banner />;

export const tabs = [{ id: 'home', render: (tone) => <tab id="home" tone={tone} /> }];

registerScreen('settings', () => <screen id="settings" />);

const Footer = () => <footer />,
	footerLabel = 'end';

export const ModuleCounter = makeCounter('module');
const ModuleBadge = makeBadge('bright');

export function ModuleJsxScene(props) @{
	<scene>
		{banner}
		{tabs[0].render(props.tone)}
		{screens.get('settings')()}
		<ModuleCounter />
		<ModuleBadge />
		<Footer />
		<label>{footerLabel as string}</label>
	</scene>
}
