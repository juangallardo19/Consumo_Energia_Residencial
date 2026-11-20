import {
  DestroyRef, Directive, ElementRef, Injectable, afterNextRender, effect, inject, input, signal, untracked,
} from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { fmt } from './fmt';

gsap.registerPlugin(ScrollTrigger, SplitText);

/** Scroll suave (Lenis) sincronizado con ScrollTrigger y respeto por "reducir movimiento". */
@Injectable({ providedIn: 'root' })
export class Motion {
  readonly reducido = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private lenis: Lenis | null = null;

  iniciar() {
    if (this.reducido || this.lenis) return;
    this.lenis = new Lenis({ duration: 1.1, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true });
    this.lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => this.lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  irA(destino: string | HTMLElement) {
    const el = typeof destino === 'string' ? document.querySelector<HTMLElement>(destino) : destino;
    if (!el) return;
    if (this.lenis) this.lenis.scrollTo(el, { duration: 1.3, offset: -8 });
    else el.scrollIntoView({ behavior: this.reducido ? 'auto' : 'smooth' });
  }

  refrescar() { ScrollTrigger.refresh(); }
}

/** Señal que pasa a true la primera vez que el elemento entra en pantalla. */
export function enVista(el: HTMLElement, margen = '0px 0px -12% 0px') {
  const visto = signal(false);
  const destroy = inject(DestroyRef);
  afterNextRender(() => {
    if (typeof IntersectionObserver === 'undefined') { visto.set(true); return; }
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { visto.set(true); io.disconnect(); }
    }, { rootMargin: margen });
    io.observe(el);
    destroy.onDestroy(() => io.disconnect());
  });
  return visto.asReadonly();
}

/** Señal con el ancho del elemento (para dibujar SVG a resolución real). */
export function anchoDe(el: HTMLElement) {
  const ancho = signal(0);
  const destroy = inject(DestroyRef);
  afterNextRender(() => {
    ancho.set(el.clientWidth);
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (Math.abs(w - ancho()) > 1) ancho.set(w);
    });
    ro.observe(el);
    destroy.onDestroy(() => ro.disconnect());
  });
  return ancho.asReadonly();
}

/** Aparece al entrar en pantalla: sube y se funde (una sola vez). */
@Directive({ selector: '[appReveal]' })
export class Reveal {
  readonly appReveal = input<number | string>('');
  readonly revealY = input(28);
  constructor() {
    const el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const motion = inject(Motion);
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (motion.reducido) return;
      const ctx = gsap.context(() => {
        gsap.from(el, {
          y: this.revealY(), opacity: 0, duration: 0.9, ease: 'expo.out', delay: +(this.appReveal() || 0),
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        });
      });
      destroy.onDestroy(() => ctx.revert());
    });
  }
}

/**
 * Parallax: el elemento se desplaza a otra velocidad que el scroll.
 * velocidad > 0 baja más lento que la página (se queda atrás), < 0 se adelanta.
 */
@Directive({ selector: '[appParallax]' })
export class Parallax {
  readonly appParallax = input(0.15);
  /** Solo en pantallas anchas por defecto: en móvil el parallax marea y tapa contenido. */
  readonly parallaxMovil = input(false);
  constructor() {
    const el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const motion = inject(Motion);
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (motion.reducido) return;
      const mm = gsap.matchMedia();
      mm.add(this.parallaxMovil() ? '(min-width: 0px)' : '(min-width: 861px)', () => {
        const d = () => this.appParallax() * window.innerHeight * 0.5;
        gsap.fromTo(el, { y: () => -d() }, {
          y: () => d(), ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 0.6, invalidateOnRefresh: true },
        });
      });
      destroy.onDestroy(() => mm.revert());
    });
  }
}

/**
 * Parallax escalonado: los hijos que coinciden con el selector llegan desde más abajo cuanto
 * mayor es su índice, ligados al scroll (cada tarjeta se mueve a su propia velocidad).
 */
@Directive({ selector: '[appStagger]' })
export class Stagger {
  readonly appStagger = input.required<string>();
  readonly staggerBase = input(24);
  readonly staggerPaso = input(22);
  constructor() {
    const el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const motion = inject(Motion);
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (motion.reducido) return;
      const ctx = gsap.context(() => {
        gsap.from(el.querySelectorAll(this.appStagger()), {
          y: (i: number) => this.staggerBase() + i * this.staggerPaso(), ease: 'none',
          scrollTrigger: { trigger: el, start: 'top bottom', end: 'top 50%', scrub: 0.6 },
        });
      });
      destroy.onDestroy(() => ctx.revert());
    });
  }
}

/** Títulos: cada línea sube desde una máscara (SplitText). */
@Directive({ selector: '[appSplit]' })
export class Split {
  /** Si es true se anima al cargar y no con el scroll. */
  readonly splitInmediato = input(false);
  readonly splitDelay = input(0);
  constructor() {
    const el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const motion = inject(Motion);
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (motion.reducido) return;
      const split = SplitText.create(el, {
        type: 'lines', mask: 'lines', autoSplit: true,
        onSplit: self => gsap.from(self.lines, {
          yPercent: 105, duration: 1.05, ease: 'expo.out', stagger: 0.08, delay: this.splitDelay(),
          scrollTrigger: this.splitInmediato() ? undefined : { trigger: el, start: 'top 88%', once: true },
        }),
      });
      destroy.onDestroy(() => split.revert());
    });
  }
}

/** Número que cuenta hasta su valor al entrar en pantalla y que se re-anima cuando cambia (filtros). */
@Directive({ selector: '[appCount]' })
export class CountUp {
  readonly appCount = input.required<number>();
  readonly decimales = input(0);
  readonly duracion = input(1.4);
  private actual = 0;
  constructor() {
    const el = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    const motion = inject(Motion);
    const visto = enVista(el, '0px 0px -6% 0px');
    let tween: gsap.core.Tween | null = null;
    effect(() => {
      const destino = this.appCount();
      const dec = this.decimales();
      if (motion.reducido) { this.actual = destino; el.textContent = fmt(destino, dec); return; }
      if (!visto()) { el.textContent = fmt(0, dec); return; }
      untracked(() => {
        tween?.kill();
        if (motion.reducido) { this.actual = destino; el.textContent = fmt(destino, dec); return; }
        const o = { v: this.actual };
        tween = gsap.to(o, {
          v: destino, duration: this.actual === 0 ? this.duracion() : 0.6, ease: 'power3.out',
          onUpdate: () => { this.actual = o.v; el.textContent = fmt(o.v, dec); },
        });
      });
    });
    inject(DestroyRef).onDestroy(() => tween?.kill());
  }
}
