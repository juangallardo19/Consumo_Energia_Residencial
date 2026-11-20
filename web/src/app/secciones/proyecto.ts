import { Component, inject } from '@angular/core';
import { fmt } from '../core/fmt';
import { Motion, Parallax, Reveal, Split, Stagger } from '../core/motion';
import { PBI } from '../data/modelo';

const k = PBI.kpis;
const dias = PBI.dias;
const media = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const porTipo = [0, 1, 2].map(t => media(dias.filter(d => d[2] === t).map(d => d[3])));
const porEst = [0, 1, 2, 3].map(s => media(dias.filter(d => d[1] === s).map(d => d[3])));
const porCat = [0, 1, 2].map(c => media(dias.filter(d => d[6] === c).map(d => d[3])));
const perfil = Array.from({ length: 24 }, (_, h) => {
  const c = PBI.horas.filter(x => x[3] === h);
  return c.reduce((s, x) => s + x[4], 0) / c.reduce((s, x) => s + x[5], 0);
});
const pico = perfil.indexOf(Math.max(...perfil));
const anios = [...new Set(PBI.meses.map(m => m.a))].map(a => ({ a, e: PBI.meses.filter(m => m.a === a).reduce((s, m) => s + m.e, 0), n: PBI.meses.filter(m => m.a === a).length }));
const anioTop = anios.filter(x => x.n === 12).sort((a, b) => b.e - a.e)[0];
const zonas = [0, 1, 2, 3].map(i => PBI.meses.reduce((s, m) => s + m.z[i], 0));
const zTot = zonas.reduce((a, b) => a + b, 0);

