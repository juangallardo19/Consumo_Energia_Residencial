import scrapy

ANIOS_FESTIVOS = range(2006, 2011)

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
