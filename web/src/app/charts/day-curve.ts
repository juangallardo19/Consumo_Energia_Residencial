import { Component, ElementRef, computed, inject, input } from '@angular/core';
import { divisiones, fmt, niceMax } from '../core/fmt';
import { anchoDe } from '../core/motion';

export interface PuntoHora { hora: number; etiqueta: string; franja: string; kwh: number }

/** Curva horaria que se dibuja hasta la hora marcada por el scroll (progreso 0..1). */
@Component({
  selector: 'app-day-curve',
  template: `
    <div class="chart chart--day" role="img" aria-label="Consumo promedio por hora del día">
      @if (w() > 0) {
        <svg [attr.viewBox]="'0 0 ' + w() + ' ' + h()" [attr.width]="w()" [attr.height]="h()">
          <defs>
            <clipPath id="dayClip"><rect x="0" y="0" [attr.width]="cursor().x + 2" [attr.height]="h()" /></clipPath>
          </defs>
          @for (b of bandas(); track b.nombre; let i = $index) {
            @if (i % 2 === 0) { <rect class="band" [attr.x]="b.x1" [attr.y]="m.t - 18" [attr.width]="b.x2 - b.x1" [attr.height]="h() - m.b - m.t + 18" /> }
            <text class="band-label" [attr.x]="(b.x1 + b.x2) / 2" [attr.y]="m.t - 4" text-anchor="middle">{{ b.nombre }}</text>
          }
          <g class="axis">
            @for (t of grid(); track $index) {
              <line class="gridline" [attr.x1]="m.l" [attr.x2]="w() - m.r" [attr.y1]="t.y" [attr.y2]="t.y" />
              <text [attr.x]="m.l - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.txt }}</text>
            }
            @for (p of perfil(); track p.hora) {
              @if (p.hora % paso() === 0) { <text [attr.x]="xs()(p.hora)" [attr.y]="h() - 8" text-anchor="middle">{{ p.etiqueta }}</text> }
            }
          </g>
          <g clip-path="url(#dayClip)">
            <path class="area" [attr.d]="trazo().area" />
            <path class="line" [attr.d]="trazo().linea" />
          </g>
          <line class="cursor-line" [attr.x1]="cursor().x" [attr.x2]="cursor().x" [attr.y1]="m.t" [attr.y2]="h() - m.b" />
          <circle class="cursor-dot" r="7" [attr.cx]="cursor().x" [attr.cy]="cursor().y" />
        </svg>
      }
    </div>`,
})
export class DayCurve {
  readonly perfil = input.required<PuntoHora[]>();
  readonly progreso = input(0);

  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  protected readonly w = anchoDe(this.host);
  protected readonly h = computed(() => (this.w() < 520 ? 280 : 360));
  protected readonly m = { t: 24, r: 16, b: 30, l: 44 };
  protected readonly paso = computed(() => (this.w() < 520 ? 6 : 3));

  private readonly max = computed(() => niceMax(Math.max(...this.perfil().map(p => p.kwh)) * 1.08));
  protected readonly xs = computed(() => (hr: number) => this.m.l + (hr / 23) * (this.w() - this.m.l - this.m.r));
  private readonly ys = computed(() => (v: number) => this.h() - this.m.b - (v / this.max()) * (this.h() - this.m.t - this.m.b));
  protected readonly grid = computed(() => {
    const n = divisiones(this.max());
    return Array.from({ length: n + 1 }, (_, i) => ({ y: this.ys()((this.max() / n) * i), txt: fmt((this.max() / n) * i, 1) }));
  });

  protected readonly bandas = computed(() => {
    const out: { nombre: string; desde: number; hasta: number; x1: number; x2: number }[] = [];
    for (const p of this.perfil()) {
      const u = out[out.length - 1];
      if (!u || u.nombre !== p.franja) out.push({ nombre: p.franja, desde: p.hora, hasta: p.hora, x1: 0, x2: 0 });
      else u.hasta = p.hora;
    }
    const xs = this.xs();
    out.forEach((b, i) => {
      b.x1 = i === 0 ? this.m.l : (xs(b.desde) + xs(b.desde - 1)) / 2;
      b.x2 = i === out.length - 1 ? this.w() - this.m.r : (xs(b.hasta) + xs(b.hasta + 1)) / 2;
    });
    return out;
  });

  protected readonly trazo = computed(() => {
    const pts = this.perfil().map(p => [this.xs()(p.hora), this.ys()(p.kwh)] as [number, number]);
    let d = `M${pts[0][0]},${pts[0][1]}`;
    // Catmull-Rom → Bézier: curva suave que pasa por cada punto real.
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
    }
    const base = this.h() - this.m.b;
    return { linea: d, area: `${d} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z` };
  });

  /** Valor interpolado en la hora fraccional actual. */
  readonly valorEn = (hr: number) => {
    const p = this.perfil(), i = Math.min(22, Math.floor(hr)), f = hr - i;
    return p[i].kwh + (p[i + 1].kwh - p[i].kwh) * f;
  };

  protected readonly cursor = computed(() => {
    const hr = Math.max(0, Math.min(1, this.progreso())) * 23;
    return { x: this.xs()(hr), y: this.ys()(this.valorEn(hr)) };
  });
}
