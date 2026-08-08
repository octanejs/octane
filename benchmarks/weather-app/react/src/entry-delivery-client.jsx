import React from 'react';
import { hydrateRoot } from 'react-dom/client';
import App from './App.jsx';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main hydration root');

const delivery = window.__weatherDelivery;
if (!delivery || delivery.mode !== 'streamed_shell') {
	throw new Error('missing server-rendered weather shell');
}

delivery.hydrationCalls++;
hydrateRoot(
	target,
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
