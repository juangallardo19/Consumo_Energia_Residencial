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
├── web/                       <- página web del dashboard (parallax + datos reales), ver web/README.md
├── docs/
│   └── PIPELINE.md            <- explicación detallada: pipeline, reglas de calidad, modelo PK/FK, Power BI
├── extraccion/                <- E: proyecto Scrapy que descarga las 4 fuentes
│   ├── scrapy.cfg
│   └── energia_scraper/ (settings.py, pipelines.py, spiders/fuentes.py)
├── datos_sucios/              <- datos crudos tal como llegan (no se tocan) + manifiesto con huella SHA-256
├── etl/
│   ├── etl_energia.py         <- T + L: limpieza con PySpark y construcción del modelo estrella
│   └── validar_calidad.py     <- pruebas automáticas de calidad sobre el resultado (38 pruebas)
├── datos_limpios/             <- (se genera, no está en GitHub) tablas finales para Power BI (CSV y parquet/)
│   ├── Dim_Fecha, Dim_Hora, Dim_Clima, Dim_Tarifa, Dim_Electrodomestico
│   ├── Fact_Consumo_Hora, Fact_Consumo_Electrodomestico
│   ├── reporte_calidad.md     <- cuántas filas afectó cada regla
│   ├── reporte_validacion.md  <- resultado de las 38 pruebas
│   └── metricas_etl.json
└── rechazados/                <- (se genera, no está en GitHub) cuarentena: cada fila eliminada con su motivo
```

## Cómo generar los datos limpios (paso a paso)

En GitHub solo están el código y los datos crudos. Las carpetas `datos_limpios/` y `rechazados/` **no se
suben**: cada integrante las genera en su computador con el ETL. Así el repositorio pesa poco y nadie sube
resultados desactualizados.

### Paso 0 · Requisitos (una sola vez)

- **Python 3.11 o superior**: comprueba con `python --version`.
- **Java 17** (Spark lo necesita): comprueba con `java -version`. Si no lo tienes, instala
  [Eclipse Temurin 17](https://adoptium.net/temurin/releases/?version=17) y marca la opción
  "Set JAVA_HOME" durante la instalación.
- Las librerías de Python. Se instalan desde la carpeta del proyecto con:

```bash
pip install -r requirements.txt
```

### Paso 1 · Clonar el repositorio

```bash
git clone https://github.com/juangallardo19/Consumo_Energia_Residencial.git
```

```bash
cd Consumo_Energia_Residencial
```

### Paso 2 · Tener los datos crudos (Extract)

`household_power_consumption.txt` (131 MB) no está en GitHub porque supera el límite de 100 MB. Hay dos
formas de conseguirlo. Elige **una**:

- **Opción A, rápida y sin internet:** descomprime `datos_sucios/household_power_consumption.zip` dentro de
  la misma carpeta `datos_sucios/` (clic derecho → "Extraer todo…" → elige `datos_sucios`). Debe quedar
  `datos_sucios/household_power_consumption.txt`.
- **Opción B, la extracción completa con Scrapy:** vuelve a descargar las 4 fuentes desde internet y
  descomprime el zip automáticamente.

```bash
cd extraccion
```

```bash
python -m scrapy crawl fuentes
```

```bash
cd ..
```

  Para bajar una sola fuente se agrega `-a solo=energia` (o `clima`, `festivos`, `tarifas`).

### Paso 3 · Limpiar y construir el modelo (Transform + Load)

Desde la carpeta raíz del proyecto (tarda unos 3 minutos):

```bash
python etl/etl_energia.py
```

Al terminar debe decir `ETL terminado` y crear:
- `datos_limpios/`: las 7 tablas en CSV y en `parquet/`, más `reporte_calidad.md` y `metricas_etl.json`.
- `rechazados/`: las filas eliminadas, cada una con su `Motivo`.

### Paso 4 · Verificar que quedó bien

```bash
python etl/validar_calidad.py
```

La última línea debe ser **`38/38 pruebas pasan`**. Si alguna prueba dice `FALLA`, no uses los datos en
Power BI. Revisa `datos_limpios/reporte_validacion.md`.

### Paso 5 · Conectar Power BI

Abre el `.pbix` y, en **Transformar datos → Administrar parámetros**, cambia `RutaDatos` por la ruta de **tu**
carpeta `datos_limpios\parquet\` (terminada en `\`). Luego dale **Actualizar**.

### Problemas comunes

| Error | Solución |
|---|---|
| `FileNotFoundError ... household_power_consumption.txt` | No hiciste el paso 2: descomprime el zip. |
| `JAVA_HOME is not set` / `Java gateway process exited` | Falta Java 17 o la variable `JAVA_HOME`. Instala Temurin 17 con la opción "Set JAVA_HOME" y abre una terminal nueva. |
| `No module named 'pyspark'` (o `scrapy`) | Repite `pip install -r requirements.txt`. |
| Scrapy no logra descargar de UCI | No es grave: el spider usa automáticamente una copia idéntica en GitHub. O usa la opción A del paso 2. |

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
