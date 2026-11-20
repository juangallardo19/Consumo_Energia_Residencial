import { Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { fechaLarga, fmt } from '../core/fmt';
import { anchoDe, enVista } from '../core/motion';
import { Tooltip } from '../core/tooltip';

export interface PuntoXY { x: number; y: number; grupo: number; fecha: string }

/** Dispersión temperatura × consumo con recta de mínimos cuadrados y leyenda que oculta grupos. */
@Component({
  selector: 'app-scatter',
  template: `
    <div class="legend" role="group" aria-label="Mostrar u ocultar estaciones">
      @for (g of grupos(); track g; let i = $index) {
        <button type="button" class="legend__item" [attr.aria-pressed]="!ocultos().has(i)" (click)="alternar(i)">
          <i [style.background]="colores()[i]"></i>{{ g }}
        </button>
      }
    </div>
    <div class="chart" [style.height.px]="alto()" role="img" [attr.aria-label]="ariaLabel()">
      @if (w() > 0) {
        <svg [attr.viewBox]="'0 0 ' + w() + ' ' + alto()" [attr.width]="w()" [attr.height]="alto()">
          <g class="axis">
            @for (t of ejeY(); track $index) {
              <line class="gridline" [attr.x1]="m.l" [attr.x2]="w() - m.r" [attr.y1]="t.p" [attr.y2]="t.p" />
              <text [attr.x]="m.l - 8" [attr.y]="t.p + 4" text-anchor="end">{{ t.txt }}</text>
            }
            @for (t of ejeX(); track $index) {
              <text [attr.x]="t.p" [attr.y]="alto() - 8" text-anchor="middle">{{ t.txt }}</text>
            }
            <text class="axis__title" [attr.x]="w() - m.r" [attr.y]="alto() - 22" text-anchor="end">temperatura media del día (°C) →</text>
            <text class="axis__title" [attr.x]="m.l + 4" [attr.y]="m.t - 6">kWh del día</text>
          </g>
          @for (p of puntos(); track p.fecha) {
            <circle class="dot" [class.is-in]="visto()" [attr.cx]="p.cx" [attr.cy]="p.cy" r="4" [style.fill]="p.color"
                    [style.--d]="p.d"
                    (pointerenter)="tt.mostrar({ titulo: p.titulo, lineas: [{ valor: p.txt, color: p.color }] }, $event)"
                    (pointermove)="tt.mover($event)" (pointerleave)="tt.ocultar()" />
          }
          @if (recta(); as r) {
            <line class="trend" [class.is-in]="visto()" [attr.x1]="r.x1" [attr.y1]="r.y1" [attr.x2]="r.x2" [attr.y2]="r.y2" pathLength="1" />
          }
        </svg>
      }
    </div>
    @if (recta(); as r) {
      <p class="chart-note">Recta de tendencia: cada grado menos suma <b>{{ fmtN(-r.pendiente, 2) }} kWh</b> al día · correlación r = {{ fmtN(r.r, 2) }} ({{ r.n }} días)</p>
    }`,
})
export class Scatter {
  readonly datos = input.required<PuntoXY[]>();
  readonly grupos = input.required<string[]>();
  readonly colores = input.required<string[]>();
  readonly alto = input(340);
  readonly ariaLabel = input('');
  protected readonly tt = inject(Tooltip);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  protected readonly w = anchoDe(this.host);
  protected readonly visto = enVista(this.host);
  protected readonly ocultos = signal(new Set<number>());
  protected readonly m = { t: 24, r: 12, b: 40, l: 44 };
  protected readonly fmtN = fmt;

  private readonly visibles = computed(() => this.datos().filter(p => !this.ocultos().has(p.grupo)));
  private readonly dom = computed(() => {
    const d = this.datos();
    return { x0: Math.floor(Math.min(...d.map(p => p.x)) / 5) * 5, x1: Math.ceil(Math.max(...d.map(p => p.x)) / 5) * 5, y1: Math.ceil(Math.max(...d.map(p => p.y)) / 20) * 20 };
  });
  private readonly sx = computed(() => (v: number) => this.m.l + ((v - this.dom().x0) / (this.dom().x1 - this.dom().x0)) * (this.w() - this.m.l - this.m.r));
  private readonly sy = computed(() => (v: number) => this.alto() - this.m.b - (v / this.dom().y1) * (this.alto() - this.m.t - this.m.b));
  protected readonly ejeX = computed(() => {
    const out = [];
    for (let v = this.dom().x0; v <= this.dom().x1; v += 5) out.push({ p: this.sx()(v), txt: fmt(v) + ' °C' });
    return out;
  });
  protected readonly ejeY = computed(() => [0, 1, 2, 3, 4].map(i => ({ p: this.sy()((this.dom().y1 / 4) * i), txt: fmt((this.dom().y1 / 4) * i) })));
  protected readonly puntos = computed(() => this.visibles().map((p, i) => ({
    fecha: p.fecha, cx: this.sx()(p.x), cy: this.sy()(p.y), color: this.colores()[p.grupo], d: `${(i % 60) * 12}ms`,
    titulo: fechaLarga(p.fecha) + ' · ' + this.grupos()[p.grupo], txt: `${fmt(p.x, 1)} °C · ${fmt(p.y, 1)} kWh`,
  })));
  protected readonly recta = computed(() => {
    const d = this.visibles();
    if (d.length < 3) return null;
    const n = d.length, mx = d.reduce((s, p) => s + p.x, 0) / n, my = d.reduce((s, p) => s + p.y, 0) / n;
    let sxy = 0, sxx = 0, syy = 0;
    for (const p of d) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; syy += (p.y - my) ** 2; }
    const b = sxy / sxx, a = my - b * mx;
    const x0 = Math.min(...d.map(p => p.x)), x1 = Math.max(...d.map(p => p.x));
    return { pendiente: b, r: sxy / Math.sqrt(sxx * syy), n, x1: this.sx()(x0), y1: this.sy()(a + b * x0), x2: this.sx()(x1), y2: this.sy()(a + b * x1) };
  });

  protected alternar(i: number) {
    const s = new Set(this.ocultos());
    if (s.has(i)) s.delete(i); else if (s.size < this.grupos().length - 1) s.add(i);
    this.ocultos.set(s);
  }
}
