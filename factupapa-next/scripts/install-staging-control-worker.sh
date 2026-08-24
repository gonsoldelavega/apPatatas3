#!/usr/bin/env bash
set -Eeuo pipefail

# Installs a user-level timer on the dedicated rootless staging account. The
# worker only reads the private task branch and never checks out main.
# Re-running this installer is intentionally idempotent and also starts one
# immediate control-plane pass so an approved staging task is not left queued.
control_root="${HOME}/staging/factupapa-control"
unit_directory="${HOME}/.config/systemd/user"
repository_url="https://github.com/gonsoldelavega/apPatatas3.git"
task_branch="automation/factupapa-staging-tasks"

for command in git node codex systemctl; do
  command -v "${command}" >/dev/null || { echo "Falta ${command}" >&2; exit 1; }
done
test "$(id -u)" = "1001" || { echo "El worker debe instalarse con el usuario rootless de staging" >&2; exit 1; }
systemctl --user show-environment >/dev/null

mkdir -p "${control_root}" "${unit_directory}"
if [ ! -d "${control_root}/.git" ]; then
  git clone --branch "${task_branch}" --single-branch "${repository_url}" "${control_root}"
fi

cat >"${control_root}/run-control-worker.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
control_root="${HOME}/staging/factupapa-control"
task_branch="automation/factupapa-staging-tasks"
cd "${control_root}"
git fetch --quiet origin "${task_branch}"
git checkout --quiet "${task_branch}"
git reset --hard --quiet "origin/${task_branch}"
node factupapa-next/scripts/staging-control-runner.mjs
if git diff --quiet; then
  exit 0
fi
git config user.name 'FactuPapa staging control'
git config user.email 'factupapa-control@users.noreply.github.com'
git add .factupapa-control/task.json .factupapa-control/results
git commit --quiet -m '[control-result] staging task result'
git push --quiet origin "HEAD:${task_branch}"
SCRIPT
chmod 700 "${control_root}/run-control-worker.sh"

cat >"${unit_directory}/factupapa-staging-control.service" <<EOF
[Unit]
Description=FactuPapa private staging control task
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=${control_root}
Environment=DOCKER_HOST=unix:///run/user/1001/docker.sock
ExecStart=${control_root}/run-control-worker.sh
EOF

cat >"${unit_directory}/factupapa-staging-control.timer" <<'EOF'
[Unit]
Description=Poll FactuPapa private staging control tasks

[Timer]
OnBootSec=90s
OnUnitInactiveSec=2min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now factupapa-staging-control.timer
systemctl --user start factupapa-staging-control.service
systemctl --user is-active --quiet factupapa-staging-control.timer
echo "FactuPapa staging control worker activo"
