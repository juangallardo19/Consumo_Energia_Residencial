/** Formato es-ES con punto de miles siempre (Intl no agrupa números de 4 cifras en español). */
export function fmt(n: number, dec = 0): string {
  if (!isFinite(n)) return '–';
  const s = Math.abs(n).toFixed(dec).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (n < 0 && +s.join('.') !== 0 ? '−' : '') + s.join(',');
}

/** p-valor legible: "< 0,0001" o con 4 decimales. */
export function fmtP(p: number): string {
  return p < 1e-4 ? '< 0,0001' : fmt(p, 4);
}

/** p-valor en notación científica para mostrar lo extremo (p. ej. 2,4 × 10⁻¹²⁸). */
export function fmtPCientifico(p: number): string {
  if (p >= 1e-4) return fmt(p, 4);
  const exp = Math.floor(Math.log10(p));
  const man = p / Math.pow(10, exp);
  const sup: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  return `${fmt(man, 1)} × 10${String(exp).split('').map(c => sup[c]).join('')}`;
}

export function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return step * p;
}

/** Cuántas divisiones usar para que cada marca del eje sea un número redondo (4 o 5). */
export function divisiones(max: number): number {
  const paso = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(paso)));
  return [1, 2, 2.5, 5, 10].some(n => Math.abs(paso / p - n) < 1e-9) ? 4 : 5;
}

export function fechaLarga(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  return `${d} ${meses[m - 1]} ${y}`;
}

/** Interpola dos colores hex (rampa secuencial de un solo tono). */
export function mezcla(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
