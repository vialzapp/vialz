#!/bin/sh
# Rebuilds the mark from mark.py and renders the X avatar and banner: sh render.sh
set -e
cd "$(dirname "$0")"
python3 -I mark.py 0.5
sh shoot.sh shot.html 400 400 1 avatar-400.png
sh shoot.sh shot.html 400 400 2 avatar-800.png
sh shoot.sh banner.html 1500 500 1 banner-1500x500.png
sh shoot.sh banner.html 1500 500 2 banner-3000x1000.png
