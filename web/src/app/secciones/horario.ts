import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { DayCurve } from '../charts/day-curve';
import { FilaH, HBars } from '../charts/hbars';
import { Heatmap } from '../charts/heatmap';
import { Filtros } from '../core/filtros';
import { fmt } from '../core/fmt';
import { Medidas } from '../core/medidas.service';
import { Motion, Reveal, Split, Stagger } from '../core/motion';
import { PBI } from '../data/modelo';

/** Requerimientos 2 y 8: el scroll recorre las 24 horas del día promedio. */
@Component({
  selector: 'app-dia',
  imports: [DayCurve, Filtros],
  template: `
    <section class="dia" id="dia">
      <div class="dia__pin">
        <div class="container dia__layout">
          <div class="dia__copy">
            <p class="eyebrow">Req. 2 y 8 · Horas pico y promedio por hora</p>
            <h2 class="h2">Un día en la casa</h2>
            <div class="clock">
              <span class="clock__time">{{ actual().etiqueta }}</span>
              <span class="tag">{{ actual().franja }}</span>
            </div>
            <p class="dia__kwh"><b>{{ fmtN(kwhActual(), 2) }}</b> kWh en esa hora</p>
            <p class="dia__text">La casa despierta a las 7:00, baja el ritmo al mediodía y alcanza su pico a las <b>{{ pico().etiqueta }}</b> con {{ fmtN(pico().kwh, 2) }} kWh: {{ fmtN(pico().kwh / valle().kwh, 1) }} veces lo que gasta a las {{ valle().etiqueta }} ({{ fmtN(valle().kwh, 2) }} kWh). En promedio, {{ fmtN(md.kpis().horas ? md.kpis().energia / md.kpis().horas : 0, 2) }} kWh por hora.</p>
            <app-filtros id="f-dia" />
          </div>
          <div class="chart-card chart-card--day">
            <div class="sky" aria-hidden="true"><div class="sky__sun" [style.transform]="sol().t" [style.opacity]="sol().o"></div></div>
            <app-day-curve [perfil]="md.perfilHora()" [progreso]="progreso()" />
          </div>
        </div>
      </div>
    </section>`,
})
export class Dia {
  protected readonly md = inject(Medidas);
  private readonly motion = inject(Motion);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  protected readonly progreso = signal(20 / 23);
  protected readonly fmtN = fmt;
  private readonly anchoCielo = signal(600);

  protected readonly actual = computed(() => this.md.perfilHora()[Math.round(this.progreso() * 23)]);
  protected readonly kwhActual = computed(() => {
    const p = this.md.perfilHora(), hr = this.progreso() * 23, i = Math.min(22, Math.floor(hr));
    return p[i].kwh + (p[i + 1].kwh - p[i].kwh) * (hr - i);
  });
  protected readonly pico = computed(() => this.md.perfilHora().reduce((a, b) => (b.kwh > a.kwh ? b : a)));
  protected readonly valle = computed(() => this.md.perfilHora().reduce((a, b) => (b.kwh < a.kwh ? b : a)));
  /** El sol recorre un arco: sale a las 5:00 y se pone a las 21:00. */
  protected readonly sol = computed(() => {
    const t = this.progreso();
    const arco = Math.sin(Math.PI * Math.min(1, Math.max(0, (t * 23 - 5) / 16)));
    return { t: `translate(${t * (this.anchoCielo() - 36)}px, ${54 - arco * 54}px)`, o: 0.35 + arco * 0.65 };
  });

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const cielo = this.host.querySelector<HTMLElement>('.sky')!;
      const ro = new ResizeObserver(() => this.anchoCielo.set(cielo.clientWidth));
      ro.observe(cielo);
      destroy.onDestroy(() => ro.disconnect());
      if (this.motion.reducido) return;
      this.progreso.set(0);
      const mm = gsap.matchMedia();
      mm.add('(min-width: 861px)', () => {
        ScrollTrigger.create({
          trigger: this.host.querySelector('.dia')!, start: 'top top', end: '+=170%', pin: this.host.querySelector('.dia__pin')!, scrub: 0.5,
          onUpdate: s => this.progreso.set(s.progress),
        });
      });
      mm.add('(max-width: 860px)', () => {
        ScrollTrigger.create({
          trigger: this.host.querySelector('.chart-card--day')!, start: 'top 80%', end: 'bottom 35%', scrub: 0.5,
          onUpdate: s => this.progreso.set(s.progress),
        });
      });
      destroy.onDestroy(() => mm.revert());
    });
  }
}

