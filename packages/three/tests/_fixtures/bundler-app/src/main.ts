import { createRoot } from 'octane';
import { App, WebGLFailureApp } from './App.tsrx';

const target = document.getElementById('root');
if (target === null) throw new Error('Octane Three bundler fixture requires #root');

const mode = new URLSearchParams(location.search).get('mode');
createRoot(target).render(mode === 'webgl-failure' ? WebGLFailureApp : App);
