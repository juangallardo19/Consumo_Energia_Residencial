import sqlite3
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

sys.stdout.reconfigure(encoding="utf-8")

RAIZ = Path(__file__).resolve().parent.parent
BASE_DATOS = RAIZ / "datos_limpios" / "energia_residencial.db"
SALIDA = Path(__file__).resolve().parent
ALFA = 0.05

HIPOTESIS = [
    {
        "id": "H1", "titulo": "Tipo de día", "columna": "TipoDía",
        "orden": ["Laborable", "Fin de semana", "Festivo"],
        "h0": "El consumo diario promedio es igual en días laborables, fines de semana y festivos "
              "(μ_laborable = μ_fin de semana = μ_festivo).",
        "h1": "Al menos un tipo de día tiene un consumo diario promedio distinto.",
        "pregunta": "¿En los días festivos y fines de semana se consume más energía que en los laborables?",
    },
    {
        "id": "H2", "titulo": "Estación del año", "columna": "Estación",
        "orden": ["Invierno", "Primavera", "Verano", "Otoño"],
        "h0": "El consumo diario promedio es igual en las cuatro estaciones "
              "(μ_invierno = μ_primavera = μ_verano = μ_otoño).",
        "h1": "Al menos una estación tiene un consumo diario promedio distinto.",
        "pregunta": "¿El consumo cambia según la estación (invierno vs verano)?",
    },
    {
        "id": "H3", "titulo": "Categoría térmica del día", "columna": "Categoria_Termica",
        "orden": ["Frío", "Templado", "Cálido"],
        "h0": "El consumo diario promedio es igual en días fríos (< 10 °C), templados (10-20 °C) y cálidos (≥ 20 °C).",
        "h1": "Al menos una categoría térmica tiene un consumo diario promedio distinto.",
        "pregunta": "¿La temperatura del día (dato de Meteostat agregado en el ETL) influye en el consumo?",
    },
]


def cargar_dias():
    consulta = """
        SELECT f.Fecha, SUM(f.Energia_Activa_kWh) AS Consumo_kWh, COUNT(*) AS Horas,
               d.TipoDía, d.Estación, c.Categoria_Termica, c.Temp_Media_C
        FROM Fact_Consumo_Hora f
        JOIN Dim_Fecha d ON d.Fecha = f.Fecha
        LEFT JOIN Dim_Clima c ON c.Fecha = f.Fecha
        GROUP BY f.Fecha
    """
    with sqlite3.connect(BASE_DATOS) as con:
        dias = pd.read_sql(consulta, con)
    total = len(dias)
    dias = dias[dias["Horas"] == 24]
    return dias, total


def welch_anova(grupos):
    k = len(grupos)
    n = np.array([len(g) for g in grupos])
    m = np.array([g.mean() for g in grupos])
    v = np.array([g.var(ddof=1) for g in grupos])
    w = n / v
    W = w.sum()
    media_w = (w * m).sum() / W
    a = (w * (m - media_w) ** 2).sum() / (k - 1)
    tmp = ((1 - w / W) ** 2 / (n - 1)).sum()
    b = 1 + 2 * (k - 2) / (k ** 2 - 1) * tmp
    f = a / b
    gl2 = (k ** 2 - 1) / (3 * tmp)
    return f, k - 1, gl2, stats.f.sf(f, k - 1, gl2)


def eta_cuadrado(grupos):
    todos = np.concatenate(grupos)
    media = todos.mean()
    ss_entre = sum(len(g) * (g.mean() - media) ** 2 for g in grupos)
    ss_total = ((todos - media) ** 2).sum()
    return ss_entre / ss_total


def p_txt(p):
    return "< 0,0001" if p < 1e-4 else f"{p:.4f}".replace(".", ",")


