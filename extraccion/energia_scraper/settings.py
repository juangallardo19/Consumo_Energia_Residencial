from pathlib import Path

BOT_NAME = "energia_scraper"
SPIDER_MODULES = ["energia_scraper.spiders"]
NEWSPIDER_MODULE = "energia_scraper.spiders"

DATOS_SUCIOS_DIR = str(Path(__file__).resolve().parents[2] / "datos_sucios")

ROBOTSTXT_OBEY = True
USER_AGENT = "Grupo7-ETL-Energia (proyecto academico de ingenieria de datos)"
CONCURRENT_REQUESTS = 4
CONCURRENT_REQUESTS_PER_DOMAIN = 1
DOWNLOAD_DELAY = 1
DOWNLOAD_TIMEOUT = 900
DOWNLOAD_WARNSIZE = 64 * 1024 * 1024
RETRY_ENABLED = True
RETRY_TIMES = 3

ITEM_PIPELINES = {
    "energia_scraper.pipelines.GuardarCrudoPipeline": 300,
}

FEED_EXPORT_ENCODING = "utf-8"
LOG_LEVEL = "INFO"
