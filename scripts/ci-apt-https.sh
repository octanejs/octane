#!/usr/bin/env bash
set -euo pipefail

# Blacksmith's Ubuntu mirror list uses HTTP, which can fail to connect while
# HTTPS remains reachable. Use Ubuntu's HTTPS mirrors without changing suites
# or package verification; Sonic does not serve this mirror over HTTPS.
shopt -s nullglob
for source in \
  /etc/apt/blacksmith-ubuntu-mirrors.txt \
  /etc/apt/sources.list \
  /etc/apt/sources.list.d/*.list \
  /etc/apt/sources.list.d/*.sources; do
  [[ -f "$source" ]] || continue
  sudo sed -i -E \
    -e 's#http://((archive|security|us\.archive)\.ubuntu\.com/ubuntu)#https://\1#g' \
    -e 's#http://mirrors\.sonic\.net/ubuntu#https://archive.ubuntu.com/ubuntu#g' \
    "$source"
done
