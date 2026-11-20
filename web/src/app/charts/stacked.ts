import { Component, ElementRef, computed, inject, input } from '@angular/core';
import { fmt } from '../core/fmt';
import { enVista } from '../core/motion';
import { Tooltip } from '../core/tooltip';

/** Columnas apiladas al 100 %: una columna por categoría, un segmento por serie (con 2 px de separación). */
@Component({
  selector: 'app-stacked',
  template: `
    <div class="legend" aria-hidden="true">
      @for (s of series(); track s; let i = $index) { <span class="legend__item legend__item--static"><i [style.background]="colores()[i]"></i>{{ s }}</span> }
    </div>
    <div class="stack" [class.is-in]="visto()" role="img" [attr.aria-label]="ariaLabel()">
      @for (col of columnas(); track col.nombre; let c = $index) {
        <div class="stack__col">
          <div class="stack__bar" [style.--d]="c * 90 + 'ms'">
            @for (seg of col.segs; track seg.serie) {
              <span class="stack__seg" [style.flex-grow]="seg.pct" [style.background]="seg.color" [class.is-dark]="seg.oscuro"
                    (pointerenter)="tt.mostrar({ titulo: col.nombre + ' · ' + seg.serie, lineas: [{ valor: fmtN(seg.pct, 1) + ' % · ' + fmtN(seg.valor, decimales()) + ' ' + unidad(), color: seg.color }] }, $event)"
                    (pointermove)="tt.mover($event)" (pointerleave)="tt.ocultar()">
                @if (seg.pct >= 8) { {{ fmtN(seg.pct, 0) }} % }
              </span>
            }
          </div>
          <span class="stack__lbl">{{ col.nombre }}</span>
        </div>
      }
    </div>`,
})
export class Stacked {
  readonly categorias = input.required<string[]>();
  readonly series = input.required<string[]>();
  readonly colores = input.required<string[]>();
  /** valores[categoría][serie] */
  readonly valores = input.required<number[][]>();
  readonly unidad = input('kWh');
  readonly decimales = input(0);
  readonly ariaLabel = input('');
  protected readonly tt = inject(Tooltip);
  protected readonly visto = enVista(inject(ElementRef).nativeElement);
  protected readonly fmtN = fmt;
  protected readonly columnas = computed(() => this.categorias().map((nombre, c) => {
    const fila = this.valores()[c];
    const tot = fila.reduce((s, v) => s + v, 0) || 1;
    return {
      nombre,
      segs: fila.map((valor, i) => ({ serie: this.series()[i], valor, pct: (valor / tot) * 100, color: this.colores()[i], oscuro: this.colores()[i] === '#1d1d1f' })).reverse(),
    };
  }));
}
