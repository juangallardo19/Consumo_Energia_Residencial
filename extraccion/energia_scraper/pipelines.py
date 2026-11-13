"""Pipeline de Scrapy: guarda cada respuesta TAL CUAL en datos_sucios/ y deja un manifiesto.

Buenas prácticas aplicadas (capa "bronce" / datos crudos):
  - El dato crudo no se modifica: se guarda el archivo exactamente como lo entregó la fuente.
  - Trazabilidad: por cada archivo se anota URL, fecha de descarga, tamaño y huella SHA-256
    en datos_sucios/_manifiesto_extraccion.json. Si la fuente cambia, la huella cambia.
  - El zip de UCI además se descomprime (sigue siendo dato crudo, solo cambia el empaque).
"""
import hashlib
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

        destino = self.carpeta / item["archivo"]
        destino.write_bytes(contenido)

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
        # Se devuelve un resumen (sin los bytes) para que el log no imprima el archivo entero
        return {k: v for k, v in registro.items()}

    def close_spider(self, spider):
        datos = sorted(self.manifiesto.values(), key=lambda m: m["archivo"])
        self.ruta_manifiesto.write_text(json.dumps(datos, indent=2, ensure_ascii=False), "utf-8")
