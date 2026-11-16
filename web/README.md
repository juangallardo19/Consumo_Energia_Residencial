# Página web del dashboard

Sitio estático (HTML + CSS + JS, sin build) que presenta el proyecto y el dashboard de Power BI con
animaciones de scroll y parallax. Todas las cifras salen del modelo real (`datos_limpios/`, generado por el ETL).

## Cómo abrirla

- **Doble clic** en `web/index.html`. Funciona sin servidor y sin internet (las librerías están en `vendor/`).
  El iframe de Power BI y las fuentes de Google sí necesitan internet.
- O con un servidor local, desde la raíz del repo:

```bash
python -m http.server 8000 --directory web
```

  y abrir <http://localhost:8000>.

- Para publicarla, basta subir el contenido de `web/` a cualquier hosting estático (GitHub Pages, Netlify, Vercel).

## Estructura

```
web/
├── index.html              <- página
├── css/styles.css          <- estilos (papel crema, tinta negra y bloques pastel con borde)
├── js/charts.js            <- gráficas SVG hechas a mano (barras, curva horaria, dona, medidores)
├── js/main.js              <- filtros Año/Estación, parallax y animaciones (GSAP, ScrollTrigger, SplitText, DrawSVG, Lenis)
├── data/dashboard.js       <- datos reales agregados (generado, ver abajo)
├── vendor/                 <- gsap 3.14.2 con ScrollTrigger, SplitText y DrawSVG; lenis 1.1.13 (copias de npm)
└── scripts/generar_datos.py
```

## De dónde salen los datos

`scripts/generar_datos.py` lee las tablas de `datos_limpios/` y replica las medidas del reporte:

| Medida en Power BI | Cálculo |
|---|---|
| Energía Total kWh | `SUM(Fact_Consumo_Hora[Energia_Activa_kWh])` |
| Costo Energía EUR | energía de cada hora × `Dim_Tarifa[Precio_kWh_Con_Impuestos_EUR]` de su semestre |
| Consumo Promedio Diario kWh | Energía Total ÷ días con medición |
| Potencia Máxima kW | `MAX(Fact_Consumo_Hora[Potencia_Max_kW])` |

Guarda los totales por **AñoMes × Estación** para que los filtros de la página recalculen las tarjetas
igual que los segmentadores del reporte. También guarda el perfil por hora, la proporción por zona, el consumo
por estación, por categoría térmica y por tipo de día.

Si se vuelve a correr el ETL, se regeneran los datos de la web con:

```bash
python web/scripts/generar_datos.py
```
