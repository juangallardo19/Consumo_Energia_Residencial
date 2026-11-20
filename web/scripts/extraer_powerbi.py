"""Extrae los datos de la página web DIRECTAMENTE del informe de Power BI (Dashboard_Energia.pbix).

El .pbix es un zip; adentro, `DataModel` guarda el modelo tabular (VertiPaq) con las 7 tablas del modelo
estrella, las 12 medidas DAX y las columnas calculadas (Nivel_Consumo, Consumo_Dia_kWh...). La librería
`pbixray` descomprime ese modelo, así que la web usa exactamente las mismas filas que ve el reporte
publicado (el archivo `Connections` del .pbix apunta al dataset y al informe publicados en Power BI Service).

Cada agregado replica una medida del reporte:
  Energía Total kWh             = SUM(Fact_Consumo_Hora[Energia_Activa_kWh])
  Horas Medidas                 = COUNTROWS(Fact_Consumo_Hora)
  Días con Medición             = DISTINCTCOUNT(Fact_Consumo_Hora[Fecha])
  Consumo Promedio por Hora kWh = DIVIDE([Energía Total kWh], [Horas Medidas])
  Consumo Promedio Diario kWh   = AVERAGEX(VALUES(Dim_Fecha[Fecha]), [Energía Total kWh])
  Potencia Máxima kW            = MAX(Fact_Consumo_Hora[Potencia_Max_kW])
  Costo Energía EUR             = SUMX(Fact_Consumo_Hora, Energia × RELATED(Dim_Tarifa[Precio_kWh_Con_Impuestos_EUR]))
  Umbral Inusual kWh            = promedio + 2 × STDEV.P de la energía horaria (sobre ALL)
  Horas Inusuales               = horas con energía > umbral
  Energía Electrodoméstico kWh  = SUM(Fact_Consumo_Electrodomestico[Energia_kWh])

La web guarda los datos al nivel más fino que necesitan los segmentadores Año y Estación, y la página
recalcula las medidas en el navegador igual que Power BI.

Uso (desde la raíz del repo):
    pip install pbixray scipy pandas
    python web/scripts/extraer_powerbi.py            # usa Dashboard_Energia.pbix de la raíz
    python web/scripts/extraer_powerbi.py ruta.pbix  # u otro archivo
"""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from pbixray import PBIXRay
from scipy import stats

RAIZ = Path(__file__).resolve().parents[2]
PBIX = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "Dashboard_Energia.pbix"
SALIDA = RAIZ / "web" / "src" / "app" / "data" / "powerbi.json"
ALFA = 0.05

ESTACIONES = ["Invierno", "Primavera", "Verano", "Otoño"]
TIPOS = ["Laborable", "Fin de semana", "Festivo"]
NIVELES = ["Bajo", "Medio", "Alto"]
CATEGORIAS = ["Frío", "Templado", "Cálido"]
DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]


def r(x, d=3):
    return None if x is None or pd.isna(x) else round(float(x), d)


def idx(lista, valor):
    return None if pd.isna(valor) else lista.index(valor)


# ---------------------------------------------------------------- lectura del modelo
modelo = PBIXRay(str(PBIX))
T = {t: modelo.get_table(t) for t in [
    "Fact_Consumo_hora", "Fact_Consumo_Electrodomestico", "Dim_Fecha", "Dim_Hora",
    "Dim_Clima", "Dim_Tarifa", "Dim_Electrodomestico"]}
hecho, electro = T["Fact_Consumo_hora"], T["Fact_Consumo_Electrodomestico"]
fecha, clima, tarifa, dim_electro = T["Dim_Fecha"], T["Dim_Clima"], T["Dim_Tarifa"], T["Dim_Electrodomestico"]

conexion = {}
try:
    import zipfile
    with zipfile.ZipFile(PBIX) as z:
        conexion = json.loads(z.read("Connections").decode("utf-8-sig"))["RemoteArtifacts"][0]
except Exception:  # un .pbix que nunca se publicó no trae Connections
    pass

h = (hecho.merge(fecha, on="Fecha", how="left")
     .merge(tarifa[["ID_Periodo_Tarifa", "Precio_kWh_Con_Impuestos_EUR"]], on="ID_Periodo_Tarifa", how="left"))
h["Costo"] = h["Energia_Activa_kWh"] * h["Precio_kWh_Con_Impuestos_EUR"]
assert h["Año"].notna().all() and h["Costo"].notna().all(), "Hay hechos sin fecha o sin tarifa"

