import hashlib
import io
import json
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from scrapy.exceptions import DropItem


class GuardarCrudoPipeline:
    def open_spider(self, spider):
        self.carpeta = Path(spider.settings.get("DATOS_SUCIOS_DIR"))
        self.carpeta.mkdir(parents=True, exist_ok=True)
        self.ruta_manifiesto = self.carpeta / "_manifiesto_extraccion.json"
        self.manifiesto = {}
        if self.ruta_manifiesto.exists():
            self.manifiesto = {m["archivo"]: m for m in json.loads(self.ruta_manifiesto.read_text("utf-8"))}

    def process_item(self, item, spider):
        contenido = item["contenido"]
        if not contenido:
            raise DropItem(f"Respuesta vacía para {item['url']}")
        problema = self.revisar_formato(item["archivo"], contenido)
        if problema:
            raise DropItem(f"{item['archivo']} descartado: {problema} ({item['url']})")

        destino = self.carpeta / item["archivo"]
        temporal = destino.with_name(destino.name + ".parcial")
        temporal.write_bytes(contenido)
        temporal.replace(destino)

        registro = {
            "fuente": item["fuente"],
            "archivo": item["archivo"],
            "url": item["url"],
            "estado_http": item["estado_http"],
            "tipo_contenido": item["tipo_contenido"],
            "bytes": len(contenido),
            "sha256": hashlib.sha256(contenido).hexdigest(),
            "descargado_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }

        if destino.suffix == ".zip":
            with zipfile.ZipFile(destino) as z:
                z.extractall(self.carpeta)
                registro["archivos_extraidos"] = z.namelist()

        self.manifiesto[item["archivo"]] = registro
        spider.logger.info(f"Guardado {destino.name} ({len(contenido):,} bytes)")
        return {k: v for k, v in registro.items()}

    @staticmethod
    def revisar_formato(archivo, contenido):
        if archivo.endswith(".zip"):
            try:
                with zipfile.ZipFile(io.BytesIO(contenido)) as z:
                    if z.testzip() is not None or not z.namelist():
                        return "zip dañado o vacío"
            except zipfile.BadZipFile:
                return "no es un zip válido"
        elif archivo.endswith(".gz"):
            if contenido[:2] != b"\x1f\x8b":
                return "no es un archivo gzip"
        elif archivo.endswith(".json"):
            try:
                datos = json.loads(contenido)
            except ValueError:
                return "no es un JSON válido"
            if not isinstance(datos, dict) or not datos:
                return "JSON vacío o con estructura inesperada"
        elif archivo.endswith(".csv"):
            encabezado = contenido[:500].decode("utf-8", errors="replace")
            if "TIME_PERIOD" not in encabezado or "OBS_VALUE" not in encabezado:
                return "CSV sin las columnas esperadas"
        return None

    def close_spider(self, spider):
        datos = sorted(self.manifiesto.values(), key=lambda m: m["archivo"])
        self.ruta_manifiesto.write_text(json.dumps(datos, indent=2, ensure_ascii=False), "utf-8")
