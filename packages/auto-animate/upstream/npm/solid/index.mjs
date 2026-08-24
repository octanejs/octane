import autoAnimate from '../index.mjs';
import { createSignal, onMount, onCleanup } from 'solid-js';

const createAutoAnimate = (options = {}) => {
    const [element, setElement] = createSignal(null);
    let controller;
    let active = true;
    onMount(() => {
        const el = element();
        if (el) {
            controller = autoAnimate(el, options);
            if (active)
                controller.enable();
            else
                controller.disable();
            onCleanup(() => { var _a; return (_a = controller === null || controller === void 0 ? void 0 : controller.destroy) === null || _a === void 0 ? void 0 : _a.call(controller); });
        }
    });
    const setEnabled = (enabled) => {
        active = enabled;
        if (controller) {
            enabled ? controller.enable() : controller.disable();
        }
    };
    return [setElement, setEnabled];
};
const createAutoAnimateDirective = () => {
    return (el, options) => {
        let optionsValue = options();
        let resolvedOptions = {};
        if (optionsValue !== true)
            resolvedOptions = optionsValue;
        const controller = autoAnimate(el, resolvedOptions);
        onCleanup(() => { var _a; return (_a = controller.destroy) === null || _a === void 0 ? void 0 : _a.call(controller); });
    };
};

export { createAutoAnimate, createAutoAnimateDirective };
