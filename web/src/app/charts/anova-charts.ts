import { Component, ElementRef, computed, inject, input } from '@angular/core';
import { fmt, fmtP, niceMax } from '../core/fmt';
import { anchoDe, enVista } from '../core/motion';
import { Tooltip } from '../core/tooltip';
import { Grupo, ParTukey } from '../data/modelo';

/* ------------------------------------------------------------------ Diagrama de caja */
@Component({
  selector: 'app-boxplot',
  template: `
    <div class="chart" [style.height.px]="alto" role="img" [attr.aria-label]="'Diagrama de caja del consumo diario por ' + factor()">
      @if (w() > 0) {
        <svg [attr.viewBox]="'0 0 ' + w() + ' ' + alto" [attr.width]="w()" [attr.height]="alto">
          <g class="axis">
            @for (t of grid(); track $index) {
              <line class="gridline" [attr.x1]="m.l" [attr.x2]="w() - m.r" [attr.y1]="t.y" [attr.y2]="t.y" />
              <text [attr.x]="m.l - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.txt }}</text>
            }
            <text class="axis__title" [attr.x]="m.l + 4" [attr.y]="m.t - 8">kWh por día</text>
          </g>
          <line class="refline" [attr.x1]="m.l" [attr.x2]="w() - m.r" [attr.y1]="y()(mediaGlobal())" [attr.y2]="y()(mediaGlobal())" />
          @for (b of cajas(); track b.g.grupo; let i = $index) {
            <g class="box" [class.is-in]="visto()" [style.--d]="i * 120 + 'ms'"
               (pointerenter)="mostrar(b.g, $event)" (pointermove)="tt.mover($event)" (pointerleave)="tt.ocultar()">
              <rect class="box__hit" [attr.x]="b.cx - b.bw / 2 - 10" [attr.y]="m.t" [attr.width]="b.bw + 20" [attr.height]="alto - m.t - m.b" />
              <line class="box__whisker" [attr.x1]="b.cx" [attr.x2]="b.cx" [attr.y1]="y()(b.g.max)" [attr.y2]="y()(b.g.q3)" />
              <line class="box__whisker" [attr.x1]="b.cx" [attr.x2]="b.cx" [attr.y1]="y()(b.g.q1)" [attr.y2]="y()(b.g.min)" />
              <line class="box__cap" [attr.x1]="b.cx - b.bw / 4" [attr.x2]="b.cx + b.bw / 4" [attr.y1]="y()(b.g.max)" [attr.y2]="y()(b.g.max)" />
              <line class="box__cap" [attr.x1]="b.cx - b.bw / 4" [attr.x2]="b.cx + b.bw / 4" [attr.y1]="y()(b.g.min)" [attr.y2]="y()(b.g.min)" />
              <rect class="box__body" [attr.x]="b.cx - b.bw / 2" [attr.width]="b.bw" [attr.y]="y()(b.g.q3)" [attr.height]="y()(b.g.q1) - y()(b.g.q3)" rx="6" [style.fill]="b.fondo" />
              <line class="box__median" [attr.x1]="b.cx - b.bw / 2" [attr.x2]="b.cx + b.bw / 2" [attr.y1]="y()(b.g.mediana)" [attr.y2]="y()(b.g.mediana)" />
              @for (o of b.g.atipicos; track $index) { <circle class="box__out" [attr.cx]="b.cx" [attr.cy]="y()(o)" r="3" /> }
              <line class="box__ci" [attr.x1]="b.cx + b.bw / 2 + 12" [attr.x2]="b.cx + b.bw / 2 + 12" [attr.y1]="y()(b.g.ic_inf)" [attr.y2]="y()(b.g.ic_sup)" />
              <circle class="box__mean" [attr.cx]="b.cx + b.bw / 2 + 12" [attr.cy]="y()(b.g.media)" r="5" />
              <text class="box__lbl" [attr.x]="b.cx" [attr.y]="alto - 20" text-anchor="middle">{{ b.g.grupo }}</text>
              <text class="box__n" [attr.x]="b.cx" [attr.y]="alto - 6" text-anchor="middle">n = {{ fmtN(b.g.n) }}</text>
            </g>
          }
        </svg>
      }
    </div>
    <p class="chart-note"><span class="key key--box"></span> caja: cuartiles 25–75 % y mediana · bigotes: 1,5 × RIC · <span class="key key--mean"></span> media con IC 95 % · <span class="key key--ref"></span> media general ({{ fmtN(mediaGlobal(), 1) }} kWh)</p>`,
})
export class BoxPlot {
  readonly grupos = input.required<Grupo[]>();
  readonly fondos = input.required<string[]>();
  readonly factor = input('');
  protected readonly tt = inject(Tooltip);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  protected readonly w = anchoDe(this.host);
  protected readonly visto = enVista(this.host);
  protected readonly alto = 360;
  protected readonly m = { t: 28, r: 12, b: 44, l: 44 };
  protected readonly fmtN = fmt;
  private readonly max = computed(() => niceMax(Math.max(...this.grupos().flatMap(g => [g.max, ...g.atipicos])) * 1.02));
  protected readonly y = computed(() => (v: number) => this.alto - this.m.b - (v / this.max()) * (this.alto - this.m.t - this.m.b));
  protected readonly grid = computed(() => [0, 1, 2, 3, 4].map(i => ({ y: this.y()((this.max() / 4) * i), txt: fmt((this.max() / 4) * i) })));
  protected readonly mediaGlobal = computed(() => {
    const g = this.grupos();
    return g.reduce((s, x) => s + x.media * x.n, 0) / g.reduce((s, x) => s + x.n, 0);
  });
  protected readonly cajas = computed(() => {
    const n = this.grupos().length, band = (this.w() - this.m.l - this.m.r) / n;
    return this.grupos().map((g, i) => ({ g, cx: this.m.l + band * (i + 0.5) - 6, bw: Math.min(70, band * 0.42), fondo: this.fondos()[i] }));
  });
  protected mostrar(g: Grupo, e: PointerEvent) {
    this.tt.mostrar({
      titulo: `${g.grupo} · ${fmt(g.n)} días`,
      lineas: [
        { etiqueta: 'Media', valor: `${fmt(g.media, 2)} kWh (IC 95 %: ${fmt(g.ic_inf, 2)} – ${fmt(g.ic_sup, 2)})` },
        { etiqueta: 'Mediana', valor: `${fmt(g.mediana, 2)} kWh` },
        { etiqueta: 'Q1 – Q3', valor: `${fmt(g.q1, 1)} – ${fmt(g.q3, 1)} kWh` },
        { etiqueta: 'Desv. est.', valor: `${fmt(g.desv, 2)} kWh` },
      ],
    }, e);
  }
}

