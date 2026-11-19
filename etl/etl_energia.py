import json
import os
import shutil
import sqlite3
import sys
import warnings
from datetime import date
from functools import reduce
from pathlib import Path

import pandas as pd
from pyspark.sql import DataFrame, SparkSession, Window
from pyspark.sql import functions as F

warnings.filterwarnings("ignore", message="PySpark does not yet fully support pandas")
sys.stdout.reconfigure(encoding="utf-8")

RAIZ = Path(__file__).resolve().parent.parent
SUCIOS = RAIZ / "datos_sucios"
LIMPIOS = RAIZ / "datos_limpios"
CUARENTENA = RAIZ / "rechazados"
BASE_DATOS = "energia_residencial.db"

LLAVES_PRIMARIAS = {
    "Dim_Fecha": ["Fecha"], "Dim_Hora": ["Hora"], "Dim_Clima": ["Fecha"], "Dim_Tarifa": ["ID_Periodo_Tarifa"],
    "Dim_Electrodomestico": ["ID_Electrodomestico"], "Fact_Consumo_Hora": ["Fecha", "Hora"],
    "Fact_Consumo_Electrodomestico": ["Fecha", "Hora", "ID_Electrodomestico"],
}
LLAVES_FORANEAS = [
    ("Dim_Clima", "Fecha", "Dim_Fecha", "Fecha"),
    ("Fact_Consumo_Hora", "Fecha", "Dim_Fecha", "Fecha"),
    ("Fact_Consumo_Hora", "Hora", "Dim_Hora", "Hora"),
    ("Fact_Consumo_Hora", "ID_Periodo_Tarifa", "Dim_Tarifa", "ID_Periodo_Tarifa"),
    ("Fact_Consumo_Electrodomestico", "Fecha", "Dim_Fecha", "Fecha"),
    ("Fact_Consumo_Electrodomestico", "Hora", "Dim_Hora", "Hora"),
    ("Fact_Consumo_Electrodomestico", "ID_Electrodomestico", "Dim_Electrodomestico", "ID_Electrodomestico"),
]

ARCHIVO_ENERGIA = SUCIOS / "household_power_consumption.txt"
ARCHIVO_CLIMA = SUCIOS / "clima_paris_montsouris_horario.csv.gz"
ARCHIVOS_FESTIVOS = sorted(SUCIOS.glob("festivos_francia_*.json"))
ARCHIVO_TARIFAS = SUCIOS / "tarifas_electricidad_eurostat.csv"

COLUMNAS_ENERGIA = {
    "Date": "Fecha_Texto", "Time": "Hora_Texto",
    "Global_active_power": "Potencia_Activa_kW", "Global_reactive_power": "Potencia_Reactiva_kVAr",
    "Voltage": "Voltaje_V", "Global_intensity": "Intensidad_A",
    "Sub_metering_1": "Sub1_Cocina_Wh", "Sub_metering_2": "Sub2_Lavanderia_Wh", "Sub_metering_3": "Sub3_Calentador_AC_Wh",
}
MEDIDAS_ENERGIA = list(COLUMNAS_ENERGIA.values())[2:]
COLUMNAS_CLIMA = ["date", "hour", "temp", "dwpt", "rhum", "prcp", "snow", "wdir", "wspd", "wpgt", "pres", "tsun", "coco"]
COLUMNAS_TARIFAS = ["freq", "siec", "nrg_cons", "unit", "tax", "currency", "geo", "TIME_PERIOD", "OBS_VALUE", "OBS_FLAG"]

TEXTOS_NULOS = ["?", "", "na", "nan", "null", "none", "-"]

RANGO_VOLTAJE = (200.0, 260.0)
RANGO_INTENSIDAD = (0.0, 60.0)
RANGO_POTENCIA = (0.0, 15.0)
TOLERANCIA_SUBMEDIDORES_WH = 1.0
MIN_MINUTOS_HORA = 45

RANGO_TEMP = (-30.0, 45.0)
RANGO_HUMEDAD = (0.0, 100.0)
RANGO_VIENTO = (0.0, 150.0)
RANGO_PRESION = (900.0, 1100.0)
MAX_NULOS_COLUMNA = 0.20
MIN_HORAS_CLIMA_DIA = 18
ZONA_MEDIDOR = "+01:00"

ANIO_INICIO, ANIO_FIN = 2006, 2010

FESTIVOS_ES = {
    "1er janvier": "Año Nuevo", "Lundi de Pâques": "Lunes de Pascua", "1er mai": "Día del Trabajo",
    "8 mai": "Victoria de 1945", "Ascension": "Ascensión", "Lundi de Pentecôte": "Lunes de Pentecostés",
    "14 juillet": "Fiesta Nacional", "Assomption": "Asunción", "Toussaint": "Todos los Santos",
    "11 novembre": "Armisticio de 1918", "Jour de Noël": "Navidad",
}
MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto",
         "Septiembre", "Octubre", "Noviembre", "Diciembre"]
DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

ELECTRODOMESTICOS = [
    (1, "Cocina", "Lavavajillas, horno y microondas", "Cocina_kWh"),
    (2, "Lavandería", "Lavadora, secadora, nevera y una luz", "Lavanderia_kWh"),
    (3, "Calentador y aire acondicionado", "Calentador de agua eléctrico y aire acondicionado", "Calentador_AC_kWh"),
    (4, "Resto de la vivienda", "Equipos no cubiertos por los 3 submedidores (iluminación, electrónica, etc.)", "Otros_kWh"),
]


class Bitacora:

    def __init__(self):
        self.pasos = []
        self.metricas = {}

    def registrar(self, fuente, dimension, regla, accion, filas):
        filas = int(filas)
        self.pasos.append({"fuente": fuente, "dimension": dimension, "regla": regla, "accion": accion, "filas": filas})
        print(f"  [{fuente}] {regla}: {filas:,}")

    def metrica(self, clave, valor):
        self.metricas[clave] = valor


class Cuarentena:

    def __init__(self):
        self.partes = {}

    def rechazar(self, df, condicion, fuente, regla, dimension, bit, columnas):
        condicion = F.coalesce(condicion, F.lit(False))
        malos = df.filter(condicion)
        n = malos.count()
        bit.registrar(fuente, dimension, regla, "Eliminar (cuarentena)", n)
        if n:
            self.partes.setdefault(fuente, []).append(
                malos.select(*[F.col(c).cast("string") for c in columnas]).withColumn("Motivo", F.lit(regla)))
        return df.filter(~condicion)

    def guardar(self):
        if CUARENTENA.exists():
            shutil.rmtree(CUARENTENA)
        CUARENTENA.mkdir(parents=True)
        for fuente, partes in self.partes.items():
            pdf = reduce(DataFrame.unionByName, partes).toPandas()
            pdf.to_csv(CUARENTENA / f"{fuente.lower()}_rechazados.csv", index=False, encoding="utf-8-sig")
            print(f"  cuarentena/{fuente.lower()}_rechazados.csv -> {len(pdf):,} filas")


def crear_spark():
    os.environ.setdefault("PYSPARK_PYTHON", sys.executable)
    spark = (SparkSession.builder
             .master("local[*]")
             .appName("ETL Proyecto 5 Energia Residencial")
             .config("spark.driver.memory", "4g")
             .config("spark.sql.shuffle.partitions", "8")
             .config("spark.sql.session.timeZone", "UTC")
             .config("spark.sql.execution.arrow.pyspark.enabled", "true")
             .config("spark.ui.enabled", "false")
             .config("spark.ui.showConsoleProgress", "false")
             .config("spark.driver.bindAddress", "127.0.0.1")
             .config("spark.driver.host", "127.0.0.1")
             .getOrCreate())
    spark.sparkContext.setLogLevel("ERROR")
    return spark


def exigir_columnas(df, esperadas, fuente):
    faltan = [c for c in esperadas if c not in df.columns]
    if faltan:
        raise ValueError(f"[{fuente}] el archivo no cumple el contrato, faltan columnas: {faltan}")


def a_nulo(c):
    limpio = F.trim(F.col(c))
    return F.when(F.lower(limpio).isin(TEXTOS_NULOS), F.lit(None)).otherwise(limpio)


def numero(c):
    return F.expr(f"try_cast(`{c}` as double)")


def fuera_de(c, rango):
    return (F.col(c) < rango[0]) | (F.col(c) > rango[1])


def alguna(condiciones):
    return reduce(lambda a, b: a | b, condiciones)


