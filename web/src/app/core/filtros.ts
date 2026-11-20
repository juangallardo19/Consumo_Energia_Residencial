import { Component, inject, input } from '@angular/core';
import { ANIOS, PBI } from '../data/modelo';
import { Medidas } from './medidas.service';

/** Segmentadores Año y Estación. Todos comparten el mismo estado: filtrar aquí filtra toda la página. */
@Component({
  selector: 'app-filtros',
  template: `
    <div class="filters" role="group" aria-label="Segmentadores del reporte">
      <div class="filters__group">
        <span class="filters__label" [id]="id() + '-a'">Año</span>
        <div class="pills" role="group" [attr.aria-labelledby]="id() + '-a'">
          <button type="button" class="pill" [attr.aria-pressed]="md.anio() === null" (click)="md.anio.set(null)">Todos</button>
          @for (a of anios; track a) {
            <button type="button" class="pill" [attr.aria-pressed]="md.anio() === a" (click)="md.anio.set(a)">{{ a }}</button>
          }
        </div>
      </div>
      @if (conEstacion()) {
        <div class="filters__group">
          <span class="filters__label" [id]="id() + '-s'">Estación</span>
          <div class="pills" role="group" [attr.aria-labelledby]="id() + '-s'">
            <button type="button" class="pill" [attr.aria-pressed]="md.estacion() === null" (click)="md.estacion.set(null)">Todas</button>
            @for (s of estaciones; track s; let i = $index) {
              <button type="button" class="pill" [attr.aria-pressed]="md.estacion() === i" (click)="md.estacion.set(i)">{{ s }}</button>
            }
          </div>
        </div>
      }
      @if (md.hayFiltro()) {
        <button type="button" class="filters__clear" (click)="md.limpiar()">Quitar filtros</button>
      }
    </div>`,
})
export class Filtros {
  readonly id = input('f');
  readonly conEstacion = input(true);
  protected readonly md = inject(Medidas);
  protected readonly anios = ANIOS;
  protected readonly estaciones = PBI.estaciones;
}
