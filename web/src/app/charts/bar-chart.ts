import { Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { divisiones, fmt, niceMax } from '../core/fmt';
import { anchoDe, enVista } from '../core/motion';
import { Tip, Tooltip } from '../core/tooltip';

export interface Barra {
  key: string | number;
  /** Texto del eje (null = sin etiqueta) */
  tick?: string | null;
  value: number;
  dim?: boolean;
  tip: Tip;
  valueText?: string;
  color?: string;
}

/** Columnas verticales con grilla recesiva, hover por barra y entrada escalonada. */
@Component({
  selector: 'app-bar-chart',
  template: `
    <div class="chart" [style.height.px]="alto()" role="img" [attr.aria-label]="ariaLabel()">
      @if (w() > 0) {
        <svg [attr.viewBox]="'0 0 ' + w() + ' ' + alto()" [attr.width]="w()" [attr.height]="alto()">
          <g class="axis">
            @for (t of grid(); track $index) {
              <line class="gridline" [attr.x1]="m.l" [attr.x2]="w() - m.r" [attr.y1]="t.y" [attr.y2]="t.y" />
              @if (yAxis()) { <text [attr.x]="m.l - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.txt }}</text> }
            }
            @for (b of barras(); track b.key) {
              @if (b.tick) { <text [attr.x]="b.cx" [attr.y]="alto() - 8" text-anchor="middle">{{ b.tick }}</text> }
            }
            @if (referencia() !== null) {
              <line class="refline" [attr.x1]="m.l" [attr.x2]="w() - m.r" [attr.y1]="escala()(referencia()!)" [attr.y2]="escala()(referencia()!)" />
              <text class="refline__txt" [attr.x]="w() - m.r" [attr.y]="escala()(referencia()!) - 6" text-anchor="end">{{ referenciaTxt() }}</text>
            }
          </g>
          @for (b of barras(); track b.key; let i = $index) {
            <rect class="bar" [class.is-dim]="b.dim" [class.is-hover]="hover() === i"
                  [attr.x]="b.x" [attr.width]="b.bw" [attr.y]="b.y" [attr.height]="b.h" [attr.rx]="b.rx"
                  [style.y.px]="b.y" [style.height.px]="b.h" [style.--i]="i" [style.fill]="b.dim || hover() === i ? null : b.color" />
            @if (valueLabels()) {
              <text class="val-label" [attr.x]="b.cx" [attr.y]="b.y - 8" text-anchor="middle" [style.opacity]="b.dim ? .35 : visto() ? 1 : 0">{{ b.valueText }}</text>
            }
          }
          @for (b of barras(); track b.key; let i = $index) {
            <rect class="bar-hit" [attr.x]="b.hx" [attr.y]="m.t" [attr.width]="b.band" [attr.height]="alto() - m.t - m.b"
                  (pointerenter)="entrar(i, $event)" (pointermove)="tt.mover($event)" (pointerleave)="salir()" />
          }
        </svg>
      }
    </div>`,
})
export class BarChart {
  readonly data = input.required<Barra[]>();
  readonly alto = input(270);
  readonly yAxis = input(true);
  readonly valueLabels = input(false);
  readonly gap = input(0.28);
  readonly max = input<number | null>(null);
  readonly ariaLabel = input('');
  readonly fmtEje = input<(v: number) => string>(v => (v >= 1000 ? fmt(v / 1000, v % 1000 ? 1 : 0) + ' mil' : fmt(v, v < 10 && v % 1 ? 1 : 0)));
  readonly referencia = input<number | null>(null);
  readonly referenciaTxt = input('');

  protected readonly tt = inject(Tooltip);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  protected readonly w = anchoDe(this.host);
  protected readonly visto = enVista(this.host);
  protected readonly hover = signal<number | null>(null);

  protected get m() { return { t: 22, r: 8, b: 28, l: this.yAxis() ? 46 : 8 }; }

  private readonly maximo = computed(() => this.max() ?? niceMax(Math.max(1, ...this.data().map(d => d.value), this.referencia() ?? 0) * 1.05));
  protected readonly escala = computed(() => {
    const max = this.maximo(), h = this.alto(), m = this.m;
    return (v: number) => h - m.b - (v / max) * (h - m.t - m.b);
  });
  protected readonly grid = computed(() => {
    const max = this.maximo(), y = this.escala();
    const n = divisiones(max);
    return Array.from({ length: n + 1 }, (_, i) => ({ y: y((max / n) * i), txt: this.fmtEje()((max / n) * i) }));
  });
  protected readonly barras = computed(() => {
    const d = this.data(), w = this.w(), m = this.m, y = this.escala(), base = this.alto() - m.b, vis = this.visto();
    const band = (w - m.l - m.r) / Math.max(1, d.length);
    const gap = Math.max(2, band * this.gap());
    const bw = Math.max(1, band - gap);
    // Si las etiquetas del eje quedan muy juntas (pantallas angostas), se muestran salteadas.
    let ultimaEtiqueta = -Infinity;
    return d.map((b, i) => {
      const x = m.l + i * band + gap / 2;
      const top = vis ? y(Math.max(0, b.value)) : base;
      const cx = x + bw / 2;
      let tick = b.tick ?? null;
      if (tick) { if (cx - ultimaEtiqueta < Math.max(34, tick.length * 7.5)) tick = null; else ultimaEtiqueta = cx; }
      return { ...b, tick, x, bw, cx, hx: m.l + i * band, band, y: top, h: base - top, rx: Math.min(4, bw / 3), valueText: b.valueText ?? fmt(b.value) };
    });
  });

  protected entrar(i: number, e: PointerEvent) { this.hover.set(i); this.tt.mostrar(this.data()[i].tip, e); }
  protected salir() { this.hover.set(null); this.tt.ocultar(); }
}