def procesar_energia(spark, bit, cua):
    fuente = "Energia"
    print(f"\n== {fuente}: {ARCHIVO_ENERGIA.name}")
    if not ARCHIVO_ENERGIA.exists():
        raise FileNotFoundError(f"No existe {ARCHIVO_ENERGIA}. Ejecuta primero: scrapy crawl fuentes -a solo=energia")

    crudo = spark.read.option("sep", ";").option("header", True).csv(ARCHIVO_ENERGIA.as_posix())
    exigir_columnas(crudo, COLUMNAS_ENERGIA, fuente)
    df = crudo.select([F.col(o).alias(n) for o, n in COLUMNAS_ENERGIA.items()])
    df = df.withColumn("_orden", F.monotonically_increasing_id())
    leidas = df.cache().count()
    bit.registrar(fuente, "Completitud", "Filas leídas del archivo crudo", "Conteo", leidas)
    bit.metrica("energia_filas_leidas", leidas)

    marcas = df.select([F.sum((F.trim(F.col(c)) == "?").cast("int")).alias(c) for c in MEDIDAS_ENERGIA]).first()
    bit.registrar(fuente, "Completitud", "Celdas con '?' (sin medición) convertidas a NULL", "Normalizar",
                  sum(v or 0 for v in marcas))
    for c in COLUMNAS_ENERGIA.values():
        df = df.withColumn(c, a_nulo(c))

    df = df.withColumn("Fecha_Hora", F.expr("try_to_timestamp(concat_ws(' ', Fecha_Texto, Hora_Texto), 'd/M/yyyy H:mm:ss')"))
    original = list(COLUMNAS_ENERGIA.values())
    df = cua.rechazar(df, F.col("Fecha_Hora").isNull(), fuente,
                      "R01 Fecha u hora vacía o no convertible a timestamp", "Validez", bit, original)

    df = cua.rechazar(df, alguna([F.col(c).isNull() for c in MEDIDAS_ENERGIA]), fuente,
                      "R02 Medición nula ('?' o vacía) en alguna variable", "Completitud", bit, original)

    df = cua.rechazar(df, alguna([numero(c).isNull() for c in MEDIDAS_ENERGIA]), fuente,
                      "R03 Valor no numérico", "Validez", bit, original)
    for c in MEDIDAS_ENERGIA:
        df = df.withColumn(c, numero(c))

    df = cua.rechazar(df, alguna([F.col(c) < 0 for c in MEDIDAS_ENERGIA]), fuente,
                      "R04 Valor negativo en alguna medida", "Validez", bit, original)

    df = cua.rechazar(df, fuera_de("Voltaje_V", RANGO_VOLTAJE), fuente,
                      f"R05 Voltaje fuera de {RANGO_VOLTAJE[0]:.0f}-{RANGO_VOLTAJE[1]:.0f} V", "Validez", bit, original)
    df = cua.rechazar(df, fuera_de("Intensidad_A", RANGO_INTENSIDAD) | fuera_de("Potencia_Activa_kW", RANGO_POTENCIA),
                      fuente, f"R06 Intensidad > {RANGO_INTENSIDAD[1]:.0f} A o potencia > {RANGO_POTENCIA[1]:.0f} kW",
                      "Validez", bit, original)

    energia_minuto_wh = F.col("Potencia_Activa_kW") * 1000 / 60
    suma_sub = F.col("Sub1_Cocina_Wh") + F.col("Sub2_Lavanderia_Wh") + F.col("Sub3_Calentador_AC_Wh")
    df = cua.rechazar(df, suma_sub > energia_minuto_wh + TOLERANCIA_SUBMEDIDORES_WH, fuente,
                      "R07 Submedidores suman más que la energía total del minuto", "Consistencia", bit, original)

    df = cua.rechazar(df, F.col("Potencia_Activa_kW") > F.col("Voltaje_V") * (F.col("Intensidad_A") + 0.2) / 1000,
                      fuente, "R08 Potencia activa mayor que voltaje x intensidad (físicamente imposible)",
                      "Consistencia", bit, original)

    w = Window.partitionBy("Fecha_Hora").orderBy("_orden")
    df = df.withColumn("_n", F.row_number().over(w))
    df = cua.rechazar(df, F.col("_n") > 1, fuente, "R09 Minuto duplicado (misma fecha y hora)", "Unicidad",
                      bit, original).drop("_n")

    df = (df.withColumn("Fecha", F.to_date("Fecha_Hora"))
            .withColumn("Hora", F.hour("Fecha_Hora"))
            .withColumn("Energia_Activa_kWh", F.col("Potencia_Activa_kW") / 60)
            .withColumn("Energia_Reactiva_kVArh", F.col("Potencia_Reactiva_kVAr") / 60)
            .withColumn("Cocina_kWh", F.col("Sub1_Cocina_Wh") / 1000)
            .withColumn("Lavanderia_kWh", F.col("Sub2_Lavanderia_Wh") / 1000)
            .withColumn("Calentador_AC_kWh", F.col("Sub3_Calentador_AC_Wh") / 1000)
            .cache())
    validas = df.count()
    bit.registrar(fuente, "Completitud", "Minutos válidos después de las reglas", "Conteo", validas)
    bit.metrica("energia_minutos_validos", validas)
    bit.metrica("energia_minutos_rechazados", leidas - validas)
    bit.metrica("energia_kwh_minutos_validos", float(df.agg(F.sum("Energia_Activa_kWh")).first()[0]))

    hora = (df.groupBy("Fecha", "Hora").agg(
                F.sum("Energia_Activa_kWh").alias("Energia_Activa_kWh"),
                F.sum("Energia_Reactiva_kVArh").alias("Energia_Reactiva_kVArh"),
                F.sum("Cocina_kWh").alias("Cocina_kWh"),
                F.sum("Lavanderia_kWh").alias("Lavanderia_kWh"),
                F.sum("Calentador_AC_kWh").alias("Calentador_AC_kWh"),
                F.avg("Potencia_Activa_kW").alias("Potencia_Media_kW"),
                F.max("Potencia_Activa_kW").alias("Potencia_Max_kW"),
                F.avg("Voltaje_V").alias("Voltaje_Medio_V"),
                F.avg("Intensidad_A").alias("Intensidad_Media_A"),
                F.count(F.lit(1)).alias("Minutos_Medidos"))
            .cache())
    horas_total = hora.count()
    bit.registrar(fuente, "Completitud", "Horas formadas a partir de los minutos válidos", "Conteo", horas_total)
    bit.metrica("energia_horas_formadas", horas_total)

    hora = hora.withColumn("Otros_kWh", F.col("Energia_Activa_kWh") - F.col("Cocina_kWh") - F.col("Lavanderia_kWh")
                           - F.col("Calentador_AC_kWh"))
    cols_hora = hora.columns
    hora = cua.rechazar(hora, F.col("Minutos_Medidos") < MIN_MINUTOS_HORA, "Energia_Horas",
                        f"R10 Hora incompleta (menos de {MIN_MINUTOS_HORA} de 60 minutos medidos)", "Completitud",
                        bit, cols_hora)
    hora = cua.rechazar(hora, F.col("Otros_kWh") < 0, "Energia_Horas",
                        "R11 Submedidores de la hora suman más que el total (resto negativo)", "Consistencia",
                        bit, cols_hora).cache()
    bit.metrica("energia_horas_aceptadas", hora.count())
    bit.metrica("energia_kwh_horas_aceptadas", float(hora.agg(F.sum("Energia_Activa_kWh")).first()[0]))
    df.unpersist()
    return hora


