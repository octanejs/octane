import {
	animate,
	createAnimatable,
	createDraggable,
	createScope,
	createTimeline,
	createTimer,
	engine,
	splitText,
	stagger,
	useAnimeScope,
	waapi,
} from '@octanejs/animejs';
import { threeAdapter } from '@octanejs/animejs/adapters/three';

const target = document.createElement('div');
const animation = animate(target, { x: 100, duration: 250 });
const timeline = createTimeline().add(target, { opacity: [0, 1] });
const scope = createScope({ root: target });
const timer = createTimer({ duration: 100 });
const animatable = createAnimatable(target, { x: 0 });
const draggable = createDraggable(target);
const pieces = splitText(target);
const delay = stagger(25);
const scoped = useAnimeScope(() => {}, []);

animation.pause();
timeline.pause();
scope.revert();
timer.pause();
animatable.x(10);
draggable.disable();
pieces.revert();
engine.pause();
waapi.animate(target, { opacity: 1 });
scoped.scope.current?.refresh();
void threeAdapter;
void delay;