def num(x, d=2):
    return f"{x:,.{d}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def analizar(h, dias):
    datos = dias.dropna(subset=[h["columna"]])
    grupos = [datos.loc[datos[h["columna"]] == g, "Consumo_kWh"].to_numpy() for g in h["orden"]]

    desc = [(g, len(x), x.mean(), x.std(ddof=1), np.median(x)) for g, x in zip(h["orden"], grupos)]
    normalidad = [(g, *stats.shapiro(x)) for g, x in zip(h["orden"], grupos)]
    lev = stats.levene(*grupos, center="median")
    anova = stats.f_oneway(*grupos)
    welch = welch_anova(grupos)
    kruskal = stats.kruskal(*grupos)
    eta2 = eta_cuadrado(grupos)
    tukey = stats.tukey_hsd(*grupos)

    L = [f"## {h['id']} · {h['titulo']}", "", f"**Pregunta:** {h['pregunta']}", "",
         f"- **H₀ (nula):** {h['h0']}", f"- **H₁ (alternativa):** {h['h1']}",
         f"- Variable dependiente: consumo diario (kWh). Variable categórica: `{h['columna']}`. α = 0,05.", "",
         "### Estadística descriptiva", "", "| Grupo | n (días) | Media kWh | Desv. estándar | Mediana |",
         "|---|---:|---:|---:|---:|"]
    L += [f"| {g} | {n} | {num(m)} | {num(s)} | {num(md)} |" for g, n, m, s, md in desc]

    L += ["", "### Supuestos", "", "**Normalidad (Shapiro-Wilk por grupo).** H₀: los datos del grupo son normales.", "",
          "| Grupo | W | p-valor | ¿Normal? |", "|---|---:|---:|---|"]
    L += [f"| {g} | {num(w, 4)} | {p_txt(p)} | {'Sí' if p > ALFA else 'No'} |" for g, w, p in normalidad]
    L += ["", f"**Homogeneidad de varianzas (Levene).** H₀: las varianzas son iguales. "
              f"Estadístico = {num(lev.statistic, 3)}, p = {p_txt(lev.pvalue)} → "
              f"{'se cumple' if lev.pvalue > ALFA else 'NO se cumple'}.", ""]
    no_normal = any(p <= ALFA for *_, p in normalidad)
    if no_normal or lev.pvalue <= ALFA:
        L += ["> Como algún supuesto no se cumple del todo, además del ANOVA clásico se reportan dos pruebas "
              "robustas: **ANOVA de Welch** (no exige varianzas iguales) y **Kruskal-Wallis** (no exige normalidad). "
              "Con muestras grandes el ANOVA es robusto a la falta de normalidad (teorema del límite central); "
              "si las tres pruebas coinciden, la conclusión es confiable.", ""]

    L += ["### Resultados", "", "| Prueba | Estadístico | gl | p-valor | Decisión (α = 0,05) |", "|---|---:|---|---:|---|",
          f"| ANOVA de un factor | F = {num(anova.statistic)} | {len(grupos) - 1}, {len(datos) - len(grupos)} | "
          f"{p_txt(anova.pvalue)} | {'Rechazar H₀' if anova.pvalue < ALFA else 'No rechazar H₀'} |",
          f"| ANOVA de Welch | F = {num(welch[0])} | {welch[1]}, {num(welch[2], 1)} | {p_txt(welch[3])} | "
          f"{'Rechazar H₀' if welch[3] < ALFA else 'No rechazar H₀'} |",
          f"| Kruskal-Wallis | H = {num(kruskal.statistic)} | {len(grupos) - 1} | {p_txt(kruskal.pvalue)} | "
          f"{'Rechazar H₀' if kruskal.pvalue < ALFA else 'No rechazar H₀'} |", "",
          f"**Tamaño del efecto:** η² = {num(eta2, 3)} → el factor explica el {num(eta2 * 100, 1)} % de la variación del "
          f"consumo diario ({'pequeño' if eta2 < 0.06 else 'mediano' if eta2 < 0.14 else 'grande'}).", "",
          "### Comparaciones por pares (Tukey HSD)", "", "| Comparación | Diferencia de medias (kWh) | p-valor | ¿Diferencia significativa? |",
          "|---|---:|---:|---|"]
    for i in range(len(grupos)):
        for j in range(i + 1, len(grupos)):
            dif = grupos[i].mean() - grupos[j].mean()
            p = tukey.pvalue[i, j]
            L.append(f"| {h['orden'][i]} − {h['orden'][j]} | {num(dif)} | {p_txt(p)} | {'Sí' if p < ALFA else 'No'} |")

    extra = []
    if h["id"] == "H1":
        lab, fes = grupos[0], grupos[2]
        t = stats.ttest_ind(fes, lab, equal_var=False, alternative="greater")
        extra = ["", "### Pregunta puntual: ¿en festivos se consume MÁS que en laborables?", "",
                 "- H₀: μ_festivo ≤ μ_laborable  ·  H₁: μ_festivo > μ_laborable (prueba t de Welch, una cola).",
                 f"- Media festivos = {num(fes.mean())} kWh (n = {len(fes)}), laborables = {num(lab.mean())} kWh "
                 f"(n = {len(lab)}). t = {num(t.statistic, 3)}, p = {p_txt(t.pvalue)} → "
                 + ("**se rechaza H₀**: en festivos se consume significativamente más." if t.pvalue < ALFA else
                    "**no se rechaza H₀**: con solo "
                    f"{len(fes)} festivos la diferencia no alcanza a ser estadísticamente significativa.")]
    L += extra
    L += [""]
    return L, {"id": h["id"], "titulo": h["titulo"], "variable": h["columna"], "h0": h["h0"], "h1": h["h1"],
               "f": anova.statistic, "p": anova.pvalue, "p_levene": lev.pvalue, "p_welch": welch[3],
               "p_kruskal": kruskal.pvalue, "eta2": eta2,
               "medias": {g: x.mean() for g, x in zip(h["orden"], grupos)},
               "grupos": [{"Hipotesis": h["id"], "Grupo": g, "Orden": i + 1, "Dias": len(x), "Media_kWh": x.mean(),
                           "Desviacion_kWh": x.std(ddof=1), "Mediana_kWh": float(np.median(x))}
                          for i, (g, x) in enumerate(zip(h["orden"], grupos))]}