def procesar_clima(spark, bit, cua, fecha_min, fecha_max):
    fuente = "Clima"
    print(f"\n== {fuente}: {ARCHIVO_CLIMA.name}")
    crudo = spark.read.option("header", False).csv(ARCHIVO_CLIMA.as_posix())
    if len(crudo.columns) != len(COLUMNAS_CLIMA):
        raise ValueError(f"[{fuente}] se esperaban {len(COLUMNAS_CLIMA)} columnas y llegaron {len(crudo.columns)}")
    df = crudo.toDF(*COLUMNAS_CLIMA)
    for c in COLUMNAS_CLIMA:
        df = df.withColumn(c, a_nulo(c))
    bit.registrar(fuente, "Completitud", "Filas leídas (estación desde 1983)", "Conteo", df.count())

    df = df.withColumn("Fecha_Hora_UTC", F.expr("try_to_timestamp(concat(date, ' ', lpad(hour, 2, '0')), 'yyyy-MM-dd HH')"))
    df = cua.rechazar(df, F.col("Fecha_Hora_UTC").isNull(), fuente, "C01 Fecha u hora no convertible", "Validez",
                      bit, COLUMNAS_CLIMA)
    df = df.withColumn("Fecha_Hora", F.from_utc_timestamp("Fecha_Hora_UTC", ZONA_MEDIDOR))

    df = df.filter(F.to_date("Fecha_Hora").between(F.lit(fecha_min), F.lit(fecha_max))).cache()
    en_periodo = df.count()
    bit.registrar(fuente, "Alcance", f"Filas dentro del periodo del medidor ({fecha_min} a {fecha_max})", "Filtrar", en_periodo)

    nulos = df.select([F.avg(F.col(c).isNull().cast("int")).alias(c) for c in COLUMNAS_CLIMA[2:]]).first().asDict()
    descartadas = [c for c, p in nulos.items() if p > MAX_NULOS_COLUMNA]
    for c in descartadas:
        bit.registrar(fuente, "Completitud", f"Columna '{c}' descartada ({nulos[c]:.0%} nulos)", "Eliminar columna",
                      round(nulos[c] * en_periodo))
    usadas = {"temp": "Temperatura_C", "rhum": "Humedad_Pct", "wspd": "Viento_kmh", "pres": "Presion_hPa"}
    usadas = {k: v for k, v in usadas.items() if k not in descartadas}

    originales = COLUMNAS_CLIMA + ["Fecha_Hora"]
    df = cua.rechazar(df, alguna([F.col(c).isNull() for c in usadas]), fuente,
                      "C02 Observación nula en temperatura, humedad, viento o presión", "Completitud", bit, originales)
    df = cua.rechazar(df, alguna([numero(c).isNull() for c in usadas]), fuente, "C03 Valor no numérico", "Validez",
                      bit, originales)
    for c, nuevo in usadas.items():
        df = df.withColumn(nuevo, numero(c))

    rangos = {"Temperatura_C": RANGO_TEMP, "Humedad_Pct": RANGO_HUMEDAD, "Viento_kmh": RANGO_VIENTO,
              "Presion_hPa": RANGO_PRESION}
    df = cua.rechazar(df, alguna([fuera_de(c, r) for c, r in rangos.items() if c in usadas.values()]), fuente,
                      "C04 Valor fuera de rango físico (temp -30..45 °C, humedad 0..100 %, viento 0..150, presión 900..1100)",
                      "Validez", bit, originales)

    w = Window.partitionBy("Fecha_Hora").orderBy("Fecha_Hora_UTC")
    df = df.withColumn("_n", F.row_number().over(w))
    df = cua.rechazar(df, F.col("_n") > 1, fuente, "C05 Fecha y hora repetidas", "Unicidad", bit, originales).drop("_n")

    dia = (df.groupBy(F.to_date("Fecha_Hora").alias("Fecha")).agg(
                F.round(F.avg("Temperatura_C"), 2).alias("Temp_Media_C"),
                F.min("Temperatura_C").alias("Temp_Min_C"),
                F.max("Temperatura_C").alias("Temp_Max_C"),
                F.round(F.avg("Humedad_Pct"), 2).alias("Humedad_Media_Pct"),
                F.round(F.avg("Viento_kmh"), 2).alias("Viento_Medio_kmh"),
                F.round(F.avg("Presion_hPa"), 2).alias("Presion_Media_hPa"),
                F.count(F.lit(1)).alias("Horas_Observadas")))
    dia = cua.rechazar(dia, F.col("Horas_Observadas") < MIN_HORAS_CLIMA_DIA, "Clima_Dias",
                       f"C06 Día con menos de {MIN_HORAS_CLIMA_DIA} observaciones horarias", "Completitud",
                       bit, ["Fecha", "Horas_Observadas"])

    tm = F.col("Temp_Media_C")
    dia = (dia.withColumn("Grados_Dia_Calefaccion", F.round(F.when(tm <= 15, 18 - tm).otherwise(0.0), 2))
              .withColumn("Grados_Dia_Refrigeracion", F.round(F.when(tm >= 24, tm - 21).otherwise(0.0), 2))
              .withColumn("Categoria_Termica", F.when(tm < 10, "Frío").when(tm < 20, "Templado").otherwise("Cálido"))
              .withColumn("Categoria_Termica_Orden", F.when(tm < 10, 1).when(tm < 20, 2).otherwise(3))
              .orderBy("Fecha").cache())
    bit.registrar(fuente, "Completitud", "Días de clima aceptados", "Conteo", dia.count())
    df.unpersist()
    return dia


