import { vAutoAnimate } from "../../vue/index";
export default function autoAnimateNuxtPlugin(app) {
  app.vueApp.directive("auto-animate", vAutoAnimate);
}
