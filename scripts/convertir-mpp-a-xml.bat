@echo off
rem Convierte .mpp de MS Project a XML, para subirlo despues a GCM.
rem
rem Dos formas de usarlo:
rem   - Soltar uno o varios .mpp encima de este archivo.
rem   - Hacerle doble clic sin mas: convierte todo lo que haya en
rem     docs\referencias.
rem
rem El .xml queda al lado del .mpp, con el mismo nombre.

setlocal
cd /d "%~dp0.."

if not exist ".venv-mpxj\Scripts\python.exe" (
  echo.
  echo No esta preparado el entorno. Ejecuta una sola vez:
  echo.
  echo   winget install --id EclipseAdoptium.Temurin.21.JRE
  echo   python -m venv .venv-mpxj
  echo   .venv-mpxj\Scripts\python.exe -m pip install mpxj JPype1
  echo.
  pause
  exit /b 1
)

echo Convirtiendo...
echo.
".venv-mpxj\Scripts\python.exe" "scripts\mpp-a-xml.py" %*

echo.
echo Listo. Sube el .xml a GCM, en la obra ^> Cronograma ^> Importar.
pause