def procesar_festivos(spark, bit, cua):
    fuente = "Festivos"
    print(f"\n== {fuente}: {len(ARCHIVOS_FESTIVOS)} archivos JSON")
    if not ARCHIVOS_FESTIVOS:
        raise FileNotFoundError("No hay festivos_francia_*.json en datos_sucios/")
    texto = spark.read.text([p.as_posix() for p in ARCHIVOS_FESTIVOS], wholetext=True)
    df = (texto.select(F.explode(F.from_json("value", "map<string,string>")).alias("Fecha_Texto", "Nombre_Original"))
               .withColumn("Fecha_Texto", a_nulo("Fecha_Texto"))
               .withColumn("Nombre_Original", F.regexp_replace(a_nulo("Nombre_Original"), r"\s+", " ")))
    bit.registrar(fuente, "Completitud", "Festivos leídos", "Conteo", df.count())
    cols = ["Fecha_Texto", "Nombre_Original"]

    df = df.withColumn("Fecha", F.expr("try_to_date(Fecha_Texto, 'yyyy-MM-dd')"))
    df = cua.rechazar(df, F.col("Fecha").isNull(), fuente, "F01 Fecha no convertible", "Validez", bit, cols)
    df = cua.rechazar(df, F.col("Nombre_Original").isNull(), fuente, "F02 Festivo sin nombre", "Completitud", bit, cols)
    df = cua.rechazar(df, ~F.year("Fecha").between(ANIO_INICIO, ANIO_FIN), fuente,
                      f"F03 Fecha fuera de {ANIO_INICIO}-{ANIO_FIN}", "Validez", bit, cols)
    df = df.withColumn("_n", F.row_number().over(Window.partitionBy("Fecha").orderBy("Nombre_Original")))
    df = cua.rechazar(df, F.col("_n") > 1, fuente, "F04 Fecha de festivo repetida", "Unicidad", bit, cols).drop("_n")

    traduccion = F.create_map(*[F.lit(x) for par in FESTIVOS_ES.items() for x in par])
    df = df.withColumn("Nombre_Festivo", F.coalesce(traduccion[F.col("Nombre_Original")], F.col("Nombre_Original")))
    no_traducidos = df.filter(~F.col("Nombre_Original").isin(list(FESTIVOS_ES))).count()
    bit.registrar(fuente, "Consistencia", "Nombres sin traducción al español (se deja el original)", "Normalizar", no_traducidos)
    return df.select("Fecha", "Nombre_Festivo").cache()