/** Explicación del proyecto y sus 10 requerimientos analíticos, con la respuesta corta de cada uno. */
@Component({
  selector: 'app-proyecto',
  imports: [Reveal, Split, Stagger, Parallax],
  template: `
    <section class="section" id="proyecto">
      <span class="deco deco--num" aria-hidden="true" [appParallax]="0.35">10</span>
      <div class="container">
        <div class="section__head">
          <p class="eyebrow">Proyecto 5 · Ingeniería de Datasets</p>
          <h2 class="h2" appSplit>Análisis de consumo de energía eléctrica residencial.</h2>
        </div>

        <div class="intro">
          <article class="card intro__card" appReveal>
            <span class="tag">Objetivo</span>
            <p class="intro__big">Extraer y analizar patrones de consumo eléctrico residencial para identificar <mark>oportunidades de ahorro energético</mark>.</p>
          </article>
          <article class="card intro__card" appReveal="0.08">
            <span class="tag">Origen del dataset</span>
            <p>El enunciado propone el dataset <a class="link" href="https://www.kaggle.com/datasets/uciml/individual-household-electric-power-consumption" target="_blank" rel="noopener">Individual Household Electric Power Consumption de Kaggle</a>, una copia del repositorio de UCI. Ese enlace ya no existe, así que usamos la fuente original de <a class="link" href="https://archive.ics.uci.edu/dataset/235/individual+household+electric+power+consumption" target="_blank" rel="noopener">UCI</a> (mismo archivo, 2.075.259 filas) con aprobación del profesor.</p>
            <p>Por indicación del profesor lo complementamos con 3 fuentes más: clima horario (Meteostat), festivos de Francia y tarifas eléctricas de Eurostat.</p>
          </article>
          <article class="card intro__card intro__card--ink" appReveal="0.16">
            <span class="tag tag--light">De dónde salen los números</span>
            <p>Esta página toma los datos <b>del modelo del informe de Power BI</b> (<code>{{ fuente }}</code>, publicado en Power BI Service): las mismas {{ horas }} filas horarias y las mismas medidas DAX del dashboard, recalculadas en el navegador cuando filtras.</p>
            <button type="button" class="btn btn--sm btn--line-light" (click)="motion.irA('#dashboard')">Ver el reporte publicado</button>
          </article>
        </div>

        <div class="req__head">
          <h3 class="h3">Requerimientos analíticos</h3>
          <p class="section__note">Cada tarjeta resume la respuesta que da el modelo; haz clic para ir a la sección donde se analiza.</p>
        </div>
        <ol class="reqs" appStagger=".req" [staggerBase]="20" [staggerPaso]="6">
          @for (r of reqs; track r.n) {
            <li class="req" [style.--c]="r.fondo">
              <button type="button" class="req__btn" (click)="motion.irA(r.ir)" [attr.aria-label]="'Requerimiento ' + r.n + ': ' + r.titulo + '. Ir a la sección'">
                <span class="req__n">{{ r.n }}</span>
                <span class="req__title">{{ r.titulo }}</span>
                <span class="req__ans">{{ r.respuesta }}</span>
                <span class="req__go" aria-hidden="true">Ver análisis →</span>
              </button>
            </li>
          }
        </ol>
      </div>
    </section>`,
})
export class Proyecto {
  protected readonly motion = inject(Motion);
  protected readonly fuente = PBI.meta.fuente;
  protected readonly horas = fmt(k.horas_medidas);
  protected readonly reqs = [
    { n: 1, titulo: 'Consumo total por día, mes y año', ir: '#resumen', fondo: 'var(--yellow)',
      respuesta: `${fmt(k.energia_kwh)} kWh en ${fmt(k.dias_medidos)} días; el año completo con más consumo fue ${anioTop.a} (${fmt(anioTop.e)} kWh).` },
    { n: 2, titulo: 'Horas pico de consumo', ir: '#dia', fondo: 'var(--peach)',
      respuesta: `El pico llega a las ${String(pico).padStart(2, '0')}:00 con ${fmt(perfil[pico], 2)} kWh, ${fmt(perfil[pico] / Math.min(...perfil), 1)} veces la hora más baja.` },
    { n: 3, titulo: 'Laborables vs fines de semana', ir: '#patrones', fondo: 'var(--lilac)',
      respuesta: `Un día de fin de semana consume ${fmt((porTipo[1] / porTipo[0] - 1) * 100)} % más que uno laborable (${fmt(porTipo[1], 1)} vs ${fmt(porTipo[0], 1)} kWh).` },
    { n: 4, titulo: 'Detección de eventos inusuales', ir: '#eventos', fondo: 'var(--sky)',
      respuesta: `${fmt(k.horas_inusuales)} horas superan el umbral de ${fmt(k.umbral_inusual_kwh, 2)} kWh (media + 2 desviaciones).` },
    { n: 5, titulo: 'Proporción por electrodoméstico', ir: '#zonas', fondo: 'var(--mint)',
      respuesta: `Calentador y aire acondicionado: ${fmt((zonas[2] / zTot) * 100, 1)} %. Lo no submedido: ${fmt((zonas[3] / zTot) * 100, 1)} %.` },
    { n: 6, titulo: 'Comparativa invierno vs verano', ir: '#clima', fondo: 'var(--sky)',
      respuesta: `Invierno ${fmt(porEst[0], 1)} kWh/día contra ${fmt(porEst[2], 1)} en verano: ${fmt((porEst[0] / porEst[2] - 1) * 100)} % más.` },
    { n: 7, titulo: 'Tendencias estacionales', ir: '#tendencia', fondo: 'var(--peach)',
      respuesta: `El patrón se repite cada año; los días fríos consumen ${fmt((porCat[0] / porCat[2] - 1) * 100)} % más que los cálidos.` },
    { n: 8, titulo: 'Promedio de consumo por hora', ir: '#dia', fondo: 'var(--yellow)',
      respuesta: `${fmt(k.promedio_hora_kwh, 2)} kWh por hora en promedio; de madrugada baja a ${fmt(Math.min(...perfil), 2)} kWh.` },
    { n: 9, titulo: 'Clasificación de días por nivel', ir: '#clasificacion', fondo: 'var(--lilac)',
      respuesta: `Bajo, medio o alto según los percentiles 33 y 66 del consumo diario (columna calculada en DAX).` },
    { n: 10, titulo: 'Costo energético mensual', ir: '#costo', fondo: 'var(--mint)',
      respuesta: `€ ${fmt(k.costo_eur / PBI.meses.length, 2)} al mes en promedio; € ${fmt(k.costo_eur)} en total con la tarifa de Eurostat.` },
  ];
}
