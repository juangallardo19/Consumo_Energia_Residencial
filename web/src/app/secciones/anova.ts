import { Component, computed, inject, signal } from '@angular/core';
import { BoxPlot, FDist, TukeyChart } from '../charts/anova-charts';
import { fmt, fmtP, fmtPCientifico } from '../core/fmt';
import { Motion, Parallax, Reveal, Split, Stagger } from '../core/motion';
import { FONDO_ESTACION, FONDO_NIVEL, Hipotesis, PBI } from '../data/modelo';

const FONDOS: Record<string, string[]> = {
  H1: ['var(--lilac)', 'var(--yellow)', 'var(--mint)'],
  H2: FONDO_ESTACION,
  H3: ['var(--sky)', 'var(--mint)', 'var(--peach)'],
};

/** Conclusión en lenguaje simple + qué significa para el ahorro. Las cifras salen del cálculo. */
function conclusion(h: Hipotesis): { titulo: string; texto: string; ahorro: string } {
  const g = h.grupos, par = (a: string, b: string) => h.tukey.find(p => p.a === a && p.b === b)!;
  const efecto = h.eta2 < 0.06 ? 'pequeño' : h.eta2 < 0.14 ? 'mediano' : 'grande';
  const rechaza = h.anova.p < h.alfa;
  const base = `${rechaza ? 'Se rechaza' : 'No se rechaza'} H₀ (F = ${fmt(h.anova.f, 2)}, p ${fmtP(h.anova.p).startsWith('<') ? fmtP(h.anova.p) : '= ' + fmtP(h.anova.p)}). `
    + `El efecto es ${efecto}: el factor explica el ${fmt(h.eta2 * 100, 1)} % de la variación del consumo diario.`;
  if (h.id === 'H1') {
    const lf = par('Laborable', 'Fin de semana'), lfe = par('Laborable', 'Festivo');
    return {
      titulo: 'Sí hay diferencia, y la marca el fin de semana',
      texto: `${base} Un día de fin de semana gasta ${fmt(-lf.dif, 2)} kWh más que uno laborable (+${fmt((g[1].media / g[0].media - 1) * 100, 0)} %). `
        + `Los festivos, en cambio, no se distinguen de los laborables (Tukey p = ${fmtP(lfe.p)}) y la prueba de una cola tampoco confirma que en festivos se consuma más (p = ${fmtP(h.extra!.p)}): con solo ${g[2].n} festivos la diferencia no alcanza.`,
      ahorro: 'Las recomendaciones de ahorro rinden más si apuntan al fin de semana: programar lavadora y lavavajillas, y revisar la calefacción mientras la familia está en casa.',
    };
  }
  if (h.id === 'H2') {
    const pv = par('Primavera', 'Otoño');
    return {
      titulo: 'La estación cambia el consumo, y mucho',
      texto: `${base} El invierno (${fmt(g[0].media, 1)} kWh/día) casi duplica el verano (${fmt(g[2].media, 1)} kWh/día). `
        + `Tukey separa todas las estaciones entre sí excepto primavera y otoño (p = ${fmtP(pv.p)}), que se comportan igual: son las estaciones de transición.`,
      ahorro: 'La mayor oportunidad está en el invierno: aislamiento, termostato programable y control del calentador de agua atacan el pico de consumo del año.',
    };
  }
  return {
    titulo: 'La temperatura explica buena parte del consumo',
    texto: `${base} Un día frío consume ${fmt(g[0].media - g[2].media, 1)} kWh más que uno cálido, y las tres categorías difieren entre sí (Tukey p < 0,0001 en los tres pares). `
      + 'Es la confirmación física de la H2: el frío, no el calendario, dispara el consumo.',
    ahorro: 'Como el consumo sigue a la temperatura, se puede anticipar con el pronóstico del tiempo y ajustar la calefacción según el clima y no según la fecha.',
  };
}

