#!/usr/bin/env bash
# Compila src/app.jsx a app.js (React incluido, sin dependencias de CDN).
# Requiere Node.js y npm. Ejecuta desde cualquier directorio: ./build.sh
set -euo pipefail
cd "$(dirname "$0")"

# Instala dependencias la primera vez (o si faltan)
if [ ! -d src/node_modules ]; then
  echo "Instalando dependencias (esbuild, react, react-dom)..."
  (cd src && npm install --silent)
fi

npx --prefix src esbuild src/app.jsx \
  --bundle --minify --jsx=automatic --target=es2017 \
  --outfile=app.js

node --check app.js
echo "OK: app.js generado ($(wc -c < app.js) bytes)"
