import { Component, ElementRef, computed, inject, input } from '@angular/core';
import { fmt } from '../core/fmt';
import { CountUp, enVista } from '../core/motion';
import { Tooltip } from '../core/tooltip';

export interface FilaH { nombre: string; sub: string; valor: number; fondo: string; dim?: boolean }

/** Barras horizontales con nombre, barra rellena y valor (estilo de las tarjetas de clima). */
@Component({
  selector: 'app-hbars',
  imports: [CountUp],
  template: `
    @for (f of filas(); track f.nombre; let i = $index) {
      <div class="hrow" [class.is-dim]="f.dim"
           (pointerenter)="tt.mostrar({ titulo: f.nombre, lineas: [{ valor: fmtN(f.valor, 2) + ' ' + unidad() }, { valor: f.sub }] }, $event)"
           (pointermove)="tt.mover($event)" (pointerleave)="tt.ocultar()">
        <span class="hrow__name">{{ f.nombre }}<small>{{ f.sub }}</small></span>
        <span class="hrow__track"><span class="hrow__fill" [style.background]="f.fondo"
              [style.transform]="'scaleX(' + (visto() ? f.valor / maximo() : 0) + ')'" [style.transition-delay]="i * 80 + 'ms'"></span></span>
        <span class="hrow__val" [appCount]="f.valor" [decimales]="decimales()"></span>
      </div>
    }`,
})
export class HBars {
  readonly filas = input.required<FilaH[]>();
  readonly max = input<number | null>(null);
  readonly unidad = input('kWh por día');
  readonly decimales = input(1);
  protected readonly tt = inject(Tooltip);
  protected readonly visto = enVista(inject(ElementRef).nativeElement);
  protected readonly fmtN = fmt;
  protected readonly maximo = computed(() => this.max() ?? Math.max(...this.filas().map(f => f.valor)) * 1.1);
}
