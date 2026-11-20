import { Component, computed, inject, signal } from '@angular/core';
import { BarChart, Barra } from '../charts/bar-chart';
import { Stacked } from '../charts/stacked';
import { Filtros } from '../core/filtros';
import { fechaLarga, fmt } from '../core/fmt';
import { Medidas } from '../core/medidas.service';
import { CountUp, Reveal, Split, Stagger } from '../core/motion';
import { COLOR_NIVEL, FONDO_NIVEL, MESES_LARGOS, PBI } from '../data/modelo';

/** PERCENTILEX.INC de DAX (interpolación lineal inclusiva). */
function percentilInc(xs: number[], p: number) {
  const s = [...xs].sort((a, b) => a - b), r = p * (s.length - 1), i = Math.floor(r);
  return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (r - i);
}
const P33 = percentilInc(PBI.dias.map(d => d[3]), 0.33);
const P66 = percentilInc(PBI.dias.map(d => d[3]), 0.66);

@Component({
  selector: 'app-eventos',
  imports: [Filtros, BarChart, Stacked, CountUp, Split, Reveal, Stagger],
  template: `
    <section class="section" id="eventos">
      <div class="container">
        <div class="section__head section__head--row">
          <div>
            <p class="eyebrow">Req. 4 · Detección de eventos inusuales</p>
            <h2 class="h2" appSplit>Las horas que se salen de lo normal.</h2>
          </div>
          <p class="section__note">Una hora es inusual si su energía supera la media más dos desviaciones estándar de todas las horas medidas. Es la medida <code>Umbral Inusual kWh</code> del reporte.</p>
        </div>

        <div class="board" appReveal>
          <app-filtros id="f-eventos" />
          <div class="kpis kpis--3">
            <article class="kpi" style="--c:var(--peach)">
              <span class="tag">Umbral de hora inusual</span>
              <span class="kpi__value"><span [appCount]="umbral" [decimales]="2"></span><small>kWh</small></span>
              <span class="kpi__sub">{{ fmtN(media, 2) }} + 2 × {{ fmtN(desv, 2) }} (media + 2σ, fijo)</span>
            </article>
            <article class="kpi" style="--c:var(--yellow)">
              <span class="tag">Horas con consumo inusual</span>
              <span class="kpi__value"><span [appCount]="md.inusuales().length"></span><small>horas</small></span>
              <span class="kpi__sub">{{ fmtN(pctInusual(), 1) }} % de las {{ fmtN(md.kpis().horas) }} horas medidas</span>
            </article>
            <article class="kpi" style="--c:var(--lilac)">
              <span class="tag">Hora más alta</span>
              <span class="kpi__value"><span [appCount]="top()?.[2] ?? 0" [decimales]="2"></span><small>kWh</small></span>
              <span class="kpi__sub">{{ top() ? fecha(top()![0]) + ', ' + hh(top()![1]) : 'sin horas inusuales' }}</span>
            </article>
          </div>
          <div class="charts-grid charts-grid--even" appStagger=".chart-card" [staggerBase]="12" [staggerPaso]="30">
            <figure class="chart-card">
              <figcaption><span class="chart-title">¿A qué hora ocurren los picos de consumo?</span><span class="chart-legend"><i class="lg"></i>horas inusuales</span></figcaption>
              <app-bar-chart [data]="porHora()" ariaLabel="Número de horas inusuales según la hora del día" />
            </figure>
            <figure class="chart-card">
              <figcaption><span class="chart-title">¿En qué meses hay más horas inusuales?</span></figcaption>
              <app-bar-chart [data]="porMes()" [gap]="0.3" ariaLabel="Número de horas inusuales por mes" />
            </figure>
          </div>
          <figure class="chart-card table-card">
            <figcaption><span class="chart-title">Las horas de mayor consumo registradas</span><span class="chart-legend">{{ fmtN(md.inusuales().length) }} horas sobre el umbral</span></figcaption>
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th scope="col">#</th><th scope="col">Fecha</th><th scope="col">Hora</th><th scope="col">Tipo de día</th><th scope="col" class="num">Energía (kWh)</th><th scope="col" class="num">Potencia máx. (kW)</th></tr></thead>
                <tbody>
                  @for (x of filasTabla(); track x[0] + x[1]; let i = $index) {
                    <tr><td>{{ i + 1 }}</td><td>{{ fecha(x[0]) }}</td><td>{{ hh(x[1]) }}</td><td>{{ tipos[x[4]] }}</td><td class="num"><b>{{ fmtN(x[2], 2) }}</b></td><td class="num">{{ fmtN(x[3], 2) }}</td></tr>
                  }
                </tbody>
              </table>
            </div>
            @if (md.inusuales().length > 8) {
              <button type="button" class="btn btn--sm btn--line table-more" (click)="verTodas.set(!verTodas())">{{ verTodas() ? 'Ver solo las 8 primeras' : 'Ver las 25 primeras' }}</button>
            }
          </figure>
        </div>

        <div class="section__head section__head--row sub-head" id="clasificacion">
          <div>
            <p class="eyebrow">Req. 9 · Clasificación de días por nivel de consumo</p>
            <h3 class="h2 h2--sm" appSplit>Bajo, medio o alto: un tercio cada uno.</h3>
          </div>
          <p class="section__note">La columna calculada <code>Nivel_Consumo</code> compara cada día con los percentiles 33 y 66 de todos los días: bajo hasta {{ fmtN(p33, 1) }} kWh, medio hasta {{ fmtN(p66, 1) }} kWh y alto por encima.</p>
        </div>
        <div class="nivel-grid">
          <div class="nivel-cards" appStagger=".nivel-card" [staggerBase]="14" [staggerPaso]="20">
          @for (n of niveles(); track n.nombre) {
            <article class="nivel-card" [style.--c]="n.fondo">
              <div class="nivel-card__top"><span class="tag">{{ n.nombre }}</span><span class="kpi__sub">{{ n.rango }}</span></div>
              <span class="kpi__value"><span [appCount]="n.dias"></span><small>días</small></span>
              <span class="progress__track"><span class="progress__fill progress__fill--on" [style.transform]="'scaleX(' + n.frac + ')'"></span></span>
              <span class="kpi__sub">{{ fmtN(n.frac * 100, 1) }} % de los días filtrados</span>
            </article>
          }
          </div>
          <div class="card nivel-stack">
            <h3 class="h3">¿En qué estación hay más días de consumo alto?</h3>
            <app-stacked [categorias]="estaciones" [series]="nivelesNombres" [colores]="colNivel" [valores]="md.nivelesPorEstacion()" unidad="días"
                         ariaLabel="Proporción de días bajos, medios y altos en cada estación" />
          </div>
        </div>
      </div>
    </section>`,
})
export class Eventos {
  protected readonly md = inject(Medidas);
  protected readonly fmtN = fmt;
  protected readonly fecha = fechaLarga;
  protected readonly hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  protected readonly tipos = PBI.tipos;
  protected readonly estaciones = PBI.estaciones;
  protected readonly nivelesNombres = PBI.niveles;
  protected readonly colNivel = COLOR_NIVEL;
  protected readonly umbral = PBI.kpis.umbral_inusual_kwh;
  protected readonly media = PBI.kpis.umbral_media_kwh;
  protected readonly desv = PBI.kpis.umbral_desv_kwh;
  protected readonly p33 = P33;
  protected readonly p66 = P66;
  protected readonly verTodas = signal(false);

