#!/bin/bash

# Check if .env exists
if [ ! -f .env ]; then
  echo "Error: .env file not found!"
  exit 1
fi

# Read the file line by line
while IFS='=' read -r key value || [ -n "$key" ]; do
  # Skip empty lines and comments
  case "$key" in
    '#'*) continue ;;
    '') continue ;;
  esac

  # Remove leading/trailing whitespace and quotes from the value
  clean_value=$(echo "$value" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' -e 's/^["'\'']//' -e 's/["'\'']$//')

  echo "Processing: $key"

  # 1. Create the secret "container" (ignores error if it already exists)
  gcloud secrets create "$key" --replication-policy="automatic" 2>/dev/null

  # 2. Add the value as a new version
  echo -n "$clean_value" | gcloud secrets versions add "$key" --data-file=-

done < .env

echo "✅ All secrets from .env have been uploaded to Secret Manager."