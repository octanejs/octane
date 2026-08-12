import { Controller, parseMergedHandlers } from '@use-gesture/core';
import {
	dragAction,
	hoverAction,
	moveAction,
	pinchAction,
	registerAction,
	scrollAction,
	wheelAction,
} from '@use-gesture/core/actions';
import type { GestureHandlers, UserGestureConfig } from '@use-gesture/core/types';
import { useEffect, useMemo } from '@octanejs/three/renderer';
import { slotDefault } from '../core/compiler-slot.js';

for (const action of [dragAction, pinchAction, scrollAction, wheelAction, moveAction, hoverAction])
	registerAction(action);

export function useGesture(handlersInput: GestureHandlers, configInput: UserGestureConfig = {}) {
	configInput = slotDefault(configInput, {});
	const { handlers, nativeHandlers, config } = parseMergedHandlers(handlersInput, configInput);
	const controller = useMemo(() => new Controller(handlers), []);
	controller.applyHandlers(handlers, nativeHandlers);
	controller.applyConfig(config);
	useEffect(controller.effect.bind(controller));
	useEffect(() => controller.clean.bind(controller), []);
	return config.target === undefined ? controller.bind.bind(controller) : undefined;
}