def procesar_tarifas(spark, bit, cua):
    fuente = "Tarifas"
    print(f"\n== {fuente}: {ARCHIVO_TARIFAS.name}")
    df = spark.read.option("header", True).csv(ARCHIVO_TARIFAS.as_posix())
    exigir_columnas(df, COLUMNAS_TARIFAS, fuente)
    for c in df.columns:
        df = df.withColumn(c, a_nulo(c))
    bit.registrar(fuente, "Completitud", "Filas leídas", "Conteo", df.count())
    cols = COLUMNAS_TARIFAS

    df = cua.rechazar(df, ~((F.col("unit") == "KWH") & (F.col("currency") == "EUR") & (F.col("geo") == "FR")), fuente,
                      "T01 Unidad, moneda o país distinto de kWh / EUR / FR", "Consistencia", bit, cols)
    df = cua.rechazar(df, ~F.col("TIME_PERIOD").rlike(r"^\d{4}-S[12]$"), fuente, "T02 Periodo con formato distinto de AAAA-S1/S2",
                      "Validez", bit, cols)
    df = cua.rechazar(df, numero("OBS_VALUE").isNull(), fuente, "T03 Precio nulo o no numérico", "Completitud", bit, cols)
    df = df.withColumn("Precio", numero("OBS_VALUE"))
    df = cua.rechazar(df, (F.col("Precio") <= 0) | (F.col("Precio") >= 1), fuente, "T04 Precio fuera de (0, 1) EUR/kWh",
                      "Validez", bit, cols)
    w = Window.partitionBy("TIME_PERIOD", "tax").orderBy("OBS_VALUE")
    df = df.withColumn("_n", F.row_number().over(w))
    df = cua.rechazar(df, F.col("_n") > 1, fuente, "T05 Periodo e impuesto repetidos", "Unicidad", bit, cols).drop("_n")

    return (df.groupBy(F.col("TIME_PERIOD").alias("ID_Periodo_Tarifa"))
              .pivot("tax", ["X_TAX", "X_VAT", "I_TAX"]).agg(F.first("Precio"))
              .withColumnRenamed("X_TAX", "Precio_kWh_Sin_Impuestos_EUR")
              .withColumnRenamed("X_VAT", "Precio_kWh_Sin_IVA_EUR")
              .withColumnRenamed("I_TAX", "Precio_kWh_Con_Impuestos_EUR")
              .cache())


def periodo_tarifa(fecha_col):
    return F.concat(F.year(fecha_col).cast("string"), F.lit("-S"), F.when(F.month(fecha_col) <= 6, "1").otherwise("2"))


def construir_dim_fecha(spark, festivos, fechas_con_medicion):
    dias = F.sequence(F.to_date(F.lit(f"{ANIO_INICIO}-01-01")), F.to_date(F.lit(f"{ANIO_FIN}-12-31")), F.expr("interval 1 day"))
    t = spark.range(1).select(F.explode(dias).alias("Fecha"))
    c = F.col
    mes = F.month("Fecha")
    t = (t.withColumn("Año", F.year("Fecha"))
          .withColumn("Semestre", F.when(mes <= 6, 1).otherwise(2))
          .withColumn("Trimestre", F.quarter("Fecha"))
          .withColumn("NombreTrimestre", F.concat(F.lit("T"), c("Trimestre")))
          .withColumn("Mes", mes)
          .withColumn("NombreMes", F.element_at(F.array(*[F.lit(m) for m in MESES]), mes))
          .withColumn("NombreMesCorto", F.substring("NombreMes", 1, 3))
          .withColumn("AñoMes", F.date_format("Fecha", "yyyy-MM"))
          .withColumn("Día", F.dayofmonth("Fecha"))
          .withColumn("DíaSemana", (F.dayofweek("Fecha") + 5) % 7 + 1)
          .withColumn("NombreDía", F.element_at(F.array(*[F.lit(d) for d in DIAS]), c("DíaSemana")))
          .withColumn("Estación", F.when(mes.isin(12, 1, 2), "Invierno").when(mes.isin(3, 4, 5), "Primavera")
                                   .when(mes.isin(6, 7, 8), "Verano").otherwise("Otoño"))
          .withColumn("Estación_Orden", F.when(mes.isin(12, 1, 2), 1).when(mes.isin(3, 4, 5), 2)
                                         .when(mes.isin(6, 7, 8), 3).otherwise(4))
          .withColumn("EsFinDeSemana", F.when(c("DíaSemana") >= 6, "Sí").otherwise("No")))
    t = t.join(festivos, "Fecha", "left")
    t = (t.withColumn("EsFestivo", F.when(c("Nombre_Festivo").isNotNull(), "Sí").otherwise("No"))
          .withColumn("NombreFestivo", F.coalesce(c("Nombre_Festivo"), F.lit("No festivo")))
          .drop("Nombre_Festivo")
          .withColumn("TipoDía", F.when(c("EsFestivo") == "Sí", "Festivo")
                                  .when(c("EsFinDeSemana") == "Sí", "Fin de semana").otherwise("Laborable"))
          .withColumn("EsLaborable", F.when(c("TipoDía") == "Laborable", "Sí").otherwise("No")))
    t = (t.join(fechas_con_medicion.withColumn("TieneMedición", F.lit("Sí")), "Fecha", "left")
          .withColumn("TieneMedición", F.coalesce(c("TieneMedición"), F.lit("No"))))
    return t.orderBy("Fecha")


