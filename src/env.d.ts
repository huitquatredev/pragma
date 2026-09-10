/// <reference types="astro/client" />

declare module "gsap" {
  export * from "gsap";
}

declare module "gsap/ScrollTrigger" {
  import { Plugin } from "gsap";
  const ScrollTrigger: Plugin;
  export default ScrollTrigger;
}

declare global {
  interface Window {
    gsap: typeof import("gsap");
    ScrollTrigger: typeof import("gsap/ScrollTrigger").default;
  }
}

export {};
