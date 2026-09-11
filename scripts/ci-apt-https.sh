#!/usr/bin/env bash
set -euo pipefail

# Blacksmith's Ubuntu mirror list uses HTTP, which can fail to connect while
# HTTPS remains reachable. The official archive also carries noble-security;
# use it for every Ubuntu suite without changing package verification.
shopt -s nullglob
for source in \
  /etc/apt/blacksmith-ubuntu-mirrors.txt \
  /etc/apt/sources.list \
  /etc/apt/sources.list.d/*.list \
  /etc/apt/sources.list.d/*.sources; do
  [[ -f "$source" ]] || continue
  sudo sed -i -E \
    's#http://((archive|security|us\.archive)\.ubuntu\.com/ubuntu|mirrors\.sonic\.net/ubuntu)#https://archive.ubuntu.com/ubuntu#g' \
    "$source"
done
