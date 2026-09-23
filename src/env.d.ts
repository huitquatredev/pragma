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
    gsap: any;
    ScrollTrigger: any;
  }

  namespace App {
    interface Locals {
      user: import('@supabase/supabase-js').User | null;
      inscription: import('./lib/supabase').Inscription | null;
      supabase: ReturnType<typeof import('./lib/supabase').createSupabaseServerClient> | null;
    }
  }
}

export {};