  protected readonly top = computed(() => this.md.inusuales()[0] ?? null);
  protected readonly pctInusual = computed(() => (this.md.kpis().horas ? (this.md.inusuales().length / this.md.kpis().horas) * 100 : 0));
  protected readonly filasTabla = computed(() => this.md.inusuales().slice(0, this.verTodas() ? 25 : 8));

  protected readonly porHora = computed<Barra[]>(() => this.md.inusualesPorHora().map((v, h) => ({
    key: h, value: v, tick: h % 3 === 0 ? this.hh(h) : null,
    tip: { titulo: `${this.hh(h)} – ${this.hh(h + 1 === 24 ? 0 : h + 1)}`, lineas: [{ valor: `${fmt(v)} horas inusuales` }] },
  })));
  protected readonly porMes = computed<Barra[]>(() => PBI.meses.map(m => ({
    key: m.am, value: m.u, dim: !this.md.enMes(m), tick: m.m === 1 ? String(m.a) : null,
    tip: { titulo: `${MESES_LARGOS[m.m - 1]} ${m.a}`, lineas: [{ valor: `${fmt(m.u)} horas inusuales` }, { valor: `${fmt((m.u / m.h) * 100, 1)} % de las horas del mes` }] },
  })));

  protected readonly niveles = computed(() => {
    const c = this.md.niveles(), tot = c.reduce((a, b) => a + b, 0) || 1;
    const rangos = [`≤ ${fmt(P33, 1)} kWh al día`, `${fmt(P33, 1)} – ${fmt(P66, 1)} kWh al día`, `> ${fmt(P66, 1)} kWh al día`];
    return PBI.niveles.map((nombre, i) => ({ nombre, dias: c[i], frac: c[i] / tot, rango: rangos[i], fondo: FONDO_NIVEL[i] }));
  });
}
