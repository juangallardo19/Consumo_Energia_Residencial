import argparse
import json
import subprocess
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

RAIZ = Path(__file__).resolve().parent
SUCIOS = RAIZ / "datos_sucios"
ZIP_ENERGIA = SUCIOS / "household_power_consumption.zip"
TXT_ENERGIA = SUCIOS / "household_power_consumption.txt"
CRUDOS = [
    "clima_paris_montsouris_horario.csv.gz",
    "tarifas_electricidad_eurostat.csv",
    *[f"festivos_francia_{anio}.json" for anio in range(2006, 2011)],
]


def ejecutar(nombre, comando, carpeta=RAIZ):
    print(f"\n{'=' * 70}\n{nombre}\n{'=' * 70}", flush=True)
    inicio = time.time()
    resultado = subprocess.run(comando, cwd=carpeta)
    segundos = time.time() - inicio
    if resultado.returncode != 0:
        print(f"\n[PIPELINE DETENIDO] Falló: {nombre} (código {resultado.returncode})")
        sys.exit(resultado.returncode)
    return segundos


def comprobar_descarga(inicio):
    manifiesto = SUCIOS / "_manifiesto_extraccion.json"
    registros = {}
    if manifiesto.exists():
        registros = {m["archivo"]: m for m in json.loads(manifiesto.read_text("utf-8"))}
    esperados = [ZIP_ENERGIA.name, *CRUDOS]
    fallidos = [a for a in esperados
                if a not in registros or datetime.fromisoformat(registros[a]["descargado_utc"]) < inicio]
    if fallidos:
        print(f"\n[PIPELINE DETENIDO] Scrapy no logró descargar: {', '.join(fallidos)}")
        print("Revisa la conexión o el log de Scrapy y vuelve a intentar.")
        sys.exit(1)
    print(f"Comprobado: las {len(esperados)} descargas quedaron en el manifiesto con su SHA-256.")


def extraer(forzar):
    faltan = [c for c in CRUDOS if not (SUCIOS / c).exists()]
    if forzar or faltan or not (ZIP_ENERGIA.exists() or TXT_ENERGIA.exists()):
        inicio = datetime.now(timezone.utc).replace(microsecond=0)
        segundos = ejecutar("1. EXTRACT · Scrapy descarga las 4 fuentes",
                            [sys.executable, "-m", "scrapy", "crawl", "fuentes"], RAIZ / "extraccion")
        comprobar_descarga(inicio)
        return segundos
    print(f"\n{'=' * 70}\n1. EXTRACT · datos crudos ya presentes en datos_sucios/\n{'=' * 70}")
    if not TXT_ENERGIA.exists():
        print("Descomprimiendo household_power_consumption.zip ...")
        with zipfile.ZipFile(ZIP_ENERGIA) as z:
            z.extractall(SUCIOS)
    print("Usa --extraer para volver a descargarlos con Scrapy.")
    return 0.0


def main():
    parser = argparse.ArgumentParser(description="Pipeline completo: Extract -> Transform -> Load -> Validación -> ANOVA")
    parser.add_argument("--extraer", action="store_true", help="vuelve a descargar las fuentes con Scrapy")
    args = parser.parse_args()

    tiempos = {"1. Extract (Scrapy)": extraer(args.extraer)}
    tiempos["2-3. Transform + Load (PySpark -> CSV, Parquet, SQLite)"] = ejecutar(
        "2-3. TRANSFORM + LOAD · PySpark limpia, arma el modelo estrella y carga",
        [sys.executable, str(RAIZ / "etl" / "etl_energia.py")])
    tiempos["4. Validación de calidad (46 pruebas)"] = ejecutar(
        "4. VALIDACIÓN · compuerta de calidad (si falla, el pipeline se detiene)",
        [sys.executable, str(RAIZ / "etl" / "validar_calidad.py")])
    tiempos["5. ANOVA (3 hipótesis)"] = ejecutar(
        "5. ANOVA · pruebas estadísticas sobre la base de datos",
        [sys.executable, str(RAIZ / "anova" / "anova_energia.py")])

    print(f"\n{'=' * 70}\nPIPELINE COMPLETO\n{'=' * 70}")
    for paso, segundos in tiempos.items():
        print(f"  {paso:58s} {segundos:6.1f} s")
    print(f"  {'Total':58s} {sum(tiempos.values()):6.1f} s")
    print("\nResultados:")
    print("  datos_limpios/                      tablas para Power BI (CSV y parquet/)")
    print("  datos_limpios/energia_residencial.db base de datos SQLite con PK, FK y resultados del ANOVA")
    print("  datos_limpios/reporte_calidad.md    reglas aplicadas y filas afectadas")
    print("  datos_limpios/reporte_validacion.md resultado de las 46 pruebas")
    print("  anova/resultados_anova.md           hipótesis, supuestos, p-valores y conclusiones")
    print("  rechazados/                         filas eliminadas con su motivo")


if __name__ == "__main__":
    main()