def construir_dim_hora(spark):
    filas = []
    for h in range(24):
        franja, orden = (("Madrugada", 1) if h < 6 else ("Mañana", 2) if h < 12 else ("Tarde", 3) if h < 18 else ("Noche", 4))
        filas.append((h, f"{h:02d}:00", franja, orden))
    return spark.createDataFrame(filas, "Hora int, Etiqueta_Hora string, Franja_Horaria string, Franja_Orden int")


def construir_dim_electrodomestico(spark):
    return spark.createDataFrame([(i, z, d, f"Sub_metering_{i}" if i < 4 else "Calculado (total - submedidores)")
                                  for i, z, d, _ in ELECTRODOMESTICOS],
                                 "ID_Electrodomestico int, Zona string, Equipos string, Origen string")


def construir_dim_tarifa(spark, precios, periodos_usados, bit):
    disponibles = sorted(r["ID_Periodo_Tarifa"] for r in precios.select("ID_Periodo_Tarifa").collect())
    filas = []
    for p in sorted(periodos_usados):
        anio, sem = int(p[:4]), int(p[-1])
        if p in disponibles:
            origen, estimado = p, "No"
        else:
            origen = min(disponibles, key=lambda d: abs((int(d[:4]) * 2 + int(d[-1])) - (anio * 2 + sem)))
            estimado = "Sí"
        inicio = date(anio, 1 if sem == 1 else 7, 1)
        fin = date(anio, 6, 30) if sem == 1 else date(anio, 12, 31)
        filas.append((p, anio, sem, inicio, fin, origen, estimado))
    estimados = sum(f[-1] == "Sí" for f in filas)
    bit.registrar("Tarifas", "Completitud", "Semestres sin precio en Eurostat -> precio del semestre más cercano (marcado)",
                  "Completar dimensión", estimados)
    base = spark.createDataFrame(filas, "ID_Periodo_Tarifa string, `Año` int, Semestre int, Fecha_Inicio date, "
                                        "Fecha_Fin date, Periodo_Origen_Precio string, Es_Estimado string")
    return (base.join(precios.withColumnRenamed("ID_Periodo_Tarifa", "Periodo_Origen_Precio"), "Periodo_Origen_Precio")
                .withColumn("Fuente", F.lit("Eurostat nrg_pc_204 (hogares 2.500-4.999 kWh/año, Francia)"))
                .select("ID_Periodo_Tarifa", "Año", "Semestre", "Fecha_Inicio", "Fecha_Fin",
                        "Precio_kWh_Sin_Impuestos_EUR", "Precio_kWh_Sin_IVA_EUR", "Precio_kWh_Con_Impuestos_EUR",
                        "Es_Estimado", "Periodo_Origen_Precio", "Fuente")
                .orderBy("ID_Periodo_Tarifa"))


def construir_hechos(hora):
    redondeo = {c: 6 for c in ["Energia_Activa_kWh", "Energia_Reactiva_kVArh", "Cocina_kWh", "Lavanderia_kWh",
                               "Calentador_AC_kWh"]}
    redondeo.update({"Potencia_Media_kW": 4, "Potencia_Max_kW": 3, "Voltaje_Medio_V": 2, "Intensidad_Media_A": 3})
    for c, d in redondeo.items():
        hora = hora.withColumn(c, F.round(c, d))
    hora = hora.withColumn("Otros_kWh", F.round(F.col("Energia_Activa_kWh") - F.col("Cocina_kWh")
                                                - F.col("Lavanderia_kWh") - F.col("Calentador_AC_kWh"), 6))
    hora = hora.withColumn("ID_Periodo_Tarifa", periodo_tarifa(F.col("Fecha")))

    fact = hora.select("Fecha", "Hora", "ID_Periodo_Tarifa", "Energia_Activa_kWh", "Energia_Reactiva_kVArh",
                       "Potencia_Media_kW", "Potencia_Max_kW", "Voltaje_Medio_V", "Intensidad_Media_A",
                       "Minutos_Medidos").orderBy("Fecha", "Hora")

    columnas = [col for *_, col in ELECTRODOMESTICOS]
    ids = F.create_map(*[F.lit(x) for i, *_, col in ELECTRODOMESTICOS for x in (col, i)])
    largo = (hora.unpivot(["Fecha", "Hora"], columnas, "Columna", "Energia_kWh")
                 .withColumn("ID_Electrodomestico", ids[F.col("Columna")])
                 .select("Fecha", "Hora", "ID_Electrodomestico", "Energia_kWh")
                 .orderBy("Fecha", "Hora", "ID_Electrodomestico"))
    return fact, largo


def guardar(df, nombre):
    pdf = df.toPandas()
    pdf.to_csv(LIMPIOS / f"{nombre}.csv", index=False, encoding="utf-8-sig")
    pdf.to_parquet(LIMPIOS / "parquet" / f"{nombre}.parquet", index=False)
    print(f"  {nombre:32s} {len(pdf):>8,} filas  {len(pdf.columns):>2} columnas")
    return pdf