# ---------------------------------------------------------------- KPIs globales
dias_energia = h.groupby("Fecha")["Energia_Activa_kWh"].sum()
media_h = hecho["Energia_Activa_kWh"].mean()
desv_h = hecho["Energia_Activa_kWh"].std(ddof=0)  # STDEV.P
umbral = media_h + 2 * desv_h
kpis = {
    "energia_kwh": r(h["Energia_Activa_kWh"].sum(), 2),
    "costo_eur": r(h["Costo"].sum(), 2),
    "promedio_diario_kwh": r(dias_energia.mean(), 4),
    "promedio_hora_kwh": r(h["Energia_Activa_kWh"].mean(), 4),
    "potencia_max_kw": r(h["Potencia_Max_kW"].max(), 3),
    "dias_medidos": int(dias_energia.size),
    "horas_medidas": int(len(h)),
    "dias_calendario": int(len(fecha)),
    "fecha_inicio": str(h["Fecha"].min().date()),
    "fecha_fin": str(h["Fecha"].max().date()),
    "umbral_inusual_kwh": r(umbral, 4),
    "umbral_media_kwh": r(media_h, 4),
    "umbral_desv_kwh": r(desv_h, 4),
    "horas_inusuales": int((hecho["Energia_Activa_kWh"] > umbral).sum()),
}

# ---------------------------------------------------------------- meses (AñoMes × Estación)
zona_mes = (electro.merge(fecha[["Fecha", "AñoMes"]], on="Fecha")
            .pivot_table(index="AñoMes", columns="ID_Electrodomestico", values="Energia_kWh", aggfunc="sum"))
inus_mes = h[h["Energia_Activa_kWh"] > umbral].groupby("AñoMes").size()
meses = (h.groupby(["AñoMes", "Año", "Mes", "Estación"])
         .agg(e=("Energia_Activa_kWh", "sum"), c=("Costo", "sum"), d=("Fecha", "nunique"),
              p=("Potencia_Max_kW", "max"), n=("Fecha", "size"))
         .reset_index().sort_values("AñoMes"))
assert meses["AñoMes"].is_unique, "Un mes quedó en dos estaciones"
lista_meses = [{
    "am": m.AñoMes, "a": int(m.Año), "m": int(m.Mes), "s": ESTACIONES.index(m.Estación),
    "e": r(m.e), "c": r(m.c), "d": int(m.d), "h": int(m.n), "p": r(m.p),
    "z": [r(zona_mes.loc[m.AñoMes, i], 2) for i in sorted(zona_mes.columns)],
    "u": int(inus_mes.get(m.AñoMes, 0)),
} for m in meses.itertuples()]

# ---------------------------------------------------------------- días (Dim_Fecha con medición)
horas_dia = h.groupby("Fecha").size()
dias = (fecha[fecha["Consumo_Dia_kWh"].notna()]
        .merge(clima[["Fecha", "Temp_Media_C", "Categoria_Termica"]], on="Fecha", how="left")
        .sort_values("Fecha"))
assert len(dias) == kpis["dias_medidos"]
lista_dias = [[
    str(d.Fecha.date()), ESTACIONES.index(d.Estación), TIPOS.index(d.TipoDía), r(d.Consumo_Dia_kWh),
    NIVELES.index(d.Nivel_Consumo), r(d.Temp_Media_C, 1), idx(CATEGORIAS, d.Categoria_Termica),
    int(horas_dia[d.Fecha]), int(d.DíaSemana) - 1,
] for d in dias.itertuples()]

# ---------------------------------------------------------------- horas (Año × Estación × DíaSemana × Hora)
horas = (h.groupby(["Año", "Estación", "DíaSemana", "Hora"])["Energia_Activa_kWh"]
         .agg(suma="sum", n="size").reset_index())
lista_horas = [[int(x.Año), ESTACIONES.index(x.Estación), int(x.DíaSemana) - 1, int(x.Hora), r(x.suma, 4), int(x.n)]
               for x in horas.itertuples()]

# ---------------------------------------------------------------- horas inusuales (eventos)
inus = h[h["Energia_Activa_kWh"] > umbral].sort_values("Energia_Activa_kWh", ascending=False)
lista_inus = [[str(x.Fecha.date()), int(x.Hora), r(x.Energia_Activa_kWh), r(x.Potencia_Max_kW),
               TIPOS.index(x.TipoDía), ESTACIONES.index(x.Estación)] for x in inus.itertuples()]

# ---------------------------------------------------------------- dimensiones pequeñas
zonas = [{"id": int(z.ID_Electrodomestico), "zona": z.Zona, "equipos": z.Equipos, "origen": z.Origen}
         for z in dim_electro.sort_values("ID_Electrodomestico").itertuples()]
tarifas = [{"periodo": t.ID_Periodo_Tarifa, "sin_impuestos": r(t.Precio_kWh_Sin_Impuestos_EUR, 4),
            "con_impuestos": r(t.Precio_kWh_Con_Impuestos_EUR, 4), "estimado": t.Es_Estimado == "Sí",
            "origen": t.Periodo_Origen_Precio}
           for t in tarifa.sort_values("ID_Periodo_Tarifa").itertuples()]
