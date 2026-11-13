"""Validación independiente del ETL: ¿quedaron bien los datos limpios?

Se ejecuta DESPUÉS de etl_energia.py y revisa los resultados con pandas (otra herramienta distinta a Spark),
para no "corregirse la tarea a sí mismo". Cada prueba imprime PASA o FALLA; si alguna falla el script
termina con código 1 (así se puede usar como compuerta antes de cargar a Power BI).

Pruebas por dimensión de calidad:
    Completitud ........ ninguna tabla tiene nulos; balance leídas = aceptadas + rechazadas
    Validez ............ sin negativos; rangos físicos; tipos correctos
    Unicidad ........... llaves primarias sin repetir
    Integridad ref. .... toda llave foránea de los hechos existe en su dimensión
    Consistencia ....... suma por electrodoméstico = total; calendario sin huecos
    Exactitud .......... conciliación: se recalcula desde el archivo CRUDO y se compara con el resultado

Uso:   python etl/validar_calidad.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

RAIZ = Path(__file__).resolve().parent.parent
LIMPIOS = RAIZ / "datos_limpios"
CRUDO = RAIZ / "datos_sucios" / "household_power_consumption.txt"
TOL = 1e-6

resultados = []


def prueba(dimension, nombre, ok, detalle=""):
    ok = bool(ok)
    resultados.append((dimension, nombre, ok, detalle))
    print(f"[{'PASA' if ok else 'FALLA'}] {dimension:16s} {nombre}" + (f"  ({detalle})" if detalle else ""))


def leer(nombre):
    return pd.read_parquet(LIMPIOS / "parquet" / f"{nombre}.parquet")


def main():
    t = {n: leer(n) for n in ["Dim_Fecha", "Dim_Hora", "Dim_Clima", "Dim_Tarifa", "Dim_Electrodomestico",
                              "Fact_Consumo_Hora", "Fact_Consumo_Electrodomestico"]}
    m = json.loads((LIMPIOS / "metricas_etl.json").read_text("utf-8"))
    fact, largo = t["Fact_Consumo_Hora"], t["Fact_Consumo_Electrodomestico"]
    for df in t.values():
        for c in df.columns:
            if c.startswith("Fecha"):
                df[c] = pd.to_datetime(df[c])

    # ------------------------------------------------------------------ COMPLETITUD
    for n, df in t.items():
        nulos = int(df.isna().sum().sum())
        prueba("Completitud", f"{n} sin valores nulos", nulos == 0, f"{nulos} nulos")
    rech = pd.read_csv(RAIZ / "rechazados" / "energia_rechazados.csv")
    balance = m["energia_minutos_validos"] + len(rech) == m["energia_filas_leidas"]
    prueba("Completitud", "Minutos leídos = válidos + rechazados (no se pierde ni inventa nada)", balance,
           f"{m['energia_filas_leidas']:,} = {m['energia_minutos_validos']:,} + {len(rech):,}")
    prueba("Completitud", "Toda fila rechazada tiene motivo", rech["Motivo"].notna().all())
    cobertura = fact["Fecha"].dt.normalize().isin(t["Dim_Clima"]["Fecha"]).mean()
    prueba("Completitud", "Clima disponible para >= 90 % de las horas con consumo", cobertura >= 0.90, f"{cobertura:.1%}")

    # ------------------------------------------------------------------ VALIDEZ
    medidas = [c for c in fact.columns if c.endswith(("kWh", "kVArh", "kW", "_V", "_A"))]
    negativos = int((fact[medidas] < 0).sum().sum()) + int((largo["Energia_kWh"] < 0).sum())
    prueba("Validez", "Sin valores negativos en las medidas", negativos == 0, f"{negativos} negativos")
    prueba("Validez", "Voltaje medio entre 200 y 260 V", fact["Voltaje_Medio_V"].between(200, 260).all(),
           f"{fact['Voltaje_Medio_V'].min()}-{fact['Voltaje_Medio_V'].max()} V")
    prueba("Validez", "Minutos medidos por hora entre 45 y 60", fact["Minutos_Medidos"].between(45, 60).all())
    prueba("Validez", "Energía de una hora <= potencia máxima x 1 h",
           (fact["Energia_Activa_kWh"] <= fact["Potencia_Max_kW"] + TOL).all())
    cl = t["Dim_Clima"]
    prueba("Validez", "Temperatura mínima <= media <= máxima",
           ((cl["Temp_Min_C"] <= cl["Temp_Media_C"] + TOL) & (cl["Temp_Media_C"] <= cl["Temp_Max_C"] + TOL)).all())
    prueba("Validez", "Humedad entre 0 y 100 %", cl["Humedad_Media_Pct"].between(0, 100).all())
    prueba("Validez", "Precios del kWh entre 0 y 1 EUR y con impuestos >= sin impuestos",
           (t["Dim_Tarifa"]["Precio_kWh_Sin_Impuestos_EUR"].between(0, 1)
            & (t["Dim_Tarifa"]["Precio_kWh_Con_Impuestos_EUR"] >= t["Dim_Tarifa"]["Precio_kWh_Sin_Impuestos_EUR"])).all())

    # ------------------------------------------------------------------ UNICIDAD (llaves primarias)
    pks = {"Dim_Fecha": ["Fecha"], "Dim_Hora": ["Hora"], "Dim_Clima": ["Fecha"], "Dim_Tarifa": ["ID_Periodo_Tarifa"],
           "Dim_Electrodomestico": ["ID_Electrodomestico"], "Fact_Consumo_Hora": ["Fecha", "Hora"],
           "Fact_Consumo_Electrodomestico": ["Fecha", "Hora", "ID_Electrodomestico"]}
    for n, pk in pks.items():
        dup = int(t[n].duplicated(pk).sum())
        prueba("Unicidad", f"{n}: llave {' + '.join(pk)} sin repetir", dup == 0, f"{dup} repetidas")

    # ------------------------------------------------------------------ INTEGRIDAD REFERENCIAL (FK -> PK)
    fks = [("Fact_Consumo_Hora", "Fecha", "Dim_Fecha", "Fecha"),
           ("Fact_Consumo_Hora", "Hora", "Dim_Hora", "Hora"),
           ("Fact_Consumo_Hora", "ID_Periodo_Tarifa", "Dim_Tarifa", "ID_Periodo_Tarifa"),
           ("Fact_Consumo_Electrodomestico", "Fecha", "Dim_Fecha", "Fecha"),
           ("Fact_Consumo_Electrodomestico", "Hora", "Dim_Hora", "Hora"),
           ("Fact_Consumo_Electrodomestico", "ID_Electrodomestico", "Dim_Electrodomestico", "ID_Electrodomestico"),
           ("Dim_Clima", "Fecha", "Dim_Fecha", "Fecha")]
    for hija, fk, padre, pk in fks:
        huerfanas = int((~t[hija][fk].isin(t[padre][pk])).sum())
        prueba("Integridad ref.", f"{hija}.{fk} -> {padre}.{pk}", huerfanas == 0, f"{huerfanas} huérfanas")

    # ------------------------------------------------------------------ CONSISTENCIA
    dif = abs(largo["Energia_kWh"].sum() - fact["Energia_Activa_kWh"].sum())
    prueba("Consistencia", "Suma por electrodoméstico = energía total", dif < 0.01,
           f"diferencia {dif:.4f} kWh de {fact['Energia_Activa_kWh'].sum():,.1f}")
    por_hora = largo.groupby(["Fecha", "Hora"])["Energia_kWh"].sum().reset_index().merge(fact, on=["Fecha", "Hora"])
    peor = (por_hora["Energia_kWh"] - por_hora["Energia_Activa_kWh"]).abs().max()
    prueba("Consistencia", "En cada hora: cocina + lavandería + calentador + resto = total", peor < 1e-3,
           f"máxima diferencia {peor:.6f} kWh")
    fechas = t["Dim_Fecha"]["Fecha"].sort_values()
    prueba("Consistencia", "Dim_Fecha es un calendario continuo de años completos",
           (fechas.diff().dropna() == pd.Timedelta(days=1)).all() and fechas.iloc[0].strftime("%m-%d") == "01-01"
           and fechas.iloc[-1].strftime("%m-%d") == "12-31")
    festivos = t["Dim_Fecha"].groupby(t["Dim_Fecha"]["Fecha"].dt.year)["EsFestivo"].apply(lambda s: (s == "Sí").sum())
    prueba("Consistencia", "Entre 10 y 11 festivos por año", festivos.between(10, 11).all(), festivos.to_dict())
    d = t["Dim_Fecha"]
    prueba("Consistencia", "TipoDía coherente (festivo > fin de semana > laborable)",
           ((d["EsFestivo"] == "Sí") == (d["TipoDía"] == "Festivo")).all()
           and ((d["TipoDía"] == "Laborable") == ((d["EsFestivo"] == "No") & (d["EsFinDeSemana"] == "No"))).all())

    # ------------------------------------------------------------------ EXACTITUD (conciliación con el origen)
    total = fact["Energia_Activa_kWh"].sum()
    prueba("Exactitud", "Energía cargada = energía que calculó el ETL (sin pérdidas al cargar)",
           abs(total - m["energia_kwh_horas_aceptadas"]) < 0.5, f"{total:,.3f} vs {m['energia_kwh_horas_aceptadas']:,.3f} kWh")

    # Recalcular algunos días DIRECTAMENTE desde el archivo crudo con pandas y comparar hora por hora
    crudo = pd.read_csv(CRUDO, sep=";", dtype=str, na_values=["?", ""])
    crudo["Fecha"] = pd.to_datetime(crudo["Date"], format="%d/%m/%Y")
    dias = ["2007-02-10", "2008-07-14", "2009-12-24", "2010-06-01"]
    crudo = crudo[crudo["Fecha"].isin(pd.to_datetime(dias))].dropna()
    crudo["Hora"] = crudo["Time"].str[:2].astype(int)
    crudo["kWh"] = crudo["Global_active_power"].astype(float) / 60
    ref = crudo.groupby(["Fecha", "Hora"])["kWh"].sum().reset_index()
    comp = ref.merge(fact, on=["Fecha", "Hora"], how="inner")
    peor = (comp["kWh"] - comp["Energia_Activa_kWh"]).abs().max()
    prueba("Exactitud", f"Recalculo desde el crudo de {len(dias)} días ({len(comp)} horas) coincide con el hecho",
           len(comp) > 0 and peor < 1e-4, f"máxima diferencia {peor:.6f} kWh")

    # ------------------------------------------------------------------ RESUMEN
    fallas = [r for r in resultados if not r[2]]
    lineas = ["# Reporte de validación", "", f"Pruebas: {len(resultados)} | Pasan: {len(resultados) - len(fallas)} | "
              f"Fallan: {len(fallas)}", "", "| Resultado | Dimensión | Prueba | Detalle |", "|---|---|---|---|"]
    lineas += [f"| {'PASA' if ok else '**FALLA**'} | {dim} | {nom} | {det} |" for dim, nom, ok, det in resultados]
    (LIMPIOS / "reporte_validacion.md").write_text("\n".join(lineas) + "\n", encoding="utf-8")
    print(f"\n{len(resultados) - len(fallas)}/{len(resultados)} pruebas pasan. Detalle en datos_limpios/reporte_validacion.md")
    sys.exit(1 if fallas else 0)


if __name__ == "__main__":
    main()
