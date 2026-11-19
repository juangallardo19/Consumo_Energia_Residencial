# Resultados del ANOVA · Consumo diario de energía

Generado por `anova/anova_energia.py` a partir de las tablas limpias del ETL.

- **Unidad de análisis:** el día. Variable dependiente: consumo total del día (kWh).
- **Datos:** 1411 días completos (24 horas medidas) de 1431 días con medición. Los días con horas faltantes se excluyen porque su total sería artificialmente bajo.
- **Nivel de significancia:** α = 0,05.

## H1 · Tipo de día

**Pregunta:** ¿En los días festivos y fines de semana se consume más energía que en los laborables?

- **H₀ (nula):** El consumo diario promedio es igual en días laborables, fines de semana y festivos (μ_laborable = μ_fin de semana = μ_festivo).
- **H₁ (alternativa):** Al menos un tipo de día tiene un consumo diario promedio distinto.
- Variable dependiente: consumo diario (kWh). Variable categórica: `TipoDía`. α = 0,05.

### Estadística descriptiva

| Grupo | n (días) | Media kWh | Desv. estándar | Mediana |
|---|---:|---:|---:|---:|
| Laborable | 979 | 24,80 | 8,67 | 24,68 |
| Fin de semana | 389 | 29,79 | 12,09 | 28,89 |
| Festivo | 43 | 25,82 | 9,72 | 25,23 |

### Supuestos

**Normalidad (Shapiro-Wilk por grupo).** H₀: los datos del grupo son normales.

| Grupo | W | p-valor | ¿Normal? |
|---|---:|---:|---|
| Laborable | 0,9883 | < 0,0001 | No |
| Fin de semana | 0,9853 | 0,0005 | No |
| Festivo | 0,9660 | 0,2280 | Sí |

**Homogeneidad de varianzas (Levene).** H₀: las varianzas son iguales. Estadístico = 24,129, p = < 0,0001 → NO se cumple.

> Como algún supuesto no se cumple del todo, además del ANOVA clásico se reportan dos pruebas robustas: **ANOVA de Welch** (no exige varianzas iguales) y **Kruskal-Wallis** (no exige normalidad). Con muestras grandes el ANOVA es robusto a la falta de normalidad (teorema del límite central); si las tres pruebas coinciden, la conclusión es confiable.

### Resultados

| Prueba | Estadístico | gl | p-valor | Decisión (α = 0,05) |
|---|---:|---|---:|---|
| ANOVA de un factor | F = 36,45 | 2, 1408 | < 0,0001 | Rechazar H₀ |
| ANOVA de Welch | F = 27,41 | 2, 109,6 | < 0,0001 | Rechazar H₀ |
| Kruskal-Wallis | H = 59,58 | 2 | < 0,0001 | Rechazar H₀ |

**Tamaño del efecto:** η² = 0,049 → el factor explica el 4,9 % de la variación del consumo diario (pequeño).

### Comparaciones por pares (Tukey HSD)

| Comparación | Diferencia de medias (kWh) | p-valor | ¿Diferencia significativa? |
|---|---:|---:|---|
| Laborable − Fin de semana | -4,99 | < 0,0001 | Sí |
| Laborable − Festivo | -1,03 | 0,7780 | No |
| Fin de semana − Festivo | 3,97 | 0,0311 | Sí |

### Pregunta puntual: ¿en festivos se consume MÁS que en laborables?

- H₀: μ_festivo ≤ μ_laborable  ·  H₁: μ_festivo > μ_laborable (prueba t de Welch, una cola).
- Media festivos = 25,82 kWh (n = 43), laborables = 24,80 kWh (n = 979). t = 0,681, p = 0,2497 → **no se rechaza H₀**: con solo 43 festivos la diferencia no alcanza a ser estadísticamente significativa.

## H2 · Estación del año

**Pregunta:** ¿El consumo cambia según la estación (invierno vs verano)?

- **H₀ (nula):** El consumo diario promedio es igual en las cuatro estaciones (μ_invierno = μ_primavera = μ_verano = μ_otoño).
- **H₁ (alternativa):** Al menos una estación tiene un consumo diario promedio distinto.
- Variable dependiente: consumo diario (kWh). Variable categórica: `Estación`. α = 0,05.

### Estadística descriptiva

| Grupo | n (días) | Media kWh | Desv. estándar | Mediana |
|---|---:|---:|---:|---:|
| Invierno | 339 | 34,04 | 10,33 | 33,01 |
| Primavera | 363 | 26,48 | 7,53 | 26,33 |
| Verano | 355 | 17,42 | 6,77 | 17,87 |
| Otoño | 354 | 27,23 | 7,50 | 26,31 |

### Supuestos

**Normalidad (Shapiro-Wilk por grupo).** H₀: los datos del grupo son normales.

| Grupo | W | p-valor | ¿Normal? |
|---|---:|---:|---|
| Invierno | 0,9653 | < 0,0001 | No |
| Primavera | 0,9712 | < 0,0001 | No |
| Verano | 0,9856 | 0,0013 | No |
| Otoño | 0,9723 | < 0,0001 | No |

