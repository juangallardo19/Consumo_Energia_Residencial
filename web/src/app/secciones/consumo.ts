import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { BarChart, Barra } from '../charts/bar-chart';
import { Donut } from '../charts/donut';
import { FilaH, HBars } from '../charts/hbars';
import { LineChart, Serie } from '../charts/line-chart';
import { Scatter, PuntoXY } from '../charts/scatter';
import { Stacked } from '../charts/stacked';
import { Filtros } from '../core/filtros';
import { fmt } from '../core/fmt';
import { Medidas } from '../core/medidas.service';
import { CountUp, Parallax, Reveal, Split, Stagger, enVista } from '../core/motion';
import { Tooltip } from '../core/tooltip';
import { ANIOS, COLOR_ANIO, COLOR_ESTACION, COLOR_ZONA, FONDO_ESTACION, FONDO_ZONA, MESES_CORTOS, MESES_LARGOS, PBI } from '../data/modelo';

/* ================================================================ Zonas (req. 5) */
@Component({
  selector: 'app-zonas',
  imports: [Filtros, Donut, Stacked, CountUp, Split, Stagger, Parallax],
  template: `
    <section class="section" id="zonas">
      <div class="container">
        <div class="section__head">
          <p class="eyebrow">Req. 5 · Proporción por electrodoméstico</p>
          <h2 class="h2" appSplit>La mitad de la energía no tiene submedidor.</h2>
          <p class="section__note section__note--below">Los 3 submedidores del dataset UCI cubren cocina, lavandería y calentador + aire acondicionado. El resto se calcula en el ETL como total − submedidores.</p>
        </div>
        <app-filtros id="f-zonas" />
        <div class="zonas">
          <div class="donut-wrap" [appParallax]="0.06">
            <app-donut [porciones]="porciones()" ariaLabel="Distribución del consumo por zona" />
            <div class="donut__center">
              <span class="donut__big" [appCount]="totalZonas()"></span>
              <span>kWh {{ md.hayFiltro() ? 'filtrados' : 'totales' }}</span>
            </div>
          </div>
          <div class="zona-cards" appStagger=".zcard" [staggerBase]="30" [staggerPaso]="22">
            @for (z of md.zonas(); track z.id; let i = $index) {
              <article class="zcard" [style.--c]="fondos[i]">
                <div class="zcard__top"><span class="tag">{{ etiquetas[i] }}</span>
                  <span class="zcard__pct"><span [appCount]="z.pct" [decimales]="1"></span>%</span></div>
                <h3>{{ z.zona }}</h3>
                <p>{{ z.equipos }}</p>
                <div class="progress"><span>Energía</span><span>{{ fmtN(z.kwh) }} kWh</span></div>
                <div class="progress__track"><div class="progress__fill progress__fill--on" [style.transform]="'scaleX(' + z.pct / 100 + ')'"></div></div>
              </article>
            }
          </div>
        </div>
        <div class="card zonas__stack">
          <h3 class="h3">¿Cambia el reparto del consumo según la estación?</h3>
          <app-stacked [categorias]="estaciones" [series]="nombresZona" [colores]="colZona" [valores]="md.zonasPorEstacion()"
                       ariaLabel="Proporción del consumo por zona en cada estación" />
          <p class="card__foot">{{ lecturaEstacion() }}</p>
        </div>
      </div>
    </section>`,
})
export class Zonas {
  protected readonly md = inject(Medidas);
  protected readonly fmtN = fmt;
  protected readonly fondos = FONDO_ZONA;
  protected readonly etiquetas = ['Submedidor 1', 'Submedidor 2', 'Submedidor 3', 'Calculado'];
  protected readonly estaciones = PBI.estaciones;
  protected readonly nombresZona = PBI.zonas.map(z => z.zona);
  protected readonly colZona = COLOR_ZONA;
  protected readonly porciones = computed(() => this.md.zonas().map((z, i) => ({ nombre: z.zona, valor: z.kwh, pct: z.pct, color: COLOR_ZONA[i] })));
  protected readonly totalZonas = computed(() => this.md.zonas().reduce((s, z) => s + z.kwh, 0));
  /** Lectura del gráfico 100 %: qué zona gana peso en invierno y cuál en verano. */
  protected readonly lecturaEstacion = computed(() => {
    const filas = this.md.zonasPorEstacion();
    const dias = this.md.porEstacion().map(e => e.dias || 1);
    const pct = filas.map(f => { const t = f.reduce((a, b) => a + b, 0) || 1; return f.map(v => (v / t) * 100); });
    const dia = (s: number, z: number) => filas[s][z] / dias[s];
    return `En invierno crece sobre todo lo que no tiene submedidor: ${fmt(dia(0, 3), 1)} kWh al día contra ${fmt(dia(2, 3), 1)} en verano `
      + `(${fmt(pct[0][3], 0)} % del total frente a ${fmt(pct[2][3], 0)} %), probablemente calefacción de los cuartos y más horas de luz artificial. `
      + `El calentador y el aire acondicionado también suben (${fmt(dia(0, 2), 1)} contra ${fmt(dia(2, 2), 1)} kWh al día), pero menos, por eso su porcentaje baja en invierno.`;
  });
}

