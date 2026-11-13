# Proyecto 5 · Análisis de Consumo de Energía Eléctrica Residencial

**Grupo 7:** Juan Pablo Gallardo, Sebastián López y Juan Sebastián Castaño
**Materia:** Ingeniería de Datasets · Proyecto final

**Objetivo:** extraer y analizar patrones de consumo eléctrico residencial para identificar oportunidades
de ahorro energético. El flujo completo es: ETL (Scrapy + PySpark) → modelo estrella → Power BI + DAX → ANOVA.

Por indicación del profesor el dataset base (UCI) se **complementa con otras 3 fuentes** para hacer un
análisis más grande: clima, festivos y tarifas eléctricas.

---

## Fuentes de datos (datos sucios)

| # | Fuente | Qué aporta | Formato crudo | Archivo en `datos_sucios/` |
|---|---|---|---|---|
| 1 | [UCI ML Repository – Individual Household Electric Power Consumption](https://archive.ics.uci.edu/dataset/235/individual+household+electric+power+consumption) | Consumo minuto a minuto de una casa en Sceaux (Francia), dic-2006 a nov-2010: potencia, voltaje, intensidad y 3 submedidores (cocina, lavandería, calentador/aire) | `.zip` con `.txt` separado por `;`, faltantes como `?` | `household_power_consumption.txt` (2.075.259 filas) |
| 2 | [Meteostat](https://meteostat.net) – estación 07156 París-Montsouris (a ~7 km) | Temperatura, humedad, viento y presión **por hora** | `.csv.gz` sin encabezado, hora en UTC | `clima_paris_montsouris_horario.csv.gz` |
| 3 | [API calendrier.api.gouv.fr](https://calendrier.api.gouv.fr) (gobierno de Francia) | Días festivos 2006-2010 | JSON, un archivo por año | `festivos_francia_AAAA.json` |
| 4 | [Eurostat nrg_pc_204](https://ec.europa.eu/eurostat/databrowser/view/nrg_pc_204/default/table) | Precio semestral del kWh para hogares en Francia (con y sin impuestos) | SDMX-CSV | `tarifas_electricidad_eurostat.csv` |

> **Nota sobre la fuente 1:** el enlace de Kaggle del enunciado ya no existe. El profesor aprobó usar la fuente
> original de UCI. Si el servidor de UCI no responde (pasó durante el desarrollo), el scraper usa
> automáticamente una copia idéntica del zip (mismo tamaño, 20.640.916 bytes, mismas 2.075.259 filas) y lo
> deja anotado en `datos_sucios/_manifiesto_extraccion.json`.

## Estructura de la carpeta

```
Consumo_Energia_Residencial/
├── README.md                  <- este archivo
├── requirements.txt
├── docs/
│   └── PIPELINE.md            <- explicación detallada: pipeline, reglas de calidad, modelo PK/FK, Power BI
├── extraccion/                <- E: proyecto Scrapy que descarga las 4 fuentes
│   ├── scrapy.cfg
│   └── energia_scraper/ (settings.py, pipelines.py, spiders/fuentes.py)
├── datos_sucios/              <- datos crudos tal como llegan (no se tocan) + manifiesto con huella SHA-256
├── etl/
│   ├── etl_energia.py         <- T + L: limpieza con PySpark y construcción del modelo estrella
│   └── validar_calidad.py     <- pruebas automáticas de calidad sobre el resultado (38 pruebas)
├── datos_limpios/             <- tablas finales para Power BI (CSV y parquet/) + reportes
│   ├── Dim_Fecha, Dim_Hora, Dim_Clima, Dim_Tarifa, Dim_Electrodomestico
│   ├── Fact_Consumo_Hora, Fact_Consumo_Electrodomestico
│   ├── reporte_calidad.md     <- cuántas filas afectó cada regla
│   ├── reporte_validacion.md  <- resultado de las 38 pruebas
│   └── metricas_etl.json
└── rechazados/                <- cuarentena: cada fila eliminada con su motivo
```

## Cómo ejecutarlo

Requisitos: Python 3.11+ y Java 17.

```bash
pip install -r requirements.txt
```

```bash
cd extraccion && scrapy crawl fuentes && cd ..
```

```bash
python etl/etl_energia.py
```

```bash
python etl/validar_calidad.py
```

> **Si clonaste el repositorio:** `household_power_consumption.txt` (131 MB) no está en GitHub porque supera
> el límite de 100 MB. Descomprime `datos_sucios/household_power_consumption.zip` en esa misma carpeta, o
> corre el paso 1, que lo descarga y lo descomprime solo.

1. **Extract**: `scrapy crawl fuentes` descarga todo a `datos_sucios/` (se puede pedir una sola fuente con
   `-a solo=energia|clima|festivos|tarifas`).
2. **Transform + Load**: `etl_energia.py` (~3 min) limpia y genera `datos_limpios/` y `rechazados/`.
3. **Verificar**: `validar_calidad.py` debe terminar en `38/38 pruebas pasan`.

## Resultado actual del ETL

| | Filas |
|---|---:|
| Minutos leídos (energía) | 2.075.259 |
| Minutos eliminados (nulos `?` y físicamente inconsistentes) | 26.012 |
| Minutos válidos | 2.049.247 |
| **Fact_Consumo_Hora** (horas con ≥ 45 min medidos) | **34.151** |
| **Fact_Consumo_Electrodomestico** (hora × 4 zonas) | **136.604** |
| Dim_Fecha (2006-2010 completos) / Dim_Clima (días con clima válido) | 1.826 / 1.396 |
| Energía total analizada | 37.274,2 kWh |

## Requerimientos analíticos y dónde se responden

| # | Requerimiento | Tablas |
|---|---|---|
| 1 | Consumo total por día, mes y año | Fact_Consumo_Hora + Dim_Fecha |
| 2 | Horas pico de consumo | Fact_Consumo_Hora + Dim_Hora |
| 3 | Laborables vs fines de semana (y festivos) | Dim_Fecha[TipoDía] |
| 4 | Detección de eventos inusuales | Fact_Consumo_Hora (Potencia_Max_kW, energía vs. promedio ± desviación en DAX) |
| 5 | Proporción por electrodoméstico | Fact_Consumo_Electrodomestico + Dim_Electrodomestico |
| 6 | Invierno vs verano | Dim_Fecha[Estación] |
| 7 | Tendencias estacionales | Dim_Fecha + Dim_Clima (temperatura, grados-día) |
| 8 | Promedio de consumo por hora | Fact_Consumo_Hora + Dim_Hora |
| 9 | Clasificación de días por nivel de consumo | Columna calculada en Power BI sobre el consumo diario |
| 10 | Costo energético mensual | Fact_Consumo_Hora × Dim_Tarifa[Precio_kWh_Con_Impuestos_EUR] |

ANOVA sugerida (ejemplo del enunciado): consumo diario según `TipoDía` (Laborable / Fin de semana / Festivo).
También se puede hacer por `Estación` o por `Categoria_Termica`.

La explicación completa del ETL está en [docs/PIPELINE.md](docs/PIPELINE.md).