@Component({
  selector: 'app-anova',
  imports: [BoxPlot, TukeyChart, FDist, Split, Reveal, Stagger, Parallax],
  template: `
    <section class="section" id="anova">
      <span class="deco deco--f" aria-hidden="true" [appParallax]="0.3">F</span>
      <div class="container">
        <div class="section__head section__head--row">
          <div>
            <p class="eyebrow">Prueba de hipótesis · ANOVA de un factor</p>
            <h2 class="h2" appSplit>¿Las diferencias son reales o son azar?</h2>
          </div>
          <p class="section__note">El dashboard muestra barras distintas, pero una gráfica no prueba nada. El ANOVA compara la variación <b>entre</b> grupos con la variación <b>dentro</b> de cada grupo: si la primera es mucho mayor, la diferencia no es casualidad.</p>
        </div>

        <div class="metodo" appStagger=".metodo__item" [staggerBase]="10" [staggerPaso]="18">
          <div class="metodo__item" style="--c:var(--yellow)"><span class="tag">Unidad</span><b>El día</b><span>consumo total del día (kWh), la variable dependiente</span></div>
          <div class="metodo__item" style="--c:var(--sky)"><span class="tag">Muestra</span><b>{{ fmtN(diasAnova) }} días</b><span>con las 24 horas medidas, de los {{ fmtN(diasModelo) }} del modelo de Power BI</span></div>
          <div class="metodo__item" style="--c:var(--lilac)"><span class="tag">Significancia</span><b>α = 0,05</b><span>se rechaza H₀ si p &lt; 0,05</span></div>
          <div class="metodo__item" style="--c:var(--mint)"><span class="tag">Respaldo</span><b>Welch y Kruskal-Wallis</b><span>pruebas robustas por si fallan los supuestos</span></div>
        </div>

        <div class="tabs" role="tablist" aria-label="Hipótesis">
          @for (x of hipotesis; track x.id; let i = $index) {
            <button type="button" role="tab" class="tab" [id]="'tab-' + x.id" [attr.aria-selected]="sel() === i" [attr.aria-controls]="'panel-anova'"
                    [attr.tabindex]="sel() === i ? 0 : -1" (click)="sel.set(i)" (keydown)="teclado($event)">
              <span class="tab__id">{{ x.id }}</span>{{ x.titulo }}
            </button>
          }
        </div>

        @for (h of [actual()]; track h.id) {
          <div class="anova" id="panel-anova" role="tabpanel" [attr.aria-labelledby]="'tab-' + h.id">
            <div class="anova__top">
              <article class="card pregunta">
                <span class="tag">Pregunta de investigación · {{ h.id }}</span>
                <p class="pregunta__q">{{ h.pregunta }}</p>
                <h3 class="pregunta__why">¿Por qué planteamos esta pregunta?</h3>
                <p>{{ h.porque }}</p>
                <p class="pregunta__req">Responde a los requerimientos {{ h.req.join(' y ') }}.</p>
              </article>
              <div class="hipos">
                <div class="hipo" style="--c:var(--card)">
                  <span class="hipo__k">H₀</span>
                  <div><b>Hipótesis nula</b><p>{{ h.h0 }}</p></div>
                </div>
                <div class="hipo" style="--c:var(--yellow)">
                  <span class="hipo__k">H₁</span>
                  <div><b>Hipótesis alternativa</b><p>{{ h.h1 }}</p></div>
                </div>
                <div class="veredicto" [class.is-reject]="h.anova.p < h.alfa">
                  <span class="veredicto__k">{{ h.anova.p < h.alfa ? 'Se rechaza H₀' : 'No se rechaza H₀' }}</span>
                  <span>p = {{ pCient(h.anova.p) }} {{ h.anova.p < h.alfa ? '<' : '≥' }} α = 0,05</span>
                </div>
              </div>
            </div>

            <div class="anova__grid">
              <figure class="chart-card">
                <figcaption><span class="chart-title">Consumo diario por {{ h.titulo.toLowerCase() }}</span></figcaption>
                <app-boxplot [grupos]="h.grupos" [fondos]="fondos()" [factor]="h.titulo.toLowerCase()" />
              </figure>
              <div class="card">
                <h3 class="h3">Estadística descriptiva</h3>
                <div class="table-wrap">
                  <table class="table table--compact">
                    <thead><tr><th scope="col">Grupo</th><th scope="col" class="num">n</th><th scope="col" class="num">Media</th><th scope="col" class="num">Desv.</th><th scope="col" class="num">Mediana</th></tr></thead>
                    <tbody>
                      @for (g of h.grupos; track g.grupo; let i = $index) {
                        <tr><td><i class="dot-key" [style.background]="fondos()[i]"></i>{{ g.grupo }}</td><td class="num">{{ fmtN(g.n) }}</td><td class="num"><b>{{ fmtN(g.media, 2) }}</b></td><td class="num">{{ fmtN(g.desv, 2) }}</td><td class="num">{{ fmtN(g.mediana, 2) }}</td></tr>
                      }
                    </tbody>
                  </table>
                </div>
                <h3 class="h3 h3--gap">Supuestos</h3>
                <ul class="supuestos">
                  @for (g of h.grupos; track g.grupo) {
                    <li><span>Normalidad · {{ g.grupo }} <small>Shapiro-Wilk W = {{ fmtN(g.shapiro_w, 3) }}, p = {{ p(g.shapiro_p) }}</small></span>
                      <span class="chip" [class.chip--ok]="g.shapiro_p > h.alfa">{{ g.shapiro_p > h.alfa ? 'Se cumple' : 'No se cumple' }}</span></li>
                  }
                  <li><span>Varianzas iguales <small>Levene = {{ fmtN(h.levene.estadistico, 2) }}, p = {{ p(h.levene.p) }}</small></span>
                    <span class="chip" [class.chip--ok]="h.levene.p > h.alfa">{{ h.levene.p > h.alfa ? 'Se cumple' : 'No se cumple' }}</span></li>
                </ul>
                <p class="card__foot">Con cientos de días por grupo el ANOVA es robusto a la falta de normalidad (teorema del límite central). Para no depender de los supuestos se confirma con Welch (no exige varianzas iguales) y Kruskal-Wallis (no exige normalidad).</p>
              </div>
            </div>

            <div class="anova__grid">
              <div class="card">
                <h3 class="h3">Tabla ANOVA</h3>
                <div class="table-wrap">
                  <table class="table table--compact">
                    <thead><tr><th scope="col">Fuente</th><th scope="col" class="num">SC</th><th scope="col" class="num">gl</th><th scope="col" class="num">CM</th><th scope="col" class="num">F</th></tr></thead>
                    <tbody>
                      <tr><td>Entre grupos</td><td class="num">{{ fmtN(h.tabla.ss_entre, 0) }}</td><td class="num">{{ h.tabla.gl_entre }}</td><td class="num">{{ fmtN(h.tabla.ms_entre, 1) }}</td><td class="num"><b>{{ fmtN(h.anova.f, 2) }}</b></td></tr>
                      <tr><td>Dentro de grupos</td><td class="num">{{ fmtN(h.tabla.ss_dentro, 0) }}</td><td class="num">{{ fmtN(h.tabla.gl_dentro) }}</td><td class="num">{{ fmtN(h.tabla.ms_dentro, 1) }}</td><td></td></tr>
                      <tr><td>Total</td><td class="num">{{ fmtN(h.tabla.ss_entre + h.tabla.ss_dentro, 0) }}</td><td class="num">{{ fmtN(h.tabla.gl_entre + h.tabla.gl_dentro) }}</td><td></td><td></td></tr>
                    </tbody>
                  </table>
                </div>
                <p class="formula">F = CM entre / CM dentro = {{ fmtN(h.tabla.ms_entre, 1) }} / {{ fmtN(h.tabla.ms_dentro, 1) }} = <b>{{ fmtN(h.anova.f, 2) }}</b></p>
                <app-fdist [gl1]="h.tabla.gl_entre" [gl2]="h.tabla.gl_dentro" [fcrit]="h.anova.f_critico" [fobs]="h.anova.f" />
                <p class="card__foot">Si H₀ fuera cierta, F caería casi siempre a la izquierda del valor crítico. El F observado queda muy dentro de la zona de rechazo.</p>
              </div>
              <div class="card">
                <h3 class="h3">Las tres pruebas coinciden</h3>
                <div class="table-wrap">
                  <table class="table table--compact">
                    <thead><tr><th scope="col">Prueba</th><th scope="col" class="num">Estadístico</th><th scope="col" class="num">p-valor</th><th scope="col">Decisión</th></tr></thead>
                    <tbody>
                      <tr><td>ANOVA de un factor</td><td class="num">F = {{ fmtN(h.anova.f, 2) }}</td><td class="num">{{ p(h.anova.p) }}</td><td><span class="chip" [class.chip--ink]="h.anova.p < h.alfa">{{ h.anova.p < h.alfa ? 'Rechazar H₀' : 'No rechazar' }}</span></td></tr>
                      <tr><td>ANOVA de Welch</td><td class="num">F = {{ fmtN(h.welch.f, 2) }}</td><td class="num">{{ p(h.welch.p) }}</td><td><span class="chip" [class.chip--ink]="h.welch.p < h.alfa">{{ h.welch.p < h.alfa ? 'Rechazar H₀' : 'No rechazar' }}</span></td></tr>
                      <tr><td>Kruskal-Wallis</td><td class="num">H = {{ fmtN(h.kruskal.h, 2) }}</td><td class="num">{{ p(h.kruskal.p) }}</td><td><span class="chip" [class.chip--ink]="h.kruskal.p < h.alfa">{{ h.kruskal.p < h.alfa ? 'Rechazar H₀' : 'No rechazar' }}</span></td></tr>
                    </tbody>
                  </table>
                </div>
                <h3 class="h3 h3--gap">Tamaño del efecto (η²)</h3>
                <div class="eta">
                  <!-- Escala de 0 a 0,4; umbrales de Cohen: 0,01 pequeño, 0,06 mediano, 0,14 grande -->
                  <div class="eta__bar"><span [style.transform]="'scaleX(' + h.eta2 / 0.4 + ')'"></span>
                    <i style="left:2.5%"></i><i style="left:15%"></i><i style="left:35%"></i></div>
                  <div class="eta__scale">
                    <span style="left:2.5%;width:12.5%">pequeño</span><span style="left:15%;width:20%">mediano</span><span style="left:35%;width:65%">grande</span>
                  </div>
                  <p class="eta__val"><b>{{ fmtN(h.eta2 * 100, 1) }} %</b> de la variación del consumo diario se explica por {{ h.titulo.toLowerCase() }}.</p>
                </div>
                <h3 class="h3 h3--gap">¿Qué grupos difieren? Tukey HSD</h3>
                <app-tukey [pares]="h.tukey" />
              </div>
            </div>

            @if (h.extra; as e) {
              <div class="card extra">
                <span class="tag">Pregunta puntual</span>
                <h3 class="h3">{{ e.titulo }}</h3>
                <p>H₀: {{ e.h0 }} · H₁: {{ e.h1 }} ({{ e.prueba }}). Media festivos = {{ fmtN(h.grupos[2].media, 2) }} kWh (n = {{ h.grupos[2].n }}), laborables = {{ fmtN(h.grupos[0].media, 2) }} kWh (n = {{ h.grupos[0].n }}).
                  t = {{ fmtN(e.t, 3) }}, p = {{ p(e.p) }} → <b>{{ e.p < h.alfa ? 'se rechaza H₀' : 'no se rechaza H₀' }}</b>.</p>
              </div>
            }

            <div class="conclusion" appReveal>
              <span class="tag tag--light">Conclusión {{ h.id }}</span>
              <h3>{{ concl().titulo }}</h3>
              <p>{{ concl().texto }}</p>
              <p class="conclusion__ahorro"><b>Oportunidad de ahorro.</b> {{ concl().ahorro }}</p>
            </div>
          </div>
        }

        <div class="resumen-anova" appStagger=".ra" [staggerBase]="14" [staggerPaso]="22">
          <h3 class="h3">¿Qué factor pesa más?</h3>
          @for (x of hipotesis; track x.id; let i = $index) {
            <button type="button" class="ra" [class.is-on]="sel() === i" (click)="sel.set(i); irA()">
              <span class="ra__id">{{ x.id }}</span>
              <span class="ra__name">{{ x.titulo }}<small>F = {{ fmtN(x.anova.f, 1) }} · p = {{ p(x.anova.p) }}</small></span>
              <span class="ra__track"><span [style.transform]="'scaleX(' + x.eta2 / maxEta + ')'"></span></span>
              <span class="ra__val">η² = {{ fmtN(x.eta2 * 100, 1) }} %</span>
            </button>
          }
          <p class="card__foot">Las tres hipótesis rechazan H₀, pero no con la misma fuerza: la estación y la temperatura explican entre 5 y 7 veces más variación que el tipo de día.</p>
        </div>
      </div>
    </section>`,
})
export class Anova {
  private readonly motion = inject(Motion);
  protected readonly hipotesis = PBI.anova;
  protected readonly sel = signal(0);
  protected readonly actual = computed(() => this.hipotesis[this.sel()]);
  protected readonly fondos = computed(() => FONDOS[this.actual().id] ?? FONDO_NIVEL);
  protected readonly concl = computed(() => conclusion(this.actual()));
  protected readonly diasAnova = PBI.meta.dias_anova;
  protected readonly diasModelo = PBI.kpis.dias_medidos;
  protected readonly maxEta = Math.max(...PBI.anova.map(a => a.eta2));
  protected readonly fmtN = fmt;
  protected readonly p = fmtP;
  protected readonly pCient = fmtPCientifico;

  protected teclado(e: KeyboardEvent) {
    const n = this.hipotesis.length;
    let i = this.sel();
    if (e.key === 'ArrowRight') i = (i + 1) % n;
    else if (e.key === 'ArrowLeft') i = (i - 1 + n) % n;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = n - 1;
    else return;
    e.preventDefault();
    this.sel.set(i);
    document.getElementById('tab-' + this.hipotesis[i].id)?.focus();
  }
  protected irA() { this.motion.irA('.tabs'); }
}
