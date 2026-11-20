import { Component, Injectable, computed, inject, signal } from '@angular/core';

export interface TipLinea { etiqueta?: string; valor: string; color?: string }
export interface Tip { titulo: string; lineas: TipLinea[] }

/** Un solo tooltip para todas las gráficas. Texto plano (sin innerHTML). */
@Injectable({ providedIn: 'root' })
export class Tooltip {
  readonly tip = signal<Tip | null>(null);
  readonly pos = signal({ x: 0, y: 0 });

  mostrar(tip: Tip, e: PointerEvent | MouseEvent) { this.tip.set(tip); this.mover(e); }
  mover(e: PointerEvent | MouseEvent) { this.pos.set({ x: e.clientX, y: e.clientY }); }
  ocultar() { this.tip.set(null); }
}

@Component({
  selector: 'app-tooltip',
  template: `
    <div class="tooltip" [class.is-on]="!!t.tip()" role="status" aria-live="polite"
         [style.transform]="transform()">
      @if (t.tip(); as tip) {
        <b>{{ tip.titulo }}</b>
        @for (l of tip.lineas; track $index) {
          <span class="tooltip__row">
            @if (l.color) { <i class="tooltip__key" [style.background]="l.color"></i> }
            @if (l.etiqueta) { <span class="tooltip__lbl">{{ l.etiqueta }}</span> }
            <span>{{ l.valor }}</span>
          </span>
        }
      }
    </div>`,
})
export class TooltipView {
  protected readonly t = inject(Tooltip);
  protected readonly transform = computed(() => {
    const { x, y } = this.t.pos();
    const w = 260;
    const izq = typeof window !== 'undefined' && x + w + 24 > window.innerWidth;
    const abajo = y < 150;
    return `translate(${izq ? x - 14 : x + 14}px, ${abajo ? y + 18 : y - 14}px) translate(${izq ? '-100%' : '0'}, ${abajo ? '0' : '-100%'})`;
  });
}
