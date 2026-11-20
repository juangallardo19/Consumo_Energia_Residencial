import { Component, ElementRef, computed, inject, input } from '@angular/core';
import { fmt } from '../core/fmt';
import { enVista } from '../core/motion';
import { Tooltip } from '../core/tooltip';

export interface Porcion { nombre: string; valor: number; pct: number; color: string }

@Component({
  selector: 'app-donut',
  template: `
    <svg class="donut" viewBox="0 0 220 220" role="img" [attr.aria-label]="ariaLabel()">
      <circle cx="110" cy="110" [attr.r]="r" stroke="rgba(29,29,31,.08)" />
      @for (s of segs(); track s.nombre) {
        <circle class="donut__seg" cx="110" cy="110" [attr.r]="r" [attr.stroke]="s.color"
                [style.stroke-dasharray]="(visto() ? s.len : 0) + ' ' + c" [style.stroke-dashoffset]="-s.off"
                [style.transition-delay]="$index * 0.15 + 's'"
                (pointerenter)="tt.mostrar({ titulo: s.nombre, lineas: [{ valor: fmtN(s.valor) + ' kWh · ' + fmtN(s.pct, 1) + ' %', color: s.color }] }, $event)"
                (pointermove)="tt.mover($event)" (pointerleave)="tt.ocultar()" />
      }
    </svg>`,
})
export class Donut {
  readonly porciones = input.required<Porcion[]>();
  readonly ariaLabel = input('');
  protected readonly tt = inject(Tooltip);
  protected readonly visto = enVista(inject(ElementRef).nativeElement);
  protected readonly r = 84;
  protected readonly c = 2 * Math.PI * 84;
  protected readonly fmtN = fmt;
  protected readonly segs = computed(() => {
    let acc = 0;
    return this.porciones().map(p => {
      const len = (p.pct / 100) * this.c;
      const s = { ...p, len: Math.max(0, len - 3), off: acc };
      acc += len;
      return s;
    });
  });
}
