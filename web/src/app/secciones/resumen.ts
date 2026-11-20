import { Component, computed, inject, signal } from '@angular/core';
import { BarChart, Barra } from '../charts/bar-chart';
import { LineChart, Serie } from '../charts/line-chart';
import { Filtros } from '../core/filtros';
import { fechaLarga, fmt } from '../core/fmt';
import { Medidas } from '../core/medidas.service';
import { CountUp, Reveal, Split, Stagger } from '../core/motion';
import { ANIOS, MESES_CORTOS, MESES_LARGOS, PBI } from '../data/modelo';

/** Del dato crudo al limpio: la secuencia real del ETL. */
@Component({
  selector: 'app-cifras',
  imports: [CountUp, Split, Stagger],
  template: `
    <section class="section" id="cifras">
      <div class="container">
        <div class="section__head">
          <p class="eyebrow">Del dato crudo al dato confiable</p>
          <h2 class="h2" appSplit>2 millones de minutos, depurados regla por regla.</h2>
        </div>
        <ol class="steps" appStagger=".step">
          <li class="step" style="--c:var(--card)">
            <span class="step__n">1</span>
            <span class="step__num" [appCount]="2075259"></span>
            <span class="step__label">minutos leídos del archivo de UCI</span>
          </li>
          <li class="step" style="--c:var(--card)">
            <span class="step__n">2</span>
            <span class="step__num" [appCount]="2049247"></span>
            <span class="step__label">minutos válidos; 26.012 quedan en cuarentena con su motivo</span>
          </li>
          <li class="step" style="--c:var(--card)">
            <span class="step__n">3</span>
            <span class="step__num" [appCount]="horas"></span>
            <span class="step__label">horas con al menos 45 minutos medidos (filas de Fact_Consumo_Hora en Power BI)</span>
          </li>
          <li class="step step--done" style="--c:var(--yellow)">
            <span class="step__n">4</span>
            <span class="step__num" [appCount]="dias"></span>
            <span class="step__label">días con medición en el modelo, después de pasar 46 de 46 pruebas de calidad</span>
          </li>
        </ol>
      </div>
    </section>`,
})
export class Cifras {
  protected readonly horas = PBI.kpis.horas_medidas;
  protected readonly dias = PBI.kpis.dias_medidos;
}

/** Requerimiento 1: página Resumen del reporte, con sus segmentadores. */
@Component({
  selector: 'app-resumen',
  imports: [Filtros, CountUp, BarChart, LineChart, Split, Reveal],
  template: `
    <section class="section" id="resumen">
      <div class="container">
        <div class="section__head section__head--row">
          <div>
            <p class="eyebrow">Req. 1 · Consumo total por día, mes y año</p>
            <h2 class="h2" appSplit>Los mismos números del Power BI, ahora en vivo.</h2>
          </div>
          <p class="section__note">Filtra por año y estación como en los segmentadores del reporte. Las tarjetas y las gráficas se recalculan al instante con las medidas DAX.</p>
        </div>

        <div class="board" appReveal>
          <app-filtros id="f-resumen" />

          <div class="kpis">
            <article class="kpi" style="--c:var(--yellow)">
              <span class="tag">Energía total</span>
              <span class="kpi__value"><span [appCount]="k().energia"></span><small>kWh</small></span>
              <span class="kpi__sub">{{ md.alcance() }}</span>
            </article>
            <article class="kpi" style="--c:var(--lilac)">
              <span class="tag">Costo de la energía</span>
              <span class="kpi__value"><small>€</small><span [appCount]="k().costo"></span></span>
              <span class="kpi__sub">tarifa Eurostat con impuestos</span>
            </article>
            <article class="kpi" style="--c:var(--sky)">
              <span class="tag">Promedio diario</span>
              <span class="kpi__value"><span [appCount]="k().promedio" [decimales]="2"></span><small>kWh</small></span>
              <span class="kpi__sub">{{ fmtN(k().dias) }} días con medición</span>
            </article>
            <article class="kpi" style="--c:var(--mint)">
              <span class="tag">Potencia máxima</span>
              <span class="kpi__value"><span [appCount]="k().potencia" [decimales]="2"></span><small>kW</small></span>
              <span class="kpi__sub">pico registrado en un minuto</span>
            </article>
          </div>

          <div class="charts-grid">
            <figure class="chart-card">
              <figcaption>
                <span class="chart-title">{{ vista() === 'mes' ? '¿Cómo cambia el consumo mes a mes?' : 'Consumo de cada día' }}</span>
                <span class="seg" role="group" aria-label="Granularidad">
                  <button type="button" class="seg__btn" [attr.aria-pressed]="vista() === 'dia'" (click)="vista.set('dia')">Día</button>
                  <button type="button" class="seg__btn" [attr.aria-pressed]="vista() === 'mes'" (click)="vista.set('mes')">Mes</button>
                </span>
              </figcaption>
              @if (vista() === 'mes') {
                <app-bar-chart [data]="barrasMes()" [gap]="0.3" ariaLabel="Energía total por mes, diciembre 2006 a noviembre 2010" />
              } @else {
                <app-line-chart [series]="serieDia()" [etiquetas]="etiquetasDia()" [tickX]="tickDia" [titulo]="tituloDia"
                                [area]="true" [decimales]="1" ariaLabel="Energía de cada día con medición" />
              }
            </figure>
            <figure class="chart-card">
              <figcaption><span class="chart-title">Consumo total por año (kWh)</span></figcaption>
              <app-bar-chart [data]="barrasAnio()" [gap]="0.4" [yAxis]="false" [valueLabels]="true" ariaLabel="Energía total por año" />
            </figure>
          </div>
          <p class="board__note">2006 solo tiene medición desde el 16 de diciembre y 2010 hasta el 26 de noviembre; por eso sus barras son más bajas.</p>
        </div>
      </div>
    </section>`,
})
export class Resumen {
  protected readonly md = inject(Medidas);
  protected readonly k = this.md.kpis;
  protected readonly vista = signal<'dia' | 'mes'>('mes');
  protected readonly fmtN = fmt;

