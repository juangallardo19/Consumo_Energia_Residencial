# Página web del dashboard (Angular)

Sitio en **Angular 22** que presenta el proyecto, sus 10 requerimientos analíticos, el ANOVA y el dashboard de
Power BI, con scroll suave, parallax y animaciones (GSAP + ScrollTrigger + SplitText, Lenis).

**Todas las cifras salen del informe de Power BI** (`Dashboard_Energia.pbix`), no de los CSV del ETL: el script
`scripts/extraer_powerbi.py` abre el modelo tabular que va dentro del `.pbix` (el mismo que está publicado en
Power BI Service) y replica sus medidas DAX.

## Cómo verla

Requiere Node.js 20 o superior. Desde la carpeta `web/`:

```bash
npm install
```

```bash
npm start
```

y abrir <http://localhost:4200>. Para generar la versión publicable:

```bash
npm run build
```

El resultado queda en `web/dist/browser/` y se puede subir tal cual a cualquier hosting estático (GitHub Pages,
Netlify, Vercel). Usa rutas relativas, así que funciona también dentro de una subcarpeta. A diferencia de la versión
anterior, no se abre con doble clic: los navegadores bloquean los módulos de JavaScript desde `file://`. Para probar
el build sin Node: `python -m http.server 8000 --directory web/dist/browser`.

## De dónde salen los datos

```
Dashboard_Energia.pbix ──(pbixray)──> scripts/extraer_powerbi.py ──> src/app/data/powerbi.json ──> Angular
```

El `.pbix` es un zip; su `DataModel` guarda el modelo VertiPaq con las 7 tablas del modelo estrella, las 12 medidas
DAX y las columnas calculadas (`Consumo_Dia_kWh`, `Nivel_Consumo`). El script las lee y guarda los datos al nivel que
necesitan los segmentadores **Año** y **Estación**; la página recalcula las medidas en el navegador al filtrar:

| Medida del reporte | Cómo se recalcula en la web |
|---|---|
| Energía Total kWh | suma de la energía de los meses filtrados |
| Costo Energía EUR | `SUMX(Fact_Consumo_Hora, Energía × RELATED(Dim_Tarifa[Precio_kWh_Con_Impuestos_EUR]))`, agregado por mes |
| Consumo Promedio Diario kWh | `AVERAGEX(VALUES(Dim_Fecha[Fecha]), [Energía Total kWh])` = energía ÷ días con medición |
| Consumo Promedio por Hora kWh | energía ÷ horas medidas, por hora, franja y día de la semana |
| Potencia Máxima kW | máximo de `Potencia_Max_kW` |
| Umbral Inusual kWh / Horas Inusuales | media + 2 × STDEV.P sobre todas las horas; se guardan las 1.646 horas que lo superan |
| Energía Electrodoméstico kWh | suma por zona y mes |
| Nivel_Consumo (columna calculada) | se toma tal cual del modelo, día por día |

El ANOVA (`anova` en el JSON) se calcula en el mismo script con SciPy sobre los días del modelo que tienen las 24
horas medidas (1.411 días). Los resultados coinciden con `anova/resultados_anova.md`.

Si cambia el informe, se regeneran los datos desde la raíz del repo con:

```bash
pip install pbixray scipy pandas
```

```bash
python web/scripts/extraer_powerbi.py
```

## Estructura

```
web/
├── scripts/extraer_powerbi.py    <- .pbix → src/app/data/powerbi.json
├── src/
│   ├── index.html, styles.css    <- estilos globales (papel crema, tinta negra, bloques pastel con borde)
│   └── app/
│       ├── app.ts                <- orden de las secciones
│       ├── data/                 <- powerbi.json (generado) y modelo.ts (tipos, paleta)
│       ├── core/                 <- medidas (señales con los segmentadores), motion (GSAP/Lenis, parallax,
│       │                            contadores), tooltip, filtros, formato es-ES
│       ├── charts/               <- gráficas SVG propias: barras, líneas, curva horaria, dona, mapa de calor,
│       │                            dispersión, columnas 100 %, caja, Tukey y distribución F
│       └── secciones/            <- hero, proyecto, resumen, horario, eventos, consumo (zonas, clima, costo),
│                                    anova y cierre (pipeline, dashboard, pie)
└── angular.json, package.json
```

## Secciones y requerimientos

| Sección | Requerimiento | Página del reporte |
|---|---|---|
| Resumen (día / mes / año) | 1 | Resumen |
| Un día en la casa | 2 y 8 | Patrones horarios |
| Patrones: tipo de día, franjas, mapa de calor | 3 | Patrones horarios |
| Eventos inusuales y clasificación de días | 4 y 9 | Eventos inusuales y clasificación |
| Zonas | 5 | Electrodomésticos y costo |
| Clima: invierno vs verano, temperatura, tendencia anual | 6 y 7 | Estaciones y clima |
| Costo mensual y tarifas | 10 | Electrodomésticos y costo |
| ANOVA (H1 tipo de día, H2 estación, H3 temperatura) | 3, 6 y 7 | — |

Las animaciones respetan la opción del sistema "reducir movimiento": con ella activa todo se muestra estático.
