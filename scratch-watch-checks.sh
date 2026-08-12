#!/bin/zsh
for i in $(seq 1 40); do
	state=$(gh pr checks 720 2>/dev/null | grep "React parity shard" | awk -F'\t' '{print $2}' | sort -u | tr '\n' ' ')
	case "$state" in
		*fail*)
			echo "SHARD FAILED: $state"
			gh pr checks 720 | awk -F'\t' '$2 == "fail"'
			exit 1
			;;
		*pending*)
			sleep 30
			;;
		"")
			sleep 30
			;;
		*)
			echo "parity shards done: $state"
			echo "--- any non-pass checks remaining ---"
			gh pr checks 720 | awk -F'\t' '$2 != "pass"'
			exit 0
			;;
	esac
done
echo "timed out still pending"