/** Página "Patrones horarios" del reporte: franjas, tipo de día y mapa de calor. */
@Component({
  selector: 'app-patrones',
  imports: [Filtros, HBars, Heatmap, Split, Reveal, Stagger],
  template: `
    <section class="section" id="patrones">
      <div class="container">
        <div class="section__head section__head--row">
          <div>
            <p class="eyebrow">Req. 3 · Laborables contra fines de semana</p>
            <h2 class="h2" appSplit>El fin de semana la casa no descansa.</h2>
          </div>
          <p class="section__note">Un día de fin de semana gasta {{ fmtN(difFinde(), 0) }} % más que uno laborable. El mapa de calor muestra por qué: el sábado y el domingo el consumo de la mañana y el mediodía no baja.</p>
        </div>

        <div class="board" appReveal>
          <app-filtros id="f-patrones" />
          <div class="patrones" appStagger=".card" [staggerBase]="16" [staggerPaso]="26">
            <div class="card">
              <h3 class="h3">¿Se consume más los fines de semana y festivos?</h3>
              <app-hbars [filas]="tipos()" [max]="maxTipo()" />
              <p class="card__foot">Consumo promedio diario (kWh). Los festivos se separan de los fines de semana con la API del gobierno francés.</p>
            </div>
            <div class="card">
              <h3 class="h3">Consumo promedio por franja del día</h3>
              <app-hbars [filas]="franjas()" unidad="kWh por hora" [decimales]="2" />
              <p class="card__foot">Consumo promedio por hora medida (kWh) en cada franja de Dim_Hora.</p>
            </div>
            <div class="card card--wide">
              <h3 class="h3">Mapa de calor: día de la semana × hora</h3>
              <app-heatmap [valores]="md.calor()" [filas]="diasSemana" ariaLabel="Consumo promedio por hora según el día de la semana y la hora" />
              <p class="card__foot">Cada celda es el consumo promedio de esa hora (kWh). Más oscuro, más consumo.</p>
            </div>
          </div>
        </div>
      </div>
    </section>`,
})
export class Patrones {
  protected readonly md = inject(Medidas);
  protected readonly fmtN = fmt;
  protected readonly diasSemana = PBI.dias_semana;
  private readonly fondosTipo = ['var(--lilac)', 'var(--yellow)', 'var(--mint)'];
  protected readonly tipos = computed<FilaH[]>(() => this.md.porTipoDia().map((t, i) => ({
    nombre: PBI.tipos[i], sub: `${fmt(t.dias)} días`, valor: t.kwh, fondo: this.fondosTipo[i],
  })));
  protected readonly maxTipo = computed(() => Math.max(...this.md.porTipoDia().map(t => t.kwh)) * 1.15);
  protected readonly difFinde = computed(() => {
    const t = this.md.porTipoDia();
    return t[0].kwh ? (t[1].kwh / t[0].kwh - 1) * 100 : 0;
  });
  private readonly fondosFranja = ['var(--lilac)', 'var(--yellow)', 'var(--peach)', 'var(--sky)'];
  protected readonly franjas = computed<FilaH[]>(() => this.md.porFranja().map((f, i) => ({
    nombre: f.franja, sub: f.rango, valor: f.kwh, fondo: this.fondosFranja[i],
  })));
}