def tipo_sql(serie):
    if pd.api.types.is_integer_dtype(serie):
        return "INTEGER"
    if pd.api.types.is_float_dtype(serie):
        return "REAL"
    return "TEXT"


def cargar_base_datos(tablas):
    ruta = LIMPIOS / BASE_DATOS
    with sqlite3.connect(ruta) as con:
        con.execute("PRAGMA foreign_keys = ON")
        for nombre, pdf in tablas.items():
            columnas = [f'"{c}" {tipo_sql(pdf[c])} NOT NULL' for c in pdf.columns]
            columnas.append("PRIMARY KEY (" + ", ".join(f'"{c}"' for c in LLAVES_PRIMARIAS[nombre]) + ")")
            columnas += [f'FOREIGN KEY ("{fk}") REFERENCES {padre}("{pk}")'
                         for hija, fk, padre, pk in LLAVES_FORANEAS if hija == nombre]
            con.execute(f'CREATE TABLE {nombre} ({", ".join(columnas)})')
            filas = pdf.astype(object).where(pdf.notna(), None)
            filas = filas.apply(lambda s: s.map(lambda v: v.isoformat() if hasattr(v, "isoformat") else v))
            marcas = ", ".join("?" for _ in pdf.columns)
            con.executemany(f"INSERT INTO {nombre} VALUES ({marcas})", filas.itertuples(index=False, name=None))
        con.commit()
    print(f"  base de datos SQLite -> {ruta.name} ({len(tablas)} tablas con PK y FK)")


def escribir_reporte(bit):
    lineas = ["# Reporte de calidad del ETL", "",
              "Generado automáticamente por `etl/etl_energia.py`. Cada fila es una regla aplicada y cuántos registros afectó.",
              "Las filas eliminadas están en `rechazados/` con la columna `Motivo`.", ""]
    fuentes = list(dict.fromkeys(p["fuente"] for p in bit.pasos))
    for fuente in fuentes:
        lineas += ["", f"## {fuente}", "", "| Regla | Dimensión de calidad | Acción | Filas |", "|---|---|---|---:|"]
        lineas += [f"| {p['regla']} | {p['dimension']} | {p['accion']} | {p['filas']:,} |"
                   for p in bit.pasos if p["fuente"] == fuente]
    lineas += ["", "## Tablas cargadas", "", "| Tabla | Filas |", "|---|---:|"]
    lineas += [f"| {k.replace('filas_', '')} | {v:,} |" for k, v in bit.metricas.items() if k.startswith("filas_")]
    (LIMPIOS / "reporte_calidad.md").write_text("\n".join(lineas) + "\n", encoding="utf-8")


def main():
    spark = crear_spark()
    bit, cua = Bitacora(), Cuarentena()

    print("\n################ EXTRACT + TRANSFORM ################")
    hora = procesar_energia(spark, bit, cua)
    rango = hora.agg(F.min("Fecha"), F.max("Fecha")).first()
    fecha_min, fecha_max = rango[0], rango[1]
    clima = procesar_clima(spark, bit, cua, fecha_min, fecha_max)
    festivos = procesar_festivos(spark, bit, cua)
    precios = procesar_tarifas(spark, bit, cua)

    print("\n################ MODELO ESTRELLA ################")
    fact, fact_electro = construir_hechos(hora)
    periodos = [r[0] for r in fact.select("ID_Periodo_Tarifa").distinct().collect()]
    dim_fecha = construir_dim_fecha(spark, festivos, hora.select("Fecha").distinct())
    dim_tarifa = construir_dim_tarifa(spark, precios, periodos, bit)
    dim_hora = construir_dim_hora(spark)
    dim_electro = construir_dim_electrodomestico(spark)

    print("\n################ LOAD ################")
    if LIMPIOS.exists():
        shutil.rmtree(LIMPIOS)
    (LIMPIOS / "parquet").mkdir(parents=True)
    tablas = {"Dim_Fecha": dim_fecha, "Dim_Hora": dim_hora, "Dim_Clima": clima, "Dim_Tarifa": dim_tarifa,
              "Dim_Electrodomestico": dim_electro, "Fact_Consumo_Hora": fact,
              "Fact_Consumo_Electrodomestico": fact_electro}
    cargadas = {nombre: guardar(df, nombre) for nombre, df in tablas.items()}
    for nombre, pdf in cargadas.items():
        bit.metrica(f"filas_{nombre}", len(pdf))
    cargar_base_datos(cargadas)
    cua.guardar()

    bit.metrica("periodo_medidor", [str(fecha_min), str(fecha_max)])
    (LIMPIOS / "metricas_etl.json").write_text(json.dumps(bit.metricas, indent=2, ensure_ascii=False), "utf-8")
    escribir_reporte(bit)
    print(f"\nETL terminado. Revisa {LIMPIOS / 'reporte_calidad.md'} y luego ejecuta: python etl/validar_calidad.py")
    spark.stop()


if __name__ == "__main__":
    main()
