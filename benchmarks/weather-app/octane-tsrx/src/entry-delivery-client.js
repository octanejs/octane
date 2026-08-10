import { hydrateRoot } from 'octane';
import { App } from './App.tsrx';

const target = document.getElementById('main');
if (!target) throw new Error('missing #main hydration root');

const delivery = window.__weatherDelivery;
if (!delivery || delivery.mode !== 'streamed_shell') {
	throw new Error('missing server-rendered weather shell');
}

delivery.hydrationCalls++;
hydrateRoot(target, App);