franjas = (T["Dim_Hora"].sort_values("Hora")[["Hora", "Etiqueta_Hora", "Franja_Horaria"]])
lista_franjas = [[int(f.Hora), f.Etiqueta_Hora, f.Franja_Horaria] for f in franjas.itertuples()]
medidas = [{"nombre": m.Name, "dax": m.Expression.strip()} for m in modelo.dax_measures.itertuples()]

# ---------------------------------------------------------------- ANOVA con los días del modelo
# Unidad: el día completo (24 horas medidas); un día con horas faltantes tendría un total artificialmente bajo.
completos = dias[dias["Fecha"].map(horas_dia) == 24].rename(columns={"Consumo_Dia_kWh": "kwh"})

HIPOTESIS = [
    {
        "id": "H1", "titulo": "Tipo de día", "columna": "TipoDía", "orden": TIPOS, "req": [3],
        "pregunta": "¿En los días festivos y fines de semana se consume más energía que en los laborables?",
        "porque": "Entre semana la casa pasa buena parte del día vacía; los fines de semana y festivos la familia "
                  "está en casa, cocina más y usa lavadora y calefacción en horas en que normalmente no lo haría. "
                  "Si la diferencia es real, las campañas de ahorro deben apuntar a esos días y no al promedio. "
                  "Además responde el requerimiento 3 (laborables vs fines de semana) con una prueba formal y no "
                  "solo comparando dos barras.",
        "h0": "El consumo diario promedio es igual en días laborables, fines de semana y festivos "
              "(μ laborable = μ fin de semana = μ festivo).",
        "h1": "Al menos un tipo de día tiene un consumo diario promedio distinto.",
    },
    {
        "id": "H2", "titulo": "Estación del año", "columna": "Estación", "orden": ESTACIONES, "req": [6, 7],
        "pregunta": "¿El consumo diario cambia según la estación del año?",
        "porque": "El dashboard muestra barras de invierno mucho más altas que las de verano, pero una gráfica no "
                  "prueba que la diferencia no sea azar. El submedidor 3 incluye calentador de agua y aire "
                  "acondicionado, y la casa está en Francia, con inviernos fríos: esperamos que la calefacción "
                  "dispare el consumo. Confirmarlo justifica priorizar el aislamiento y el control de la "
                  "calefacción (requerimientos 6 y 7).",
        "h0": "El consumo diario promedio es igual en las cuatro estaciones "
              "(μ invierno = μ primavera = μ verano = μ otoño).",
        "h1": "Al menos una estación tiene un consumo diario promedio distinto.",
    },
    {
        "id": "H3", "titulo": "Categoría térmica del día", "columna": "Categoria_Termica", "orden": CATEGORIAS,
        "req": [6, 7],
        "pregunta": "¿La temperatura del día influye en cuánta energía consume la casa?",
        "porque": "La estación es un calendario; la temperatura es la causa física. Cruzamos el consumo con el clima "
                  "real de Meteostat (estación París-Montsouris) para ver si los días fríos, sin importar el mes, "
                  "consumen más. Si se confirma, el consumo se puede anticipar con el pronóstico del tiempo y "
                  "programar la calefacción según la temperatura y no según la fecha.",
        "h0": "El consumo diario promedio es igual en días fríos (< 10 °C), templados (10-20 °C) y cálidos (≥ 20 °C).",
        "h1": "Al menos una categoría térmica tiene un consumo diario promedio distinto.",
    },
]


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


def caja(x):
    q1, med, q3 = np.percentile(x, [25, 50, 75])
    iqr = q3 - q1
    dentro = x[(x >= q1 - 1.5 * iqr) & (x <= q3 + 1.5 * iqr)]
    se = x.std(ddof=1) / np.sqrt(len(x))
    t = stats.t.ppf(0.975, len(x) - 1)
    atipicos = np.sort(x[(x < dentro.min()) | (x > dentro.max())])
    return {"min": r(dentro.min(), 2), "q1": r(q1, 2), "mediana": r(med, 2), "q3": r(q3, 2), "max": r(dentro.max(), 2),
            "ic_inf": r(x.mean() - t * se, 3), "ic_sup": r(x.mean() + t * se, 3),
            "atipicos": [r(v, 2) for v in atipicos]}


def histograma(grupos, bins):
    return [[int(c) for c in np.histogram(g, bins=bins)[0]] for g in grupos]


