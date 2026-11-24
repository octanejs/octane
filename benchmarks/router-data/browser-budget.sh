#!/bin/bash
set -euo pipefail

exec systemd-run --user --scope --quiet \
	-p "AllowedCPUs=${ROUTER_DATA_BUDGET_CPU:?}" \
	-p "CPUQuota=${ROUTER_DATA_BROWSER_QUOTA:?}%" \
	-p CPUQuotaPeriodSec=4ms \
	-- "${ROUTER_DATA_CHROMIUM:?}" "$@"