**Homogeneidad de varianzas (Levene).** H₀: las varianzas son iguales. Estadístico = 12,928, p = < 0,0001 → NO se cumple.

> Como algún supuesto no se cumple del todo, además del ANOVA clásico se reportan dos pruebas robustas: **ANOVA de Welch** (no exige varianzas iguales) y **Kruskal-Wallis** (no exige normalidad). Con muestras grandes el ANOVA es robusto a la falta de normalidad (teorema del límite central); si las tres pruebas coinciden, la conclusión es confiable.

### Resultados

| Prueba | Estadístico | gl | p-valor | Decisión (α = 0,05) |
|---|---:|---|---:|---|
| ANOVA de un factor | F = 246,07 | 3, 1407 | < 0,0001 | Rechazar H₀ |
| ANOVA de Welch | F = 249,04 | 3, 771,1 | < 0,0001 | Rechazar H₀ |
| Kruskal-Wallis | H = 532,04 | 3 | < 0,0001 | Rechazar H₀ |

**Tamaño del efecto:** η² = 0,344 → el factor explica el 34,4 % de la variación del consumo diario (grande).

### Comparaciones por pares (Tukey HSD)

| Comparación | Diferencia de medias (kWh) | p-valor | ¿Diferencia significativa? |
|---|---:|---:|---|
| Invierno − Primavera | 7,56 | < 0,0001 | Sí |
| Invierno − Verano | 16,62 | < 0,0001 | Sí |
| Invierno − Otoño | 6,81 | < 0,0001 | Sí |
| Primavera − Verano | 9,06 | < 0,0001 | Sí |
| Primavera − Otoño | -0,75 | 0,6042 | No |
| Verano − Otoño | -9,81 | < 0,0001 | Sí |

## H3 · Categoría térmica del día

**Pregunta:** ¿La temperatura del día (dato de Meteostat agregado en el ETL) influye en el consumo?

- **H₀ (nula):** El consumo diario promedio es igual en días fríos (< 10 °C), templados (10-20 °C) y cálidos (≥ 20 °C).
- **H₁ (alternativa):** Al menos una categoría térmica tiene un consumo diario promedio distinto.
- Variable dependiente: consumo diario (kWh). Variable categórica: `Categoria_Termica`. α = 0,05.

### Estadística descriptiva

| Grupo | n (días) | Media kWh | Desv. estándar | Mediana |
|---|---:|---:|---:|---:|
| Frío | 509 | 32,35 | 9,52 | 31,14 |
| Templado | 701 | 23,73 | 8,62 | 23,60 |
| Cálido | 156 | 17,76 | 6,01 | 18,16 |

### Supuestos

**Normalidad (Shapiro-Wilk por grupo).** H₀: los datos del grupo son normales.

| Grupo | W | p-valor | ¿Normal? |
|---|---:|---:|---|
| Frío | 0,9654 | < 0,0001 | No |
| Templado | 0,9755 | < 0,0001 | No |
| Cálido | 0,9857 | 0,1100 | Sí |

**Homogeneidad de varianzas (Levene).** H₀: las varianzas son iguales. Estadístico = 8,919, p = 0,0001 → NO se cumple.

> Como algún supuesto no se cumple del todo, además del ANOVA clásico se reportan dos pruebas robustas: **ANOVA de Welch** (no exige varianzas iguales) y **Kruskal-Wallis** (no exige normalidad). Con muestras grandes el ANOVA es robusto a la falta de normalidad (teorema del límite central); si las tres pruebas coinciden, la conclusión es confiable.

### Resultados

| Prueba | Estadístico | gl | p-valor | Decisión (α = 0,05) |
|---|---:|---|---:|---|
| ANOVA de un factor | F = 227,70 | 2, 1363 | < 0,0001 | Rechazar H₀ |
| ANOVA de Welch | F = 271,74 | 2, 506,4 | < 0,0001 | Rechazar H₀ |
| Kruskal-Wallis | H = 393,52 | 2 | < 0,0001 | Rechazar H₀ |

**Tamaño del efecto:** η² = 0,250 → el factor explica el 25,0 % de la variación del consumo diario (grande).

### Comparaciones por pares (Tukey HSD)

| Comparación | Diferencia de medias (kWh) | p-valor | ¿Diferencia significativa? |
|---|---:|---:|---|
| Frío − Templado | 8,62 | < 0,0001 | Sí |
| Frío − Cálido | 14,59 | < 0,0001 | Sí |
| Templado − Cálido | 5,97 | < 0,0001 | Sí |

## Conclusiones

- **H1 · Tipo de día:** hay diferencias significativas (p < 0,0001, η² = 0,049). Mayor consumo: Fin de semana (29,79 kWh/día); menor: Laborable (24,80 kWh/día).
- **H2 · Estación del año:** hay diferencias significativas (p < 0,0001, η² = 0,344). Mayor consumo: Invierno (34,04 kWh/día); menor: Verano (17,42 kWh/día).
- **H3 · Categoría térmica del día:** hay diferencias significativas (p < 0,0001, η² = 0,250). Mayor consumo: Frío (32,35 kWh/día); menor: Cálido (17,76 kWh/día).
