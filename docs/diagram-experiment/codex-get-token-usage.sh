OUTPUT="codex-token-usage.csv"

echo '"CHAT","INPUT","CACHED","UNCACHED","OUTPUT","REASONING","TOTAL"' > "$OUTPUT"

sqlite3 -separator $'\t' ~/.codex/state_5.sqlite \
'SELECT title, rollout_path FROM threads WHERE rollout_path IS NOT NULL;' |
while IFS=$'\t' read -r title rollout; do
  usage=$(
    jq -r '
      select(
        .type == "event_msg"
        and .payload.type == "token_count"
        and .payload.info.total_token_usage != null
      )
      | .payload.info.total_token_usage
      | [
          .input_tokens,
          .cached_input_tokens,
          (.input_tokens - .cached_input_tokens),
          .output_tokens,
          .reasoning_output_tokens,
          .total_tokens
        ]
      | @tsv
    ' "$rollout" 2>/dev/null | tail -n 1
  )

  if [ -n "$usage" ]; then
    printf "%s\t%s\n" "$title" "$usage"
  fi
done |
sort -t$'\t' -k7,7nr |
awk -F'\t' '
{
  gsub(/"/, "\"\"", $1)
  printf "\"%s\",%s,%s,%s,%s,%s,%s\n",
    $1,$2,$3,$4,$5,$6,$7
}' >> "$OUTPUT"

echo "出力完了: $OUTPUT"
