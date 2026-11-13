# Reporte de calidad del ETL

Generado automáticamente por `etl/etl_energia.py`. Cada fila es una regla aplicada y cuántos registros afectó.
Las filas eliminadas están en `rechazados/` con la columna `Motivo`.


## Energia

| Regla | Dimensión de calidad | Acción | Filas |
|---|---|---|---:|
| Filas leídas del archivo crudo | Completitud | Conteo | 2,075,259 |
| Celdas con '?' (sin medición) convertidas a NULL | Completitud | Normalizar | 155,874 |
| R01 Fecha u hora vacía o no convertible a timestamp | Validez | Eliminar (cuarentena) | 0 |
| R02 Medición nula ('?' o vacía) en alguna variable | Completitud | Eliminar (cuarentena) | 25,979 |
| R03 Valor no numérico | Validez | Eliminar (cuarentena) | 0 |
| R04 Valor negativo en alguna medida | Validez | Eliminar (cuarentena) | 0 |
| R05 Voltaje fuera de 200-260 V | Validez | Eliminar (cuarentena) | 0 |
| R06 Intensidad > 60 A o potencia > 15 kW | Validez | Eliminar (cuarentena) | 0 |
| R07 Submedidores suman más que la energía total del minuto | Consistencia | Eliminar (cuarentena) | 33 |
| R08 Potencia activa mayor que voltaje x intensidad (físicamente imposible) | Consistencia | Eliminar (cuarentena) | 0 |
| R09 Minuto duplicado (misma fecha y hora) | Unicidad | Eliminar (cuarentena) | 0 |
| Minutos válidos después de las reglas | Completitud | Conteo | 2,049,247 |
| Horas formadas a partir de los minutos válidos | Completitud | Conteo | 34,168 |

## Energia_Horas

| Regla | Dimensión de calidad | Acción | Filas |
|---|---|---|---:|
| R10 Hora incompleta (menos de 45 de 60 minutos medidos) | Completitud | Eliminar (cuarentena) | 17 |
| R11 Submedidores de la hora suman más que el total (resto negativo) | Consistencia | Eliminar (cuarentena) | 0 |

## Clima

| Regla | Dimensión de calidad | Acción | Filas |
|---|---|---|---:|
| Filas leídas (estación desde 1983) | Completitud | Conteo | 223,787 |
| C01 Fecha u hora no convertible | Validez | Eliminar (cuarentena) | 0 |
| Filas dentro del periodo del medidor (2006-12-16 a 2010-11-26) | Alcance | Filtrar | 33,734 |
| Columna 'prcp' descartada (38% nulos) | Completitud | Eliminar columna | 12,672 |
| Columna 'snow' descartada (100% nulos) | Completitud | Eliminar columna | 33,734 |
| Columna 'wpgt' descartada (100% nulos) | Completitud | Eliminar columna | 33,734 |
| Columna 'tsun' descartada (100% nulos) | Completitud | Eliminar columna | 33,734 |
| Columna 'coco' descartada (100% nulos) | Completitud | Eliminar columna | 33,734 |
| C02 Observación nula en temperatura, humedad, viento o presión | Completitud | Eliminar (cuarentena) | 49 |
| C03 Valor no numérico | Validez | Eliminar (cuarentena) | 0 |
| C04 Valor fuera de rango físico (temp -30..45 °C, humedad 0..100 %, viento 0..150, presión 900..1100) | Validez | Eliminar (cuarentena) | 0 |
| C05 Fecha y hora repetidas | Unicidad | Eliminar (cuarentena) | 0 |
| Días de clima aceptados | Completitud | Conteo | 1,396 |

## Clima_Dias

| Regla | Dimensión de calidad | Acción | Filas |
|---|---|---|---:|
| C06 Día con menos de 18 observaciones horarias | Completitud | Eliminar (cuarentena) | 44 |

## Festivos

| Regla | Dimensión de calidad | Acción | Filas |
|---|---|---|---:|
| Festivos leídos | Completitud | Conteo | 54 |
| F01 Fecha no convertible | Validez | Eliminar (cuarentena) | 0 |
| F02 Festivo sin nombre | Completitud | Eliminar (cuarentena) | 0 |
| F03 Fecha fuera de 2006-2010 | Validez | Eliminar (cuarentena) | 0 |
| F04 Fecha de festivo repetida | Unicidad | Eliminar (cuarentena) | 0 |
| Nombres sin traducción al español (se deja el original) | Consistencia | Normalizar | 0 |

## Tarifas

| Regla | Dimensión de calidad | Acción | Filas |
|---|---|---|---:|
| Filas leídas | Completitud | Conteo | 24 |
| T01 Unidad, moneda o país distinto de kWh / EUR / FR | Consistencia | Eliminar (cuarentena) | 0 |
| T02 Periodo con formato distinto de AAAA-S1/S2 | Validez | Eliminar (cuarentena) | 0 |
| T03 Precio nulo o no numérico | Completitud | Eliminar (cuarentena) | 0 |
| T04 Precio fuera de (0, 1) EUR/kWh | Validez | Eliminar (cuarentena) | 0 |
| T05 Periodo e impuesto repetidos | Unicidad | Eliminar (cuarentena) | 0 |
| Semestres sin precio en Eurostat -> precio del semestre más cercano (marcado) | Completitud | Completar dimensión | 2 |

## Tablas cargadas

| Tabla | Filas |
|---|---:|
| Dim_Fecha | 1,826 |
| Dim_Hora | 24 |
| Dim_Clima | 1,396 |
| Dim_Tarifa | 9 |
| Dim_Electrodomestico | 4 |
| Fact_Consumo_Hora | 34,151 |
| Fact_Consumo_Electrodomestico | 136,604 |