/* ------------------------------------------------------------------ Intervalos de Tukey HSD */
@Component({
  selector: 'app-tukey',
  template: `
    <div class="chart" [style.height.px]="alto()" role="img" aria-label="Intervalos de confianza de Tukey HSD para cada par de grupos">
      @if (w() > 0) {
        <svg [attr.viewBox]="'0 0 ' + w() + ' ' + alto()" [attr.width]="w()" [attr.height]="alto()">
          <g class="axis">
            @for (t of ticks(); track $index) {
              <line class="gridline" [attr.x1]="t.x" [attr.x2]="t.x" [attr.y1]="m.t" [attr.y2]="alto() - m.b" />
              <text [attr.x]="t.x" [attr.y]="alto() - 10" text-anchor="middle">{{ t.txt }}</text>
            }
          </g>
          <line class="zero" [attr.x1]="x()(0)" [attr.x2]="x()(0)" [attr.y1]="m.t - 6" [attr.y2]="alto() - m.b" />
          <text class="zero__txt" [attr.x]="x()(0)" [attr.y]="m.t - 10" text-anchor="middle">0 = sin diferencia</text>
          @for (p of filas(); track p.lbl; let i = $index) {
            <g class="tk" [class.is-sig]="p.par.significativa" [class.is-in]="visto()" [style.--d]="i * 110 + 'ms'"
               (pointerenter)="mostrar(p.par, $event)" (pointermove)="tt.mover($event)" (pointerleave)="tt.ocultar()">
              <rect class="box__hit" x="0" [attr.y]="p.y - (angosto() ? 30 : 18)" [attr.width]="w()" [attr.height]="angosto() ? 48 : 36" />
              @if (angosto()) {
                <text class="tk__lbl" [attr.x]="m.l" [attr.y]="p.y - 14">{{ p.lbl }}</text>
              } @else {
                <text class="tk__lbl" [attr.x]="m.l - 14" [attr.y]="p.y + 4" text-anchor="end">{{ p.lbl }}</text>
              }
              <line class="tk__ci" [attr.x1]="x()(p.par.ic_inf)" [attr.x2]="x()(p.par.ic_sup)" [attr.y1]="p.y" [attr.y2]="p.y" />
              <line class="tk__cap" [attr.x1]="x()(p.par.ic_inf)" [attr.x2]="x()(p.par.ic_inf)" [attr.y1]="p.y - 6" [attr.y2]="p.y + 6" />
              <line class="tk__cap" [attr.x1]="x()(p.par.ic_sup)" [attr.x2]="x()(p.par.ic_sup)" [attr.y1]="p.y - 6" [attr.y2]="p.y + 6" />
              <circle class="tk__dot" [attr.cx]="x()(p.par.dif)" [attr.cy]="p.y" r="6" />
            </g>
          }
        </svg>
      }
    </div>
    <p class="chart-note"><span class="key key--sig"></span> diferencia significativa (el intervalo no toca el 0) · <span class="key key--nosig"></span> no significativa</p>`,
})
export class TukeyChart {
  readonly pares = input.required<ParTukey[]>();
  protected readonly tt = inject(Tooltip);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  protected readonly w = anchoDe(this.host);
  protected readonly visto = enVista(this.host);
  protected readonly angosto = computed(() => this.w() < 560);
  private readonly fila = computed(() => (this.angosto() ? 62 : 46));
  protected readonly alto = computed(() => 56 + this.pares().length * this.fila());
  protected get m() { return { t: 30, r: 16, b: 32, l: this.angosto() ? 16 : 214 }; }
  private readonly lim = computed(() => {
    const v = Math.max(...this.pares().flatMap(p => [Math.abs(p.ic_inf), Math.abs(p.ic_sup)]));
    return Math.ceil(v / 5) * 5;
  });
  protected readonly x = computed(() => {
    const l = this.m.l;
    return (v: number) => l + ((v + this.lim()) / (2 * this.lim())) * (this.w() - l - this.m.r);
  });
  protected readonly ticks = computed(() => {
    const out = [], lim = this.lim(), paso = lim > 10 ? 5 : lim > 4 ? 2 : 1;
    for (let v = -lim; v <= lim; v += paso) out.push({ x: this.x()(v), txt: (v > 0 ? '+' : '') + fmt(v) });
    return out;
  });
  protected readonly filas = computed(() => this.pares().map((par, i) => ({ par, lbl: `${par.a} − ${par.b}`, y: this.m.t + (this.angosto() ? 36 : 22) + i * this.fila() })));
  protected mostrar(p: ParTukey, e: PointerEvent) {
    this.tt.mostrar({
      titulo: `${p.a} − ${p.b}`,
      lineas: [
        { etiqueta: 'Diferencia', valor: `${p.dif > 0 ? '+' : ''}${fmt(p.dif, 2)} kWh/día` },
        { etiqueta: 'IC 95 %', valor: `${fmt(p.ic_inf, 2)} a ${fmt(p.ic_sup, 2)}` },
        { etiqueta: 'p ajustado', valor: fmtP(p.p) },
        { valor: p.significativa ? 'Diferencia significativa' : 'No significativa' },
      ],
    }, e);
  }
}

