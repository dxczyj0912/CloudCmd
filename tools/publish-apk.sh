#!/usr/bin/env bash
# Install a CI-signed APK into the bind-mounted /opt/cloudcmd/apk directory.
set -Eeuo pipefail

uploaded="${1:?missing uploaded APK}"
version="${2:?missing versionName}"
code="${3:?missing versionCode}"
expected="${4:?missing SHA-256}"
commit="${5:?missing Git commit}"
apk_dir=/opt/cloudcmd/apk

[[ "$version" =~ ^[0-9]+(\.[0-9]+){1,3}$ ]] || { echo 'Invalid versionName' >&2; exit 2; }
[[ "$code" =~ ^[1-9][0-9]*$ ]] || { echo 'Invalid versionCode' >&2; exit 2; }
[[ "$expected" =~ ^[0-9a-f]{64}$ ]] || { echo 'Invalid APK digest' >&2; exit 2; }
[[ "$commit" =~ ^[0-9a-f]{40,64}$ ]] || { echo 'Invalid Git commit' >&2; exit 2; }
[[ -d "$apk_dir" && -f /opt/cloudcmd/server.js ]] || {
  echo 'Deploy the server before publishing an APK' >&2; exit 2;
}
[[ -f "$uploaded" ]] || { echo 'Uploaded APK not found' >&2; exit 2; }
[[ -f /opt/cloudcmd/.deployment-commit && "$(cat /opt/cloudcmd/.deployment-commit)" == "$commit" ]] || {
  echo 'Server source commit differs from the APK build commit' >&2; exit 2;
}
actual="$(sha256sum "$uploaded" | cut -d ' ' -f1)"
[[ "$actual" == "$expected" ]] || { echo 'APK digest mismatch' >&2; exit 2; }

manifest="$apk_dir/release.json"
if [[ -f "$manifest" ]]; then
  previous="$(sed -nE 's/.*"versionCode"[[:space:]]*:[[:space:]]*([0-9]+).*/\1/p' "$manifest" | head -n 1)"
  [[ -z "$previous" || "$code" -gt "$previous" ]] || {
    echo 'versionCode must exceed the published APK versionCode' >&2; exit 2;
  }
fi

target="$apk_dir/CloudCmd-$version.apk"
[[ ! -e "$target" ]] || { echo 'This APK version already exists' >&2; exit 2; }
mv "$uploaded" "$target"
tmp="$apk_dir/.release.json.tmp.$$"
printf '{"versionName":"%s","versionCode":%s,"file":"CloudCmd-%s.apk","sha256":"%s"}\n' \
  "$version" "$code" "$version" "$expected" > "$tmp"
mv "$tmp" "$manifest"

for attempt in $(seq 1 10); do
  if curl -fsS --max-time 5 http://127.0.0.1:8787/api/app-version | grep -q '"versionName":"'"$version"'"'; then
    echo "Published CloudCmd-$version.apk (versionCode $code)"
    exit 0
  fi
  sleep 2
done
echo 'APK installed, but the app-version API did not report it' >&2
exit 1