/* ================================================================ Clima y estaciones (req. 6 y 7) */
@Component({
  selector: 'app-clima',
  imports: [Filtros, HBars, Scatter, LineChart, CountUp, Split, Stagger, Reveal],
  template: `
    <section class="section" id="clima">
      <div class="container">
        <div class="section__head">
          <p class="eyebrow">Req. 6 · Invierno contra verano</p>
          <h2 class="h2" appSplit>En invierno la casa gasta casi el doble.</h2>
        </div>
        <app-filtros id="f-clima" />
        <div class="gauges" appStagger=".gauge">
          @for (g of gauges(); track g.nombre; let i = $index) {
            <div class="gauge" [style.--c]="g.fondo" [class.is-dim]="g.dim"
                 (pointerenter)="tt.mostrar({ titulo: g.nombre, lineas: [{ valor: fmtN(g.kwh, 2) + ' kWh por día en promedio' }, { valor: fmtN(g.dias) + ' días con medición' }] }, $event)"
                 (pointermove)="tt.mover($event)" (pointerleave)="tt.ocultar()">
              <div class="gauge__dial">
                <svg viewBox="0 0 180 160" aria-hidden="true">
                  <path class="gauge__track" [attr.d]="arco" />
                  <path class="gauge__arc" [attr.d]="arco" [style.stroke-dasharray]="largo" [style.stroke-dashoffset]="visto() ? largo * (1 - g.frac) : largo" [style.transition-delay]="i * 100 + 'ms'" />
                </svg>
                <div class="gauge__read"><span class="gauge__val" [appCount]="g.kwh" [decimales]="1"></span><span class="gauge__unit">kWh por día</span></div>
              </div>
              <span class="tag">{{ g.nombre }}</span>
            </div>
          }
        </div>
        <p class="clima__lead" appReveal>Un día de invierno consume <b>{{ fmtN(difInvVer(), 0) }} % más</b> que uno de verano. Los medidores muestran siempre las cuatro estaciones (el filtro de estación resalta una); los demás gráficos de esta sección sí se filtran por año y estación.</p>

        <div class="clima__grid" appStagger=".card" [staggerBase]="16" [staggerPaso]="30">
          <div class="card">
            <h3 class="h3">Consumo diario según la temperatura del día</h3>
            <app-hbars [filas]="termica()" [max]="maxTermica()" />
            <p class="card__foot">Promedio de kWh por día según la temperatura media de la estación París-Montsouris. Los días fríos consumen {{ fmtN(difFrioCalido(), 0) }} % más que los cálidos.</p>
          </div>
          <div class="card">
            <h3 class="h3">A menor temperatura, mayor consumo</h3>
            <app-scatter [datos]="puntos()" [grupos]="estaciones" [colores]="colEst" ariaLabel="Dispersión de la temperatura media del día contra la energía consumida ese día" />
          </div>
        </div>

        <div class="card tendencia" id="tendencia" appReveal>
          <div class="tendencia__head">
            <div>
              <p class="eyebrow">Req. 7 · Tendencias estacionales</p>
              <h3 class="h3">El mismo patrón se repite cada año</h3>
            </div>
            <div class="legend" role="group" aria-label="Mostrar u ocultar años">
              @for (a of anios; track a) {
                <button type="button" class="legend__item" [attr.aria-pressed]="!ocultos().has(a)" (click)="alternar(a)"><i [style.background]="colAnio[a]"></i>{{ a }}</button>
              }
            </div>
          </div>
          <app-line-chart [series]="seriesAnio()" [etiquetas]="mesesCortos" [titulo]="tituloMes" ariaLabel="Energía por mes del año, una línea por año" />
          <p class="card__foot">Energía total de cada mes (kWh). Todos los años bajan en verano y suben en invierno: julio o agosto es siempre el mes más bajo (vacaciones de verano en Francia).</p>
        </div>
      </div>
    </section>`,
})
export class Clima {
  protected readonly md = inject(Medidas);
  protected readonly visto = enVista(inject(ElementRef).nativeElement, '0px 0px -30% 0px');
  protected readonly tt = inject(Tooltip);
  protected readonly fmtN = fmt;
  protected readonly estaciones = PBI.estaciones;
  protected readonly colEst = COLOR_ESTACION;
  protected readonly colAnio = COLOR_ANIO;
  protected readonly anios = ANIOS;
  protected readonly mesesCortos = MESES_CORTOS;
  protected readonly tituloMes = (i: number) => MESES_LARGOS[i][0].toUpperCase() + MESES_LARGOS[i].slice(1);
  protected readonly ocultos = signal(new Set<number>());
  protected readonly largo = (Math.PI * 2 * 70 * 270) / 360;
  protected readonly arco = (() => {
    const r = 70, cx = 90, cy = 90, a0 = (135 * Math.PI) / 180, a1 = a0 + (270 * Math.PI) / 180;
    return `M${cx + r * Math.cos(a0)},${cy + r * Math.sin(a0)} A${r},${r} 0 1 1 ${cx + r * Math.cos(a1)},${cy + r * Math.sin(a1)}`;
  })();