  protected readonly barrasMes = computed<Barra[]>(() => PBI.meses.map(m => ({
    key: m.am, value: m.e, dim: !this.md.enMes(m),
    tick: m.m === 1 ? String(m.a) : null,
    tip: { titulo: `${MESES_LARGOS[m.m - 1]} ${m.a} · ${PBI.estaciones[m.s].toLowerCase()}`, lineas: [
      { etiqueta: 'Energía', valor: `${fmt(m.e)} kWh` }, { etiqueta: 'Costo', valor: `€ ${fmt(m.c, 2)}` }, { etiqueta: 'Días medidos', valor: String(m.d) }] },
  })));

  protected readonly barrasAnio = computed<Barra[]>(() => this.md.porAnio().map(a => ({
    key: a.anio, tick: String(a.anio), value: a.e, valueText: a.e >= 1000 ? fmt(a.e / 1000, 1) + ' mil' : fmt(a.e),
    dim: this.md.anio() !== null && this.md.anio() !== a.anio,
    tip: { titulo: `${a.anio}${this.md.estacion() !== null ? ' · ' + PBI.estaciones[this.md.estacion()!].toLowerCase() : ''}`,
      lineas: [{ valor: `${fmt(a.e)} kWh en ${fmt(a.d)} días` }, { valor: `€ ${fmt(a.c, 2)}` }] },
  })));

  /** Vista diaria: eje con todos los días del año filtrado; los días fuera de la estación quedan vacíos. */
  private readonly diasEje = computed(() => PBI.dias.filter(d => this.md.anio() === null || +d[0].slice(0, 4) === this.md.anio()));
  protected readonly etiquetasDia = computed(() => this.diasEje().map(d => d[0]));
  protected readonly serieDia = computed<Serie[]>(() => [{
    nombre: 'Energía del día', color: '#1d1d1f',
    valores: this.diasEje().map(d => (this.md.estacion() === null || d[1] === this.md.estacion() ? d[3] : null)),
  }]);
  protected readonly tickDia = (i: number) => {
    const e = this.etiquetasDia();
    const [y, m] = e[i].split('-');
    const prev = i > 0 ? e[i - 1].split('-') : null;
    if (this.md.anio() !== null) return !prev || prev[1] !== m ? (+m % 2 ? MESES_CORTOS[+m - 1] : null) : null;
    return m === '01' && (!prev || prev[0] !== y) ? y : null;
  };
  protected readonly tituloDia = (i: number) => {
    const d = this.diasEje()[i];
    return `${fechaLarga(d[0])} · ${PBI.tipos[d[2]]} · nivel ${PBI.niveles[d[4]].toLowerCase()}`;
  };
  protected readonly anios = ANIOS;
}
