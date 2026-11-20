import { Injectable, computed, signal } from '@angular/core';
import { ANIOS, Dia, Mes, PBI } from '../data/modelo';

/**
 * Segmentadores Año y Estación (los mismos de cada página del reporte) y las medidas DAX
 * recalculadas en el navegador sobre los datos del modelo de Power BI.
 * Un solo estado compartido: filtrar en una sección filtra toda la página.
 */
@Injectable({ providedIn: 'root' })
export class Medidas {
  readonly anio = signal<number | null>(null);
  readonly estacion = signal<number | null>(null);

  readonly hayFiltro = computed(() => this.anio() !== null || this.estacion() !== null);
  readonly alcance = computed(() => {
    const p = [this.anio(), this.estacion() === null ? null : PBI.estaciones[this.estacion()!]].filter(v => v !== null);
    return p.length ? p.join(' · ') : 'Dic-2006 a nov-2010';
  });

  enMes = (m: Mes) => (this.anio() === null || m.a === this.anio()) && (this.estacion() === null || m.s === this.estacion());
  enDia = (d: Dia) => (this.anio() === null || +d[0].slice(0, 4) === this.anio()) && (this.estacion() === null || d[1] === this.estacion());

  readonly meses = computed(() => PBI.meses.filter(this.enMes));
  readonly dias = computed(() => PBI.dias.filter(this.enDia));

  /** Tarjetas de la página Resumen. */
  readonly kpis = computed(() => {
    const ms = this.meses();
    const e = sum(ms.map(m => m.e));
    const c = sum(ms.map(m => m.c));
    const d = sum(ms.map(m => m.d));
    const h = sum(ms.map(m => m.h));
    return {
      energia: e,
      costo: c,
      // AVERAGEX(VALUES(Dim_Fecha[Fecha]), [Energía Total kWh]): AVERAGEX ignora los días en blanco
      promedio: d ? e / d : 0,
      potencia: Math.max(0, ...ms.map(m => m.p)),
      dias: d,
      horas: h,
      meses: ms.length,
      costoMes: ms.length ? c / ms.length : 0,
      inusuales: sum(ms.map(m => m.u)),
    };
  });

  /** Energía Total por año (respeta el filtro de estación). */
  readonly porAnio = computed(() => ANIOS.map(a => {
    const ms = PBI.meses.filter(m => m.a === a && (this.estacion() === null || m.s === this.estacion()));
    return { anio: a, e: sum(ms.map(m => m.e)), d: sum(ms.map(m => m.d)), c: sum(ms.map(m => m.c)) };
  }));

  /** Celdas Año × Estación × DíaSemana × Hora filtradas. */
  private readonly horas = computed(() => PBI.horas.filter(([a, s]) =>
    (this.anio() === null || a === this.anio()) && (this.estacion() === null || s === this.estacion())));

  /** Consumo Promedio por Hora kWh por hora del día. */
  readonly perfilHora = computed(() => {
    const acc = Array.from({ length: 24 }, () => [0, 0]);
    for (const [, , , h, s, n] of this.horas()) { acc[h][0] += s; acc[h][1] += n; }
    return acc.map(([s, n], h) => ({ hora: h, etiqueta: PBI.franjas[h][1], franja: PBI.franjas[h][2], kwh: n ? s / n : 0, horas: n }));
  });

  readonly porFranja = computed(() => {
    const orden = ['Madrugada', 'Mañana', 'Tarde', 'Noche'];
    const acc = new Map<string, [number, number]>(orden.map(f => [f, [0, 0]]));
    for (const [, , , h, s, n] of this.horas()) { const a = acc.get(PBI.franjas[h][2])!; a[0] += s; a[1] += n; }
    return orden.map(f => ({ franja: f, kwh: acc.get(f)![1] ? acc.get(f)![0] / acc.get(f)![1] : 0, rango: rango(f) }));
  });

