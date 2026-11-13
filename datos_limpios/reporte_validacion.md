# Reporte de validación

Pruebas: 38 | Pasan: 38 | Fallan: 0

| Resultado | Dimensión | Prueba | Detalle |
|---|---|---|---|
| PASA | Completitud | Dim_Fecha sin valores nulos | 0 nulos |
| PASA | Completitud | Dim_Hora sin valores nulos | 0 nulos |
| PASA | Completitud | Dim_Clima sin valores nulos | 0 nulos |
| PASA | Completitud | Dim_Tarifa sin valores nulos | 0 nulos |
| PASA | Completitud | Dim_Electrodomestico sin valores nulos | 0 nulos |
| PASA | Completitud | Fact_Consumo_Hora sin valores nulos | 0 nulos |
| PASA | Completitud | Fact_Consumo_Electrodomestico sin valores nulos | 0 nulos |
| PASA | Completitud | Minutos leídos = válidos + rechazados (no se pierde ni inventa nada) | 2,075,259 = 2,049,247 + 26,012 |
| PASA | Completitud | Toda fila rechazada tiene motivo |  |
| PASA | Completitud | Clima disponible para >= 90 % de las horas con consumo | 96.8% |
| PASA | Validez | Sin valores negativos en las medidas | 0 negativos |
| PASA | Validez | Voltaje medio entre 200 y 260 V | 225.83-251.9 V |
| PASA | Validez | Minutos medidos por hora entre 45 y 60 |  |
| PASA | Validez | Energía de una hora <= potencia máxima x 1 h |  |
| PASA | Validez | Temperatura mínima <= media <= máxima |  |
| PASA | Validez | Humedad entre 0 y 100 % |  |
| PASA | Validez | Precios del kWh entre 0 y 1 EUR y con impuestos >= sin impuestos |  |
| PASA | Unicidad | Dim_Fecha: llave Fecha sin repetir | 0 repetidas |
| PASA | Unicidad | Dim_Hora: llave Hora sin repetir | 0 repetidas |
| PASA | Unicidad | Dim_Clima: llave Fecha sin repetir | 0 repetidas |
| PASA | Unicidad | Dim_Tarifa: llave ID_Periodo_Tarifa sin repetir | 0 repetidas |
| PASA | Unicidad | Dim_Electrodomestico: llave ID_Electrodomestico sin repetir | 0 repetidas |
| PASA | Unicidad | Fact_Consumo_Hora: llave Fecha + Hora sin repetir | 0 repetidas |
| PASA | Unicidad | Fact_Consumo_Electrodomestico: llave Fecha + Hora + ID_Electrodomestico sin repetir | 0 repetidas |
| PASA | Integridad ref. | Fact_Consumo_Hora.Fecha -> Dim_Fecha.Fecha | 0 huérfanas |
| PASA | Integridad ref. | Fact_Consumo_Hora.Hora -> Dim_Hora.Hora | 0 huérfanas |
| PASA | Integridad ref. | Fact_Consumo_Hora.ID_Periodo_Tarifa -> Dim_Tarifa.ID_Periodo_Tarifa | 0 huérfanas |
| PASA | Integridad ref. | Fact_Consumo_Electrodomestico.Fecha -> Dim_Fecha.Fecha | 0 huérfanas |
| PASA | Integridad ref. | Fact_Consumo_Electrodomestico.Hora -> Dim_Hora.Hora | 0 huérfanas |
| PASA | Integridad ref. | Fact_Consumo_Electrodomestico.ID_Electrodomestico -> Dim_Electrodomestico.ID_Electrodomestico | 0 huérfanas |
| PASA | Integridad ref. | Dim_Clima.Fecha -> Dim_Fecha.Fecha | 0 huérfanas |
| PASA | Consistencia | Suma por electrodoméstico = energía total | diferencia 0.0000 kWh de 37,274.2 |
| PASA | Consistencia | En cada hora: cocina + lavandería + calentador + resto = total | máxima diferencia 0.000000 kWh |
| PASA | Consistencia | Dim_Fecha es un calendario continuo de años completos |  |
| PASA | Consistencia | Entre 10 y 11 festivos por año | {2006: 11, 2007: 11, 2008: 10, 2009: 11, 2010: 11} |
| PASA | Consistencia | TipoDía coherente (festivo > fin de semana > laborable) |  |
| PASA | Exactitud | Energía cargada = energía que calculó el ETL (sin pérdidas al cargar) | 37,274.205 vs 37,274.205 kWh |
| PASA | Exactitud | Recalculo desde el crudo de 4 días (96 horas) coincide con el hecho | máxima diferencia 0.000000 kWh |