  protected readonly gauges = computed(() => this.md.porEstacion().map((e, i) => ({
    nombre: PBI.estaciones[i], kwh: e.kwh, dias: e.dias, frac: Math.min(1, e.kwh / 40), fondo: FONDO_ESTACION[i],
    dim: this.md.estacion() !== null && this.md.estacion() !== i,
  })));
  protected readonly difInvVer = computed(() => { const e = this.md.porEstacion(); return e[2].kwh ? (e[0].kwh / e[2].kwh - 1) * 100 : 0; });

  private readonly fondosCat = ['var(--sky)', 'var(--mint)', 'var(--peach)'];
  protected readonly termica = computed<FilaH[]>(() => this.md.porCategoria().map((c, i) => ({
    nombre: PBI.categorias[i], sub: `${fmt(c.temp, 1)} °C, ${fmt(c.dias)} días`, valor: c.kwh, fondo: this.fondosCat[i],
  })));
  protected readonly maxTermica = computed(() => Math.max(...this.md.porCategoria().map(c => c.kwh)) * 1.12);
  protected readonly difFrioCalido = computed(() => { const c = this.md.porCategoria(); return c[2].kwh ? (c[0].kwh / c[2].kwh - 1) * 100 : 0; });

  protected readonly puntos = computed<PuntoXY[]>(() => this.md.dias().filter(d => d[5] !== null).map(d => ({ x: d[5]!, y: d[3], grupo: d[1], fecha: d[0] })));

  protected readonly seriesAnio = computed<Serie[]>(() => this.md.mesPorAnio().map(s => ({
    nombre: String(s.anio), color: COLOR_ANIO[s.anio], valores: s.valores,
    oculta: this.ocultos().has(s.anio) || (this.md.anio() !== null && this.md.anio() !== s.anio),
  })));
  protected alternar(a: number) {
    const s = new Set(this.ocultos());
    if (s.has(a)) s.delete(a); else if (s.size < ANIOS.length - 1) s.add(a);
    this.ocultos.set(s);
  }
}

