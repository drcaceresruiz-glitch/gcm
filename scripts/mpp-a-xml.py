"""
Convierte los .mpp de MS Project a XML (formato MSPDI).

POR QUE EXISTE
--------------
GCM importa el cronograma desde el XML de Project, pero el .mpp es un formato
binario propietario y sin especificacion publica: no hay ningun lector fiable
en JavaScript, y el servidor —CloudLinux compartido— no corre Java ni modulos
nativos. Es la misma restriccion por la que Prisma usa aqui el adaptador JS y
no su motor en Rust.

Guardar como XML desde el propio Project seria lo natural, pero en esta
instalacion falla: deja el archivo en cero bytes. Asi que la conversion se hace
aqui, en el escritorio, con MPXJ —la unica libreria que lee .mpp bien, fruto de
veinte anos de ingenieria inversa—.

ESTO NO CORRE EN EL SERVIDOR y no debe intentarse: es una herramienta de
escritorio. Lo que se sube a GCM es el XML que produce.

REQUISITOS (una sola vez)
-------------------------
    winget install --id EclipseAdoptium.Temurin.21.JRE
    python -m venv .venv-mpxj
    .venv-mpxj\\Scripts\\python.exe -m pip install mpxj JPype1

USO
---
    .venv-mpxj\\Scripts\\python.exe scripts\\mpp-a-xml.py

Recorre `docs/referencias`, convierte cada .mpp y deja el .xml al lado con el
mismo nombre. No recibe argumentos a proposito: las rutas con espacios se
rompen al pasar por las capas de shell de Windows.
"""

import glob
import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA = os.path.join(RAIZ, "docs", "referencias")

try:
    import mpxj  # noqa: F401  (solo anade los JAR de MPXJ al classpath)
    import jpype
    import jpype.imports
except ImportError as e:
    print("Falta una dependencia:", e)
    print("Instala con: .venv-mpxj\\Scripts\\python.exe -m pip install mpxj JPype1")
    sys.exit(1)

jpype.startJVM()

# El paquete es `org.mpxj` desde la version 13. En las anteriores era
# `net.sf.mpxj`, que es lo que sigue diciendo casi toda la documentacion.
from org.mpxj.reader import UniversalProjectReader  # noqa: E402
from org.mpxj.mspdi import MSPDIWriter  # noqa: E402

origenes = sorted(glob.glob(os.path.join(CARPETA, "*.mpp")))

if not origenes:
    print("No hay ningun .mpp en", CARPETA)
    sys.exit(0)

for origen in origenes:
    destino = os.path.splitext(origen)[0] + ".xml"
    proyecto = UniversalProjectReader().read(origen)
    MSPDIWriter().write(proyecto, destino)
    print(
        f"{os.path.basename(origen)} -> {os.path.basename(destino)} "
        f"({proyecto.getTasks().size()} tareas, "
        f"{os.path.getsize(destino) // 1024} KB)"
    )

jpype.shutdownJVM()
