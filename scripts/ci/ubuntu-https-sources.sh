#!/usr/bin/env bash
set -euo pipefail

# Playwright installs Ubuntu packages on the Blacksmith runners. The default
# Ubuntu mirrors use HTTP, which can leave every browser lane waiting on a
# blocked port 80 connection. Keep the same package sources over HTTPS.
for source in \
	/etc/apt/sources.list \
	/etc/apt/sources.list.d/*.list \
	/etc/apt/sources.list.d/*.sources \
	/etc/apt/blacksmith-ubuntu-mirrors.txt; do
	[[ -f "$source" ]] || continue
	sudo sed -i -E \
		-e 's#http://security\.ubuntu\.com/ubuntu#https://security.ubuntu.com/ubuntu#g' \
		-e 's#http://[^[:space:]]+/ubuntu#https://archive.ubuntu.com/ubuntu#g' \
		"$source"
done
