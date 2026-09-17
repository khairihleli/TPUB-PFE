#!/usr/bin/env sh
# Télécharge les données Tesseract « fast » (fra, eng, ara) pour l'OCR Tess4J (docs/round2-contract.md §2.2).
# Usage : scripts/fetch-tessdata.sh [dossier_cible]   (par défaut : BackEnd/tessdata)
# Idempotent : un fichier existant de plus de 100 Ko est conservé. Chaque fichier est vérifié par SHA-256.
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
TARGET=${1:-"$SCRIPT_DIR/../tessdata"}
BASE_URL="https://github.com/tesseract-ocr/tessdata_fast/raw/4.1.0"
SUMS="$SCRIPT_DIR/tessdata.sha256"
LANGS="fra eng ara"
MIN_BYTES=102400

if command -v sha256sum >/dev/null 2>&1; then
  sha() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
  sha() { shasum -a 256 "$1" | awk '{print $1}'; }
else
  echo "Erreur : sha256sum ou shasum est requis pour vérifier les fichiers." >&2
  exit 1
fi

if command -v curl >/dev/null 2>&1; then
  download() { curl -fsSL --retry 3 -o "$2" "$1"; }
elif command -v wget >/dev/null 2>&1; then
  download() { wget -q -O "$2" "$1"; }
else
  echo "Erreur : curl ou wget est requis pour télécharger les données." >&2
  exit 1
fi

mkdir -p "$TARGET"
for lang in $LANGS; do
  file="$TARGET/$lang.traineddata"
  expected=$(awk -v name="$lang.traineddata" '$2 == name {print $1}' "$SUMS")
  if [ -z "$expected" ]; then
    echo "Erreur : empreinte SHA-256 absente pour $lang.traineddata dans $SUMS." >&2
    exit 1
  fi
  if [ -f "$file" ] && [ "$(wc -c < "$file")" -gt "$MIN_BYTES" ]; then
    echo "Déjà présent : $lang.traineddata"
  else
    echo "Téléchargement de $lang.traineddata…"
    download "$BASE_URL/$lang.traineddata" "$file.part"
    mv "$file.part" "$file"
  fi
  actual=$(sha "$file")
  if [ "$actual" != "$expected" ]; then
    echo "Erreur : empreinte SHA-256 inattendue pour $lang.traineddata ; fichier supprimé." >&2
    rm -f "$file"
    exit 1
  fi
done
echo "Données Tesseract prêtes dans $TARGET"