anova = []
todos_kwh = completos["kwh"].to_numpy(dtype=float)
bordes = np.linspace(0, np.ceil(todos_kwh.max() / 5) * 5, int(np.ceil(todos_kwh.max() / 5)) + 1)
for hip in HIPOTESIS:
    datos = completos.dropna(subset=[hip["columna"]])
    grupos = [datos.loc[datos[hip["columna"]] == g, "kwh"].to_numpy(dtype=float) for g in hip["orden"]]
    N, k = len(datos), len(grupos)
    f_cls = stats.f_oneway(*grupos)
    welch = welch_anova(grupos)
    kw = stats.kruskal(*grupos)
    lev = stats.levene(*grupos, center="median")
    media_total = np.concatenate(grupos).mean()
    ss_entre = sum(len(g) * (g.mean() - media_total) ** 2 for g in grupos)
    ss_dentro = sum(((g - g.mean()) ** 2).sum() for g in grupos)
    tukey = stats.tukey_hsd(*grupos)
    ic = tukey.confidence_interval(confidence_level=0.95)
    pares = []
    for i in range(k):
        for j in range(i + 1, k):
            pares.append({"a": hip["orden"][i], "b": hip["orden"][j],
                          "dif": r(grupos[i].mean() - grupos[j].mean(), 3),
                          "ic_inf": r(ic.low[i, j], 3), "ic_sup": r(ic.high[i, j], 3),
                          "p": float(tukey.pvalue[i, j]), "significativa": bool(tukey.pvalue[i, j] < ALFA)})
    res = {
        **{key: hip[key] for key in ["id", "titulo", "columna", "pregunta", "porque", "h0", "h1", "req"]},
        "n_total": N, "alfa": ALFA,
        "grupos": [{"grupo": g, "n": len(x), "media": r(x.mean(), 3), "desv": r(x.std(ddof=1), 3),
                    **caja(x), "shapiro_w": r(stats.shapiro(x).statistic, 4),
                    "shapiro_p": float(stats.shapiro(x).pvalue)} for g, x in zip(hip["orden"], grupos)],
        "levene": {"estadistico": r(lev.statistic, 3), "p": float(lev.pvalue)},
        "tabla": {"ss_entre": r(ss_entre, 2), "ss_dentro": r(ss_dentro, 2), "gl_entre": k - 1, "gl_dentro": N - k,
                  "ms_entre": r(ss_entre / (k - 1), 2), "ms_dentro": r(ss_dentro / (N - k), 3)},
        "anova": {"f": r(f_cls.statistic, 3), "p": float(f_cls.pvalue),
                  "f_critico": r(stats.f.ppf(1 - ALFA, k - 1, N - k), 3)},
        "welch": {"f": r(welch[0], 3), "gl1": welch[1], "gl2": r(welch[2], 1), "p": float(welch[3])},
        "kruskal": {"h": r(kw.statistic, 3), "p": float(kw.pvalue)},
        "eta2": r(ss_entre / (ss_entre + ss_dentro), 4),
        "tukey": pares,
        "histograma": {"bordes": [r(b, 1) for b in bordes], "conteos": histograma(grupos, bordes)},
    }
    if hip["id"] == "H1":
        lab, fes = grupos[0], grupos[2]
        t = stats.ttest_ind(fes, lab, equal_var=False, alternative="greater")
        res["extra"] = {"titulo": "¿En festivos se consume MÁS que en laborables?",
                        "h0": "μ festivo ≤ μ laborable", "h1": "μ festivo > μ laborable",
                        "prueba": "t de Welch, una cola", "t": r(t.statistic, 3), "p": float(t.pvalue)}
    anova.append(res)

# ---------------------------------------------------------------- salida
datos = {
    "meta": {
        "fuente": PBIX.name,
        "dataset_id": conexion.get("DatasetId"), "reporte_id": conexion.get("ReportId"),
        "generado": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "paginas": ["Resumen", "Patrones horarios", "Estaciones y clima", "Electrodomésticos y costo",
                    "Eventos inusuales y clasificación"],
        "dias_anova": int(len(completos)),
    },
    "kpis": kpis,
    "estaciones": ESTACIONES, "tipos": TIPOS, "niveles": NIVELES, "categorias": CATEGORIAS,
    "dias_semana": DIAS_SEMANA, "franjas": lista_franjas,
    "zonas": zonas, "tarifas": tarifas, "medidas": medidas,
    "meses": lista_meses,
    "dias": lista_dias,
    "horas": lista_horas,
    "inusuales": lista_inus,
    "anova": anova,
}
SALIDA.parent.mkdir(parents=True, exist_ok=True)
SALIDA.write_text(json.dumps(datos, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"OK -> {SALIDA.relative_to(RAIZ)} ({SALIDA.stat().st_size / 1024:.0f} KB)")
print(json.dumps(kpis, ensure_ascii=False))
for a in anova:
    print(a["id"], "N", a["n_total"], "F", a["anova"]["f"], "p", a["anova"]["p"], "eta2", a["eta2"],
          [(g["grupo"], g["n"], g["media"]) for g in a["grupos"]])