def guardar_en_base(resumen):
    tabla_resumen = pd.DataFrame([{
        "Hipotesis": r["id"], "Factor": r["titulo"], "Variable": r["variable"], "H0": r["h0"], "H1": r["h1"],
        "F": r["f"], "P_ANOVA": r["p"], "P_Levene": r["p_levene"], "P_Welch": r["p_welch"],
        "P_Kruskal": r["p_kruskal"], "Eta2": r["eta2"],
        "Decision": "Rechazar H0" if r["p"] < ALFA else "No rechazar H0"} for r in resumen])
    tabla_grupos = pd.DataFrame([g for r in resumen for g in r["grupos"]])
    with sqlite3.connect(BASE_DATOS) as con:
        tabla_resumen.to_sql("ANOVA_Resumen", con, index=False, if_exists="replace")
        tabla_grupos.to_sql("ANOVA_Grupos", con, index=False, if_exists="replace")
    tabla_resumen.to_csv(BASE_DATOS.parent / "ANOVA_Resumen.csv", index=False, encoding="utf-8-sig")
    tabla_grupos.to_csv(BASE_DATOS.parent / "ANOVA_Grupos.csv", index=False, encoding="utf-8-sig")
    print("Resultados guardados en la base de datos (ANOVA_Resumen, ANOVA_Grupos) y en CSV")


def main():
    dias, total = cargar_dias()
    print(f"Días con medición: {total}; días completos (24 h) usados: {len(dias)}")

    lineas = ["# Resultados del ANOVA · Consumo diario de energía", "",
              "Generado por `anova/anova_energia.py` a partir de las tablas limpias del ETL.", "",
              f"- **Unidad de análisis:** el día. Variable dependiente: consumo total del día (kWh).",
              f"- **Datos:** {len(dias)} días completos (24 horas medidas) de {total} días con medición. Los días con "
              "horas faltantes se excluyen porque su total sería artificialmente bajo.",
              "- **Nivel de significancia:** α = 0,05.", ""]
    resumen = []
    for h in HIPOTESIS:
        L, r = analizar(h, dias)
        lineas += L
        resumen.append(r)
        print(f"{h['id']} {h['titulo']}: F p = {p_txt(r['p'])}, eta2 = {num(r['eta2'], 3)}")

    lineas += ["## Conclusiones", ""]
    for r in resumen:
        orden = sorted(r["medias"].items(), key=lambda kv: kv[1], reverse=True)
        lineas.append(f"- **{r['id']} · {r['titulo']}:** "
                      + ("hay diferencias significativas" if r["p"] < ALFA else "no hay diferencias significativas")
                      + f" (p {p_txt(r['p'])}, η² = {num(r['eta2'], 3)}). Mayor consumo: {orden[0][0]} "
                      f"({num(orden[0][1])} kWh/día); menor: {orden[-1][0]} ({num(orden[-1][1])} kWh/día).")
    (SALIDA / "resultados_anova.md").write_text("\n".join(lineas) + "\n", encoding="utf-8")
    guardar_en_base(resumen)
    print(f"Listo: {SALIDA / 'resultados_anova.md'}")


if __name__ == "__main__":
    main()