/* ================================================================ Costo (req. 10) */
@Component({
  selector: 'app-costo',
  imports: [Filtros, BarChart, CountUp, Split, Reveal],
  template: `
    <section class="section" id="costo">
      <div class="container">
        <div class="section__head section__head--row">
          <div>
            <p class="eyebrow">Req. 10 · Estimación del costo energético mensual</p>
            <h2 class="h2" appSplit>Lo que cuesta cada mes.</h2>
          </div>
          <p class="section__note">Cada hora se multiplica por el precio del kWh de su semestre (Eurostat, hogares de Francia, con impuestos): <code>SUMX(Fact_Consumo_Hora, Energía × RELATED(Precio))</code>.</p>
        </div>
        <div class="board" appReveal>
          <app-filtros id="f-costo" />
          <div class="kpis kpis--3">
            <article class="kpi" style="--c:var(--lilac)">
              <span class="tag">Costo total</span>
              <span class="kpi__value"><small>€</small><span [appCount]="k().costo" [decimales]="2"></span></span>
              <span class="kpi__sub">{{ md.alcance() }}</span>
            </article>
            <article class="kpi" style="--c:var(--yellow)">
              <span class="tag">Costo promedio al mes</span>
              <span class="kpi__value"><small>€</small><span [appCount]="k().costoMes" [decimales]="2"></span></span>
              <span class="kpi__sub">{{ k().meses }} meses con medición</span>
            </article>
            <article class="kpi" style="--c:var(--mint)">
              <span class="tag">Precio medio pagado</span>
              <span class="kpi__value"><small>€</small><span [appCount]="k().energia ? k().costo / k().energia : 0" [decimales]="4"></span></span>
              <span class="kpi__sub">por kWh consumido</span>
            </article>
          </div>
          <div class="charts-grid">
            <figure class="chart-card">
              <figcaption><span class="chart-title">¿Cuánto cuesta la energía cada mes? (€)</span><span class="chart-legend">mes más caro: {{ masCaro().txt }}</span></figcaption>
              <app-bar-chart [data]="barras()" [gap]="0.3" [referencia]="k().costoMes" [referenciaTxt]="'promedio € ' + fmtN(k().costoMes, 2)"
                             [fmtEje]="fmtEuro" ariaLabel="Costo de la energía por mes en euros" />
            </figure>
            <figure class="chart-card table-card">
              <figcaption><span class="chart-title">Precio del kWh por semestre</span></figcaption>
              <div class="table-wrap">
                <table class="table table--compact">
                  <thead><tr><th scope="col">Semestre</th><th scope="col" class="num">Sin impuestos</th><th scope="col" class="num">Con impuestos</th></tr></thead>
                  <tbody>
                    @for (t of tarifas; track t.periodo) {
                      <tr><td>{{ t.periodo }}@if (t.estimado) {<sup title="Estimado con el precio de {{ t.origen }}">*</sup>}</td><td class="num">{{ fmtN(t.sin_impuestos, 4) }}</td><td class="num"><b>{{ fmtN(t.con_impuestos, 4) }}</b></td></tr>
                    }
                  </tbody>
                </table>
              </div>
              <p class="card__foot">€ por kWh. * Eurostat no publica 2006-S2 ni 2007-S1 con esta metodología; se usa el precio de 2007-S2.</p>
            </figure>
          </div>
        </div>
      </div>
    </section>`,
})
export class Costo {
  protected readonly md = inject(Medidas);
  protected readonly k = this.md.kpis;
  protected readonly fmtN = fmt;
  protected readonly tarifas = PBI.tarifas;
  protected readonly fmtEuro = (v: number) => '€ ' + fmt(v);
  protected readonly barras = computed<Barra[]>(() => PBI.meses.map(m => ({
    key: m.am, value: m.c, dim: !this.md.enMes(m), tick: m.m === 1 ? String(m.a) : null,
    tip: { titulo: `${MESES_LARGOS[m.m - 1]} ${m.a}`, lineas: [{ etiqueta: 'Costo', valor: `€ ${fmt(m.c, 2)}` }, { etiqueta: 'Energía', valor: `${fmt(m.e)} kWh` }, { etiqueta: 'Días', valor: String(m.d) }] },
  })));
  protected readonly masCaro = computed(() => {
    const ms = this.md.meses();
    if (!ms.length) return { txt: '–' };
    const m = ms.reduce((a, b) => (b.c > a.c ? b : a));
    return { txt: `${MESES_LARGOS[m.m - 1]} ${m.a}, € ${fmt(m.c, 2)}` };
  });
}
