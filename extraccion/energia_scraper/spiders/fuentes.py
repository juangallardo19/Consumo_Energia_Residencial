"""Spider de extracción: descarga las 4 fuentes del proyecto a datos_sucios/.

Fuentes (todas públicas y abiertas):
  1. energia  -> UCI ML Repository: consumo eléctrico minuto a minuto de una casa en Sceaux (Francia),
                 dic-2006 a nov-2010. Formato: .zip con un .txt separado por ';'.
  2. clima    -> Meteostat (bulk): observaciones HORARIAS de la estación París-Montsouris (07156),
                 a ~7 km de Sceaux. Formato: .csv.gz sin encabezado.
  3. festivos -> API oficial del gobierno francés (calendrier.api.gouv.fr): días festivos de
                 Francia metropolitana, un JSON por año (2006-2010).
  4. tarifas  -> Eurostat (nrg_pc_204): precio semestral del kWh para hogares en Francia
                 (banda de consumo 2.500-4.999 kWh/año), con y sin impuestos. Formato: SDMX-CSV.

Uso (desde la carpeta extraccion/):
    scrapy crawl fuentes                     # todas las fuentes
    scrapy crawl fuentes -a solo=clima       # solo una (energia | clima | festivos | tarifas)
"""
import scrapy

ANIOS_FESTIVOS = range(2006, 2011)

# Espejos de respaldo: si la URL oficial no responde, se intenta con una copia idéntica del archivo
# (queda anotado en el manifiesto cuál URL se usó realmente).
RESPALDOS = {
    "household_power_consumption.zip": (
        "Espejo GitHub jbrownlee/Datasets (copia del zip original de UCI)",
        "https://raw.githubusercontent.com/jbrownlee/Datasets/master/household_power_consumption.zip",
    ),
}

FUENTES = {
    "energia": [
        ("UCI ML Repository",
         "https://archive.ics.uci.edu/static/public/235/individual+household+electric+power+consumption.zip",
         "household_power_consumption.zip"),
    ],
    "clima": [
        ("Meteostat - estación 07156 París-Montsouris",
         "https://bulk.meteostat.net/v2/hourly/07156.csv.gz",
         "clima_paris_montsouris_horario.csv.gz"),
    ],
    "festivos": [
        ("API calendrier.api.gouv.fr",
         f"https://calendrier.api.gouv.fr/jours-feries/metropole/{anio}.json",
         f"festivos_francia_{anio}.json")
        for anio in ANIOS_FESTIVOS
    ],
    "tarifas": [
        ("Eurostat nrg_pc_204",
         "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/nrg_pc_204/"
         "S.E7000.KWH2500-4999.KWH.X_TAX+X_VAT+I_TAX.EUR.FR/"
         "?format=SDMX-CSV&startPeriod=2006-S1&endPeriod=2011-S1",
         "tarifas_electricidad_eurostat.csv"),
    ],
}


class FuentesSpider(scrapy.Spider):
    name = "fuentes"

    def __init__(self, solo=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if solo and solo not in FUENTES:
            raise ValueError(f"Fuente desconocida '{solo}'. Opciones: {', '.join(FUENTES)}")
        self.solo = solo

    async def start(self):
        for clave, lista in FUENTES.items():
            if self.solo and clave != self.solo:
                continue
            for nombre, url, archivo in lista:
                yield scrapy.Request(
                    url,
                    callback=self.parse,
                    errback=self.error,
                    meta={"fuente": nombre, "archivo": archivo},
                )

    def parse(self, response):
        yield {
            "fuente": response.meta["fuente"],
            "archivo": response.meta["archivo"],
            "url": response.url,
            "estado_http": response.status,
            "tipo_contenido": response.headers.get("Content-Type", b"").decode("latin-1"),
            "contenido": response.body,
        }

    def error(self, failure):
        peticion = failure.request
        self.logger.error(f"No se pudo descargar {peticion.url}: {failure.value!r}")
        archivo = peticion.meta["archivo"]
        if archivo in RESPALDOS and not peticion.meta.get("es_respaldo"):
            nombre, url = RESPALDOS[archivo]
            self.logger.warning(f"Intentando con el respaldo: {url}")
            yield scrapy.Request(url, callback=self.parse, errback=self.error,
                                 meta={"fuente": nombre, "archivo": archivo, "es_respaldo": True})