  /** Mapa de calor día de la semana × hora (Consumo Promedio por Hora kWh). */
  readonly calor = computed(() => {
    const acc = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => [0, 0]));
    for (const [, , dw, h, s, n] of this.horas()) { acc[dw][h][0] += s; acc[dw][h][1] += n; }
    return acc.map(fila => fila.map(([s, n]) => (n ? s / n : 0)));
  });

  /** Consumo Promedio Diario kWh por un atributo del día. */
  promedioDiarioPor(clave: (d: Dia) => number | null, n: number, dias = this.dias()) {
    const acc = Array.from({ length: n }, () => [0, 0]);
    for (const d of dias) { const k = clave(d); if (k !== null) { acc[k][0] += d[3]; acc[k][1]++; } }
    return acc.map(([s, c]) => ({ kwh: c ? s / c : 0, dias: c }));
  }

  readonly porTipoDia = computed(() => this.promedioDiarioPor(d => d[2], 3));
  readonly porCategoria = computed(() => {
    const base = this.promedioDiarioPor(d => d[6], 3);
    const temps = Array.from({ length: 3 }, () => [0, 0]);
    for (const d of this.dias()) if (d[6] !== null && d[5] !== null) { temps[d[6]][0] += d[5]; temps[d[6]][1]++; }
    return base.map((b, i) => ({ ...b, temp: temps[i][1] ? temps[i][0] / temps[i][1] : 0 }));
  });
  /** Promedio diario por estación: solo filtra por año (la estación es el eje). */
  readonly porEstacion = computed(() =>
    this.promedioDiarioPor(d => d[1], 4, PBI.dias.filter(d => this.anio() === null || +d[0].slice(0, 4) === this.anio())));

  /** "El mismo patrón se repite cada año": energía por mes del año, una serie por año. */
  readonly mesPorAnio = computed(() => ANIOS.map(a => ({
    anio: a,
    valores: Array.from({ length: 12 }, (_, i) => {
      const m = PBI.meses.find(x => x.a === a && x.m === i + 1 && (this.estacion() === null || x.s === this.estacion()));
      return m ? m.e : null;
    }),
  })));

  /** Energía Electrodoméstico kWh por zona. */
  readonly zonas = computed(() => {
    const tot = [0, 0, 0, 0];
    for (const m of this.meses()) m.z.forEach((v, i) => (tot[i] += v));
    const t = sum(tot);
    return PBI.zonas.map((z, i) => ({ ...z, kwh: tot[i], pct: t ? (tot[i] / t) * 100 : 0 }));
  });
  /** Reparto por zona según la estación (100 %), filtra por año. */
  readonly zonasPorEstacion = computed(() => PBI.estaciones.map((_, s) => {
    const tot = [0, 0, 0, 0];
    for (const m of PBI.meses) if (m.s === s && (this.anio() === null || m.a === this.anio())) m.z.forEach((v, i) => (tot[i] += v));
    return tot;
  }));

  /** Clasificación de días (Dim_Fecha[Nivel_Consumo]): Días con Medición por nivel. */
  readonly niveles = computed(() => {
    const c = [0, 0, 0];
    for (const d of this.dias()) c[d[4]]++;
    return c;
  });
  readonly nivelesPorEstacion = computed(() => PBI.estaciones.map((_, s) => {
    const c = [0, 0, 0];
    for (const d of PBI.dias) if (d[1] === s && (this.anio() === null || +d[0].slice(0, 4) === this.anio())) c[d[4]]++;
    return c;
  }));

  /** Horas Inusuales (energía > umbral fijo calculado sobre ALL). */
  readonly inusuales = computed(() => PBI.inusuales.filter(([f, , , , , s]) =>
    (this.anio() === null || +f.slice(0, 4) === this.anio()) && (this.estacion() === null || s === this.estacion())));
  readonly inusualesPorHora = computed(() => {
    const c = new Array(24).fill(0);
    for (const x of this.inusuales()) c[x[1]]++;
    return c as number[];
  });

  limpiar() { this.anio.set(null); this.estacion.set(null); }
}

export function sum(xs: number[]): number { let s = 0; for (const x of xs) s += x; return s; }

function rango(f: string) {
  return { Madrugada: '00:00 – 05:59', 'Mañana': '06:00 – 11:59', Tarde: '12:00 – 17:59', Noche: '18:00 – 23:59' }[f] ?? '';
}
