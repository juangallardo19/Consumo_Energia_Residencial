import { Component, ElementRef, afterNextRender, computed, inject } from '@angular/core';
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { fmt } from '../core/fmt';
import { Motion } from '../core/motion';
import { PBI } from '../data/modelo';

/** Portada: la casa es un treemap con las 4 zonas en su proporción real (Energía Electrodoméstico kWh). */
@Component({
  selector: 'app-hero',
  template: `
    <section class="hero" id="inicio">
      <div class="container hero__inner">
        <div class="hero__copy">
          <p class="eyebrow hero-in">Proyecto 5 · Grupo 7</p>
          <h1 class="hero__title" id="hero-title">¿En qué se va la energía de una casa?</h1>
          <p class="hero__lead hero-in">Cuatro años de mediciones minuto a minuto de una vivienda en Sceaux, Francia, cruzadas con clima, festivos y tarifas eléctricas. Todas las cifras de esta página salen del modelo del informe de Power BI.</p>
          <div class="hero__cta hero-in">
            <button type="button" class="btn btn--ink" (click)="motion.irA('#proyecto')">Conocer el proyecto</button>
            <button type="button" class="btn btn--line" (click)="motion.irA('#dashboard')">Abrir el dashboard</button>
          </div>
        </div>

        <figure class="house" aria-label="La casa dividida según el consumo de cada zona">
          <div class="house__roof" data-speed="-0.45">
            <svg viewBox="0 0 400 150" preserveAspectRatio="none" aria-hidden="true"><path d="M6 146 200 6l194 140Z" /></svg>
            <span class="house__chimney"></span>
            <span class="house__total"><b class="hero-count" [attr.data-to]="total" data-dec="0">0</b> kWh</span>
          </div>
          <div class="house__body" [style.grid-template-columns]="geo().cols" [style.grid-template-rows]="geo().rows">
            @for (r of cuartos; track r.id) {
              <div class="room" [class]="'room room--' + r.clase" [attr.data-speed]="r.speed" [style.--c]="r.fondo">
                <span class="room__pct"><span class="hero-count" [attr.data-to]="r.pct" data-dec="1">0</span>%</span>
                <span class="room__name">{{ r.nombre }}</span>
              </div>
            }
          </div>
          <div class="house__ground" data-speed="0.2"></div>
          <figcaption class="house__caption">Cada cuarto ocupa el área que le corresponde en el consumo total, de diciembre de 2006 a noviembre de 2010.</figcaption>
        </figure>
      </div>
      <div class="hero__scroll hero-in" aria-hidden="true"><span></span>Desliza</div>
    </section>`,
})
export class Hero {
  protected readonly motion = inject(Motion);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  protected readonly total = PBI.kpis.energia_kwh;
  private readonly zonas = (() => {
    const t = [0, 0, 0, 0];
    for (const m of PBI.meses) m.z.forEach((v, i) => (t[i] += v));
    const s = t.reduce((a, b) => a + b, 0);
    return t.map(v => (v / s) * 100);
  })();
  protected readonly cuartos = [
    { id: 4, clase: 'resto', nombre: 'Resto de la vivienda', fondo: 'var(--mint)', speed: 0.12 },
    { id: 3, clase: 'calor', nombre: 'Calentador y A/C', fondo: 'var(--sky)', speed: -0.2 },
    { id: 2, clase: 'lav', nombre: 'Lavandería', fondo: 'var(--lilac)', speed: -0.32 },
    { id: 1, clase: 'coc', nombre: 'Cocina', fondo: 'var(--yellow)', speed: -0.5 },
  ].map(r => ({ ...r, pct: +this.zonas[r.id - 1].toFixed(1) }));
  /** Treemap: resto a la izquierda; a la derecha calentador arriba y lavandería + cocina abajo. */
  protected readonly geo = computed(() => {
    const [coc, lav, cal, resto] = this.zonas;
    const der = 100 - resto, abajo = coc + lav;
    return {
      cols: `${resto}fr ${(lav / abajo) * der}fr ${(coc / abajo) * der}fr`,
      rows: `${(cal / der) * 100}fr ${(abajo / der) * 100}fr`,
    };
  });

  constructor() {
    afterNextRender(() => {
      const counts = [...this.host.querySelectorAll<HTMLElement>('.hero-count')];
      const pintar = (n: HTMLElement, v: number) => (n.textContent = fmt(v, +(n.dataset['dec'] ?? 0)));
      if (this.motion.reducido) { counts.forEach(n => pintar(n, +n.dataset['to']!)); return; }

      const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
      SplitText.create('#hero-title', {
        type: 'lines', mask: 'lines', autoSplit: true,
        onSplit: self => tl.from(self.lines, { yPercent: 105, duration: 1.1, stagger: 0.08 }, 0.1),
      });
      tl.from('.hero-in', { y: 16, opacity: 0, duration: 0.9, stagger: 0.08 }, 0.45)
        .from('.house__ground', { scaleX: 0, duration: 0.9, ease: 'power3.inOut' }, 0.2)
        .from('.room', { scaleY: 0, transformOrigin: '50% 100%', duration: 0.9, stagger: 0.1 }, 0.45)
        .from('.house__roof', { yPercent: -45, opacity: 0, duration: 1 }, 0.85)
        .from('.house__caption', { opacity: 0, duration: 0.6 }, 1.2);
      counts.forEach(n => {
        const o = { v: 0 };
        tl.to(o, { v: +n.dataset['to']!, duration: 1.6, ease: 'power3.out', onUpdate: () => pintar(n, o.v) }, 0.7);
      });

      // Parallax: al bajar, la casa se "despieza" en capas a distintas velocidades.
      gsap.matchMedia().add('(min-width: 861px)', () => {
        this.host.querySelectorAll<HTMLElement>('.house [data-speed]').forEach(capa => {
          const s = parseFloat(capa.dataset['speed']!);
          gsap.to(capa, {
            y: () => s * window.innerHeight * 0.55, ease: 'none',
            scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6, invalidateOnRefresh: true },
          });
        });
        gsap.to('.hero__copy', { y: () => window.innerHeight * 0.18, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: 0.6 } });
        gsap.to('.hero__scroll', { opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: '20% top', scrub: true } });
      });
    });
  }
}
