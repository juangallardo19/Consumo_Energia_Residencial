import { Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { divisiones, fmt, niceMax } from '../core/fmt';
import { anchoDe, enVista } from '../core/motion';
import { Tooltip } from '../core/tooltip';

export interface Serie { nombre: string; color: string; valores: (number | null)[]; oculta?: boolean }

/** Líneas de 2 px con cruz de lectura: el tooltip lista todas las series en ese punto del eje X. */
@Component({
  selector: 'app-line-chart',
  template: `
    <div class="chart" [style.height.px]="alto()" role="img" [attr.aria-label]="ariaLabel()">
      @if (w() > 0) {
        <svg [attr.viewBox]="'0 0 ' + w() + ' ' + alto()" [attr.width]="w()" [attr.height]="alto()"
             (pointermove)="mover($event)" (pointerleave)="salir()">
          <g class="axis">
            @for (t of grid(); track $index) {
              <line class="gridline" [attr.x1]="m.l" [attr.x2]="w() - m.r" [attr.y1]="t.y" [attr.y2]="t.y" />
              <text [attr.x]="m.l - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.txt }}</text>
            }
            @for (t of ticksX(); track t.i) {
              <text [attr.x]="t.x" [attr.y]="alto() - 8" text-anchor="middle">{{ t.txt }}</text>
            }
          </g>
          @for (s of trazos(); track s.nombre) {
            @if (area() && $first) { @for (a of s.areas; track $index) { <path class="area-fill" [attr.d]="a" [class.is-in]="visto()" /> } }
            @for (seg of s.segs; track $index) {
              <path class="line line--draw" [attr.d]="seg" pathLength="1" [class.is-in]="visto()" [style.stroke]="s.color" />
            }
            @for (p of s.sueltos; track $index) {
              <circle class="lone-dot" r="5" [attr.cx]="p[0]" [attr.cy]="p[1]" [style.fill]="s.color" [class.is-in]="visto()" />
            }
          }
          @if (idx() !== null) {
            <line class="cursor-line" [attr.x1]="x()(idx()!)" [attr.x2]="x()(idx()!)" [attr.y1]="m.t" [attr.y2]="alto() - m.b" />
            @for (p of puntosIdx(); track p.nombre) {
              <circle class="cursor-dot" r="5" [attr.cx]="p.cx" [attr.cy]="p.cy" [style.fill]="p.color" />
            }
          }
          <rect class="bar-hit" [attr.x]="m.l" [attr.y]="m.t" [attr.width]="w() - m.l - m.r" [attr.height]="alto() - m.t - m.b" />
        </svg>
      }
    </div>`,
})
export class LineChart {
  readonly series = input.required<Serie[]>();
  readonly etiquetas = input.required<string[]>();
  /** Texto del eje X para el índice i (null = sin texto) */
  readonly tickX = input<(i: number) => string | null>(i => this.etiquetas()[i]);
  readonly titulo = input<(i: number) => string>(i => this.etiquetas()[i]);
  readonly alto = input(270);
  readonly area = input(false);
  readonly decimales = input(0);
  readonly unidad = input('kWh');
  readonly ariaLabel = input('');

  private readonly tt = inject(Tooltip);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  protected readonly w = anchoDe(this.host);
  protected readonly visto = enVista(this.host);
  protected readonly idx = signal<number | null>(null);
  protected readonly m = { t: 18, r: 14, b: 28, l: 46 };

  private readonly visibles = computed(() => this.series().filter(s => !s.oculta));
  private readonly maximo = computed(() => niceMax(Math.max(1, ...this.visibles().flatMap(s => s.valores.filter((v): v is number => v !== null))) * 1.05));
  protected readonly x = computed(() => {
    const n = this.etiquetas().length, w = this.w();
    return (i: number) => this.m.l + (n <= 1 ? 0 : (i / (n - 1)) * (w - this.m.l - this.m.r));
  });
  private readonly y = computed(() => {
    const max = this.maximo(), h = this.alto();
    return (v: number) => h - this.m.b - (v / max) * (h - this.m.t - this.m.b);
  });
  protected readonly grid = computed(() => {
    const max = this.maximo(), y = this.y();
    const n = divisiones(max);
    return Array.from({ length: n + 1 }, (_, i) => ({ y: y((max / n) * i), txt: fmt((max / n) * i, max < 10 ? 1 : 0) }));
  });
  protected readonly ticksX = computed(() => this.etiquetas().map((_, i) => ({ i, x: this.x()(i), txt: this.tickX()(i) })).filter(t => t.txt));
  protected readonly trazos = computed(() => this.visibles().map(s => {
    const segs: string[] = [];
    const sueltos: [number, number][] = [];
    let cur = '';
    let puntos = 0;
    const areas: string[] = [];
    const base = this.alto() - this.m.b;
    let primero = -1, ultimo = -1;
    const cerrar = () => {
      if (puntos === 1) { const m = /M([\d.-]+),([\d.-]+)/.exec(cur)!; sueltos.push([+m[1], +m[2]]); }
      else if (cur) { segs.push(cur); areas.push(`${cur} L${this.x()(ultimo)},${base} L${this.x()(primero)},${base} Z`); }
      cur = ''; puntos = 0; primero = -1;
    };
    s.valores.forEach((v, i) => {
      if (v === null) { cerrar(); return; }
      if (primero < 0) primero = i;
      ultimo = i;
      cur += `${cur ? 'L' : 'M'}${this.x()(i).toFixed(1)},${this.y()(v).toFixed(1)}`;
      puntos++;
    });
    cerrar();
    return { nombre: s.nombre, color: s.color, segs, sueltos, areas };
  }));
  protected readonly puntosIdx = computed(() => {
    const i = this.idx();
    if (i === null) return [];
    return this.visibles().filter(s => s.valores[i] !== null)
      .map(s => ({ nombre: s.nombre, color: s.color, cx: this.x()(i), cy: this.y()(s.valores[i]!) }));
  });

  protected mover(e: PointerEvent) {
    const svg = e.currentTarget as SVGElement;
    const r = svg.getBoundingClientRect();
    const px = e.clientX - r.left;
    const n = this.etiquetas().length;
    if (px < this.m.l - 4 || px > this.w() - this.m.r + 4) { this.salir(); return; }
    const i = Math.max(0, Math.min(n - 1, Math.round(((px - this.m.l) / (this.w() - this.m.l - this.m.r)) * (n - 1))));
    this.idx.set(i);
    const lineas = this.visibles().filter(s => s.valores[i] !== null)
      .map(s => ({ etiqueta: s.nombre, valor: `${fmt(s.valores[i]!, this.decimales())} ${this.unidad()}`, color: s.color }));
    if (!lineas.length) { this.tt.ocultar(); return; }
    this.tt.mostrar({ titulo: this.titulo()(i), lineas }, e);
  }
  protected salir() { this.idx.set(null); this.tt.ocultar(); }
}
