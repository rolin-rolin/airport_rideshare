#!/usr/bin/env bash
set -euo pipefail
set -a; source .env.local; set +a

response=$(curl -sS -w '\n%{http_code}' -X PATCH \
  "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"external_email_enabled\": true,
    \"mailer_autoconfirm\": false,
    \"mailer_secure_email_change_enabled\": true,
    \"smtp_host\": \"smtp.resend.com\",
    \"smtp_port\": \"465\",
    \"smtp_user\": \"resend\",
    \"smtp_pass\": \"$RESEND_API_KEY\",
    \"smtp_admin_email\": \"noreply@auth.downtosplit.app\",
    \"smtp_sender_name\": \"Down to Split\"
  }")

status="${response##*$'\n'}"
body="${response%$'\n'*}"

if [[ "$status" != "200" ]]; then
  echo "Request failed (HTTP $status):" >&2
  echo "$body" >&2
  exit 1
fi

echo "$body" | jq '{smtp_host, smtp_port, smtp_user, smtp_admin_email, smtp_sender_name}'
