/**
 * Datos extraídos del modelo de Power BI (Dashboard_Energia.pbix) por scripts/extraer_powerbi.py.
 * No se editan a mano: si cambia el .pbix, se vuelve a correr el script.
 */
import raw from './powerbi.json';

export interface Mes {
  am: string; a: number; m: number; s: number;
  /** Energía Total kWh */ e: number;
  /** Costo Energía EUR */ c: number;
  /** Días con Medición */ d: number;
  /** Horas Medidas */ h: number;
  /** Potencia Máxima kW */ p: number;
  /** Energía Electrodoméstico kWh por zona (1..4) */ z: number[];
  /** Horas Inusuales */ u: number;
}
/** [fecha, estación, tipoDía, kWh, nivel, temp °C, categoría térmica, horas medidas, díaSemana 0=lunes] */
export type Dia = [string, number, number, number, number, number | null, number | null, number, number];
/** [año, estación, díaSemana, hora, suma kWh, horas] */
export type HoraCelda = [number, number, number, number, number, number];
/** [fecha, hora, kWh, potencia máx kW, tipoDía, estación] */
export type Inusual = [string, number, number, number, number, number];

export interface Grupo {
  grupo: string; n: number; media: number; desv: number;
  min: number; q1: number; mediana: number; q3: number; max: number;
  ic_inf: number; ic_sup: number; atipicos: number[];
  shapiro_w: number; shapiro_p: number;
}
export interface ParTukey { a: string; b: string; dif: number; ic_inf: number; ic_sup: number; p: number; significativa: boolean }
export interface Hipotesis {
  id: string; titulo: string; columna: string; pregunta: string; porque: string; h0: string; h1: string; req: number[];
  n_total: number; alfa: number; grupos: Grupo[];
  levene: { estadistico: number; p: number };
  tabla: { ss_entre: number; ss_dentro: number; gl_entre: number; gl_dentro: number; ms_entre: number; ms_dentro: number };
  anova: { f: number; p: number; f_critico: number };
  welch: { f: number; gl1: number; gl2: number; p: number };
  kruskal: { h: number; p: number };
  eta2: number;
  tukey: ParTukey[];
  histograma: { bordes: number[]; conteos: number[][] };
  extra?: { titulo: string; h0: string; h1: string; prueba: string; t: number; p: number };
}

export interface PowerBIData {
  meta: { fuente: string; dataset_id: string | null; reporte_id: string | null; generado: string; paginas: string[]; dias_anova: number };
  kpis: {
    energia_kwh: number; costo_eur: number; promedio_diario_kwh: number; promedio_hora_kwh: number;
    potencia_max_kw: number; dias_medidos: number; horas_medidas: number; dias_calendario: number;
    fecha_inicio: string; fecha_fin: string; umbral_inusual_kwh: number; umbral_media_kwh: number;
    umbral_desv_kwh: number; horas_inusuales: number;
  };
  estaciones: string[]; tipos: string[]; niveles: string[]; categorias: string[]; dias_semana: string[];
  franjas: [number, string, string][];
  zonas: { id: number; zona: string; equipos: string; origen: string }[];
  tarifas: { periodo: string; sin_impuestos: number; con_impuestos: number; estimado: boolean; origen: string }[];
  medidas: { nombre: string; dax: string }[];
  meses: Mes[];
  dias: Dia[];
  horas: HoraCelda[];
  inusuales: Inusual[];
  anova: Hipotesis[];
}

export const PBI = raw as unknown as PowerBIData;

export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const ANIOS = [...new Set(PBI.meses.map(m => m.a))].sort();

/** Colores categóricos validados (CVD y contraste) sobre el papel crema. Siguen a la entidad, nunca al rango. */
export const COLOR_ESTACION = ['#2f8fc4', '#3a9a62', '#e0a91b', '#e2633a'];
export const FONDO_ESTACION = ['var(--sky)', 'var(--mint)', 'var(--yellow)', 'var(--peach)'];
export const COLOR_ANIO: Record<number, string> = { 2006: '#e0a91b', 2007: '#2f8fc4', 2008: '#8a63f0', 2009: '#3a9a62', 2010: '#e2633a' };
export const COLOR_ZONA = ['#e0a91b', '#8a63f0', '#2f8fc4', '#1d1d1f'];
export const FONDO_ZONA = ['var(--yellow)', 'var(--lilac)', 'var(--sky)', 'var(--mint)'];
export const COLOR_NIVEL = ['#3a9a62', '#e0a91b', '#e2633a'];
export const FONDO_NIVEL = ['var(--mint)', 'var(--yellow)', 'var(--peach)'];