/* ------------------------------------------------------------------ Distribución F */
function lnGamma(z: number): number {
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
export function fPdf(x: number, d1: number, d2: number): number {
  if (x <= 0) return 0;
  const lb = lnGamma(d1 / 2) + lnGamma(d2 / 2) - lnGamma((d1 + d2) / 2);
  return Math.exp(0.5 * (d1 * Math.log(d1 * x) + d2 * Math.log(d2) - (d1 + d2) * Math.log(d1 * x + d2)) - Math.log(x) - lb);
}

@Component({
  selector: 'app-fdist',
  template: `
    <div class="chart" [style.height.px]="alto" role="img"
         [attr.aria-label]="'Distribución F con ' + gl1() + ' y ' + gl2() + ' grados de libertad; valor crítico ' + fmtN(fcrit(), 2) + ', F observado ' + fmtN(fobs(), 2)">
      @if (w() > 0) {
        <svg [attr.viewBox]="'0 0 ' + w() + ' ' + alto" [attr.width]="w()" [attr.height]="alto">
          <g class="axis">
            @for (t of ticks(); track $index) { <text [attr.x]="t.x" [attr.y]="alto - 8" text-anchor="middle">{{ t.txt }}</text> }
            <line class="gridline" [attr.x1]="m.l" [attr.x2]="w() - m.r" [attr.y1]="alto - m.b" [attr.y2]="alto - m.b" />
          </g>
          <path class="f__reject" [attr.d]="curva().rechazo" />
          <path class="f__curve" [class.is-in]="visto()" [attr.d]="curva().linea" pathLength="1" />
          <line class="f__crit" [attr.x1]="x()(fcrit())" [attr.x2]="x()(fcrit())" [attr.y1]="m.t + 18" [attr.y2]="alto - m.b" />
          <text class="f__txt" [attr.x]="x()(fcrit()) + 6" [attr.y]="m.t + 28">F crítico = {{ fmtN(fcrit(), 2) }}</text>
          <text class="f__txt f__txt--muted" [attr.x]="x()(fcrit()) + 6" [attr.y]="m.t + 44">zona de rechazo (α = 0,05)</text>
          @if (fueraDeRango()) {
            <g class="f__obs" [class.is-in]="visto()">
              <line [attr.x1]="w() - m.r - 112" [attr.x2]="w() - m.r - 4" [attr.y1]="m.t + 82" [attr.y2]="m.t + 82" />
              <path [attr.d]="'M' + (w() - m.r - 12) + ',' + (m.t + 76) + ' l9,6 l-9,6'" />
              <text [attr.x]="w() - m.r" [attr.y]="m.t + 70" text-anchor="end">F observado = {{ fmtN(fobs(), 2) }}</text>
            </g>
          } @else {
            <g class="f__obs" [class.is-in]="visto()">
              <line [attr.x1]="x()(fobs())" [attr.x2]="x()(fobs())" [attr.y1]="m.t + 60" [attr.y2]="alto - m.b" />
              <text [attr.x]="x()(fobs())" [attr.y]="m.t + 54" text-anchor="middle">F observado = {{ fmtN(fobs(), 2) }}</text>
            </g>
          }
        </svg>
      }
    </div>`,
})
export class FDist {
  readonly gl1 = input.required<number>();
  readonly gl2 = input.required<number>();
  readonly fcrit = input.required<number>();
  readonly fobs = input.required<number>();
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  protected readonly w = anchoDe(this.host);
  protected readonly visto = enVista(this.host);
  protected readonly alto = 220;
  protected readonly m = { t: 10, r: 14, b: 26, l: 14 };
  protected readonly fmtN = fmt;
  private readonly xmax = computed(() => Math.max(6, Math.ceil(this.fcrit() * 2.6)));
  protected readonly fueraDeRango = computed(() => this.fobs() > this.xmax() * 0.92);
  protected readonly x = computed(() => (v: number) => this.m.l + (v / this.xmax()) * (this.w() - this.m.l - this.m.r));
  protected readonly ticks = computed(() => Array.from({ length: this.xmax() + 1 }, (_, i) => ({ x: this.x()(i), txt: fmt(i) })));
  protected readonly curva = computed(() => {
    const pts: [number, number][] = [];
    for (let i = 1; i <= 240; i++) { const v = (i / 240) * this.xmax(); pts.push([v, fPdf(v, this.gl1(), this.gl2())]); }
    const ymax = Math.max(...pts.map(p => p[1])) * 1.1;
    const y = (d: number) => this.alto - this.m.b - (d / ymax) * (this.alto - this.m.t - this.m.b - 10);
    const linea = pts.map((p, i) => `${i ? 'L' : 'M'}${this.x()(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('');
    const cola = pts.filter(p => p[0] >= this.fcrit());
    const base = this.alto - this.m.b;
    const rechazo = cola.length ? `M${this.x()(this.fcrit())},${base} ` + cola.map(p => `L${this.x()(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join('') + ` L${this.x()(this.xmax())},${base} Z` : '';
    return { linea, rechazo };
  });
}
