#!/usr/bin/env bash
set -euo pipefail

# Auditoría estrictamente de lectura para conocer el estado de una VPS antes de instalar FactuPapa Next.
# No instala, modifica, reinicia ni elimina nada.

section() { printf '\n===== %s =====\n' "$1"; }
run() { printf '\n$ %s\n' "$*"; "$@" 2>&1 || true; }

section "Sistema"
run uname -a
run sh -c 'cat /etc/os-release 2>/dev/null'
run uptime
run date -Is

section "Recursos"
run nproc
run free -h
run df -hT
run lsblk

section "Red y puertos"
run hostname -I
run ss -lntup

section "Docker"
run docker --version
run docker compose version
run docker info
run docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
run docker network ls
run docker volume ls

section "Proxy web"
run nginx -v
run caddy version
run traefik version
run systemctl --no-pager --type=service --state=running

section "Bases de datos y almacenamiento"
run psql --version
run redis-server --version
run mc --version
run sh -c "find /opt /srv /var/www -maxdepth 3 -type f \( -name 'docker-compose.yml' -o -name 'compose.yml' -o -name 'Caddyfile' -o -name 'nginx.conf' \) 2>/dev/null | sort"

section "Seguridad básica"
run ufw status verbose
run fail2ban-client status
run sh -c 'test -f /etc/ssh/sshd_config && grep -E "^(PermitRootLogin|PasswordAuthentication|PubkeyAuthentication|Port)" /etc/ssh/sshd_config'

section "Copias programadas"
run crontab -l
run systemctl list-timers --all --no-pager

printf '\nAuditoría terminada. Revise la salida antes de cualquier instalación.\n'
