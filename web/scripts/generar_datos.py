"""Genera web/data/dashboard.js a partir de las tablas de datos_limpios/ (salida del ETL).

Replica las medidas del dashboard de Power BI:
  - Energía Total kWh            = SUM(Fact_Consumo_Hora[Energia_Activa_kWh])
  - Costo Energía EUR            = SUMX(energía × Dim_Tarifa[Precio_kWh_Con_Impuestos_EUR])
  - Consumo Promedio Diario kWh  = Energía Total / días con medición
  - Potencia Máxima kW           = MAX(Fact_Consumo_Hora[Potencia_Max_kW])

Uso (desde la raíz del repo, después de correr etl/etl_energia.py):
    python web/scripts/generar_datos.py
"""
import json
from pathlib import Path

import pandas as pd

RAIZ = Path(__file__).resolve().parents[2]
LIMPIOS = RAIZ / "datos_limpios"
SALIDA = RAIZ / "web" / "data" / "dashboard.js"


def leer(nombre):
    return pd.read_csv(LIMPIOS / f"{nombre}.csv", encoding="utf-8-sig")


fecha = leer("Dim_Fecha")
tarifa = leer("Dim_Tarifa")
hecho = leer("Fact_Consumo_Hora")
electro = leer("Fact_Consumo_Electrodomestico")
dim_electro = leer("Dim_Electrodomestico")
clima = leer("Dim_Clima")
hora = leer("Dim_Hora")

h = hecho.merge(fecha, on="Fecha").merge(
    tarifa[["ID_Periodo_Tarifa", "Precio_kWh_Con_Impuestos_EUR"]], on="ID_Periodo_Tarifa"
)
h["Costo"] = h["Energia_Activa_kWh"] * h["Precio_kWh_Con_Impuestos_EUR"]

# Celdas AñoMes × Estación: permiten filtrar por Año y Estación en la web y recalcular los KPI.
celdas = (
    h.groupby(["AñoMes", "Año", "Mes", "Estación"])
    .agg(e=("Energia_Activa_kWh", "sum"), c=("Costo", "sum"),
         d=("Fecha", "nunique"), p=("Potencia_Max_kW", "max"))
    .reset_index()
    .sort_values(["AñoMes", "Estación"])
)

dias_total = h["Fecha"].nunique()
kpis = {
    "energia_kwh": round(h["Energia_Activa_kWh"].sum(), 2),
    "costo_eur": round(h["Costo"].sum(), 2),
    "promedio_diario_kwh": round(h["Energia_Activa_kWh"].sum() / dias_total, 2),
    "potencia_max_kw": round(h["Potencia_Max_kW"].max(), 3),
    "dias_medidos": int(dias_total),
    "horas_medidas": int(len(h)),
}

# Perfil horario: consumo promedio por hora del día
perfil = (
    h.groupby("Hora")["Energia_Activa_kWh"].mean().reset_index()
    .merge(hora[["Hora", "Etiqueta_Hora", "Franja_Horaria"]], on="Hora")
)

# Proporción por zona / electrodoméstico
zonas = (
    electro.groupby("ID_Electrodomestico")["Energia_kWh"].sum().reset_index()
    .merge(dim_electro, on="ID_Electrodomestico")
)
zonas["pct"] = zonas["Energia_kWh"] / zonas["Energia_kWh"].sum() * 100

# Consumo diario por tipo de día y por estación
diario = h.groupby(["Fecha", "TipoDía", "Estación", "Estación_Orden"])["Energia_Activa_kWh"].sum().reset_index()
tipo_dia = diario.groupby("TipoDía")["Energia_Activa_kWh"].agg(["mean", "count"]).reset_index()
estacion = (
    diario.groupby(["Estación", "Estación_Orden"])["Energia_Activa_kWh"].mean().reset_index()
    .sort_values("Estación_Orden")
)

# Clima: consumo diario promedio por categoría térmica
dc = diario.merge(clima[["Fecha", "Temp_Media_C", "Categoria_Termica", "Categoria_Termica_Orden"]], on="Fecha")
termica = (
    dc.groupby(["Categoria_Termica", "Categoria_Termica_Orden"])
    .agg(kwh=("Energia_Activa_kWh", "mean"), temp=("Temp_Media_C", "mean"), dias=("Fecha", "count"))
    .reset_index().sort_values("Categoria_Termica_Orden")
)

datos = {
    "kpis": kpis,
    "celdas": [
        {"am": r.AñoMes, "a": int(r.Año), "m": int(r.Mes), "s": r.Estación,
         "e": round(r.e, 3), "c": round(r.c, 3), "d": int(r.d), "p": round(r.p, 3)}
        for r in celdas.itertuples()
    ],
    "perfil_horario": [
        {"hora": int(r.Hora), "etiqueta": r.Etiqueta_Hora, "franja": r.Franja_Horaria,
         "kwh": round(r.Energia_Activa_kWh, 4)}
        for r in perfil.itertuples()
    ],
    "zonas": [
        {"zona": r.Zona, "equipos": r.Equipos, "kwh": round(r.Energia_kWh, 1), "pct": round(r.pct, 2)}
        for r in zonas.itertuples()
    ],
    "tipo_dia": [
        {"tipo": r.TipoDía, "kwh_dia": round(r.mean, 2), "dias": int(r.count)} for r in tipo_dia.itertuples()
    ],
    "estacion": [{"estacion": r.Estación, "kwh_dia": round(r.Energia_Activa_kWh, 2)} for r in estacion.itertuples()],
    "termica": [
        {"categoria": r.Categoria_Termica, "kwh_dia": round(r.kwh, 2), "temp": round(r.temp, 1), "dias": int(r.dias)}
        for r in termica.itertuples()
    ],
    "tarifas": [
        {"periodo": r.ID_Periodo_Tarifa, "precio": r.Precio_kWh_Con_Impuestos_EUR} for r in tarifa.itertuples()
    ],
}

SALIDA.parent.mkdir(parents=True, exist_ok=True)
# Se guarda como .js (window.DASHBOARD = ...) para que la página funcione abriendo index.html con doble clic.
SALIDA.write_text("window.DASHBOARD = " + json.dumps(datos, ensure_ascii=False) + ";\n", encoding="utf-8")
print(f"OK -> {SALIDA}")
print(json.dumps(kpis, ensure_ascii=False))
