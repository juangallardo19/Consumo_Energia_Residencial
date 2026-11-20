import { Component, ElementRef, computed, inject, input } from '@angular/core';
import { fmt, mezcla } from '../core/fmt';
import { enVista } from '../core/motion';
import { Tooltip } from '../core/tooltip';

/** Rampa secuencial de un solo tono (azul cielo → azul tinta), de menos a más consumo. */
const CLARO = '#e8f4fa';
const OSCURO = '#15466a';

@Component({
  selector: 'app-heatmap',
  template: `
    <div class="heat" [class.is-in]="visto()" role="img" [attr.aria-label]="ariaLabel()">
      <span></span>
      @for (h of horas; track h) { <span class="heat__h">{{ h % paso() === 0 ? (h < 10 ? '0' + h : h) : '' }}</span> }
      @for (fila of celdas(); track $index; let r = $index) {
        <span class="heat__row"><span class="hl">{{ filas()[r] }}</span><span class="hs">{{ filas()[r].slice(0, 3) }}</span></span>
        @for (c of fila; track $index; let h = $index) {
          <span class="heat__cell" [style.background]="c.color" [style.--d]="(r * 24 + h) * 4 + 'ms'"
                (pointerenter)="tt.mostrar({ titulo: filas()[r] + ', ' + (h < 10 ? '0' + h : h) + ':00', lineas: [{ valor: fmtN(c.v, 3) + ' kWh por hora' }] }, $event)"
                (pointermove)="tt.mover($event)" (pointerleave)="tt.ocultar()"></span>
        }
      }
    </div>
    <div class="heat__legend">
      <span>{{ fmtN(rango().min, 2) }} kWh</span>
      <i [style.background]="'linear-gradient(90deg,' + claro + ',' + oscuro + ')'"></i>
      <span>{{ fmtN(rango().max, 2) }} kWh</span>
    </div>`,
})
export class Heatmap {
  readonly valores = input.required<number[][]>();
  readonly filas = input.required<string[]>();
  readonly ariaLabel = input('');
  readonly paso = input(3);
  protected readonly tt = inject(Tooltip);
  protected readonly visto = enVista(inject(ElementRef).nativeElement);
  protected readonly horas = Array.from({ length: 24 }, (_, i) => i);
  protected readonly fmtN = fmt;
  protected readonly claro = CLARO;
  protected readonly oscuro = OSCURO;
  protected readonly rango = computed(() => {
    const all = this.valores().flat().filter(v => v > 0);
    return { min: Math.min(...all), max: Math.max(...all) };
  });
  protected readonly celdas = computed(() => {
    const { min, max } = this.rango();
    return this.valores().map(f => f.map(v => ({ v, color: mezcla(CLARO, OSCURO, max > min ? (v - min) / (max - min) : 0) })));
  });
}
