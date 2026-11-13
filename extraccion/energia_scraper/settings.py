"""Configuración de Scrapy para la EXTRACCIÓN (la "E" del ETL).

Scrapy aquí no "raspa" HTML: descarga archivos y respuestas de APIs públicas tal como vienen
(datos crudos / capa bronce). Nada se limpia en este paso; eso lo hace el ETL de PySpark.
"""
from pathlib import Path

BOT_NAME = "energia_scraper"
SPIDER_MODULES = ["energia_scraper.spiders"]
NEWSPIDER_MODULE = "energia_scraper.spiders"

# Carpeta donde quedan los datos crudos: <proyecto>/datos_sucios
DATOS_SUCIOS_DIR = str(Path(__file__).resolve().parents[2] / "datos_sucios")

# Buenas prácticas de scraping responsable
ROBOTSTXT_OBEY = True                  # se respeta robots.txt de cada sitio
USER_AGENT = "Grupo7-ETL-Energia (proyecto academico de ingenieria de datos)"
CONCURRENT_REQUESTS = 4
CONCURRENT_REQUESTS_PER_DOMAIN = 1     # una petición a la vez por sitio
DOWNLOAD_DELAY = 1                     # 1 s entre peticiones al mismo sitio
DOWNLOAD_TIMEOUT = 900                 # el zip de UCI (~20 MB) puede tardar
DOWNLOAD_WARNSIZE = 64 * 1024 * 1024
RETRY_ENABLED = True
RETRY_TIMES = 3

ITEM_PIPELINES = {
    "energia_scraper.pipelines.GuardarCrudoPipeline": 300,
}

FEED_EXPORT_ENCODING = "utf-8"
LOG_LEVEL = "INFO"
