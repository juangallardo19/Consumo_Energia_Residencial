import { Component, afterNextRender, inject } from '@angular/core';
import { Motion } from './core/motion';
import { TooltipView } from './core/tooltip';
import { Anova } from './secciones/anova';
import { Dashboard, Nav, Pipeline } from './secciones/cierre';
import { Clima, Costo, Zonas } from './secciones/consumo';
import { Eventos } from './secciones/eventos';
import { Hero } from './secciones/hero';
import { Dia, Patrones } from './secciones/horario';
import { Proyecto } from './secciones/proyecto';
import { Cifras, Resumen } from './secciones/resumen';

@Component({
  selector: 'app-root',
  imports: [Nav, Hero, Proyecto, Cifras, Resumen, Dia, Patrones, Eventos, Zonas, Clima, Costo, Anova, Pipeline, Dashboard, TooltipView],
  template: `
    <a class="skip" href="#proyecto">Saltar al contenido</a>
    <app-nav />
    <main>
      <app-hero />
      <app-proyecto />
      <app-cifras />
      <app-resumen />
      <app-dia />
      <app-patrones />
      <app-eventos />
      <app-zonas />
      <app-clima />
      <app-costo />
      <app-anova />
      <app-pipeline />
      <app-dashboard />
    </main>
    <app-tooltip />`,
})
export class App {
  constructor() {
    const motion = inject(Motion);
    afterNextRender(() => {
      motion.iniciar();
      // Las fuentes web cambian la altura de los títulos: recalcula los disparadores del scroll al cargarlas.
      document.fonts?.ready.then(() => motion.refrescar());
      window.addEventListener('load', () => motion.refrescar(), { once: true });
    });
  }
}
