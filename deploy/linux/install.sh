#!/usr/bin/env bash
# Builds Stuby from this checkout and installs it as a systemd service on Linux.
# Safe to run again: a second run is the update (rebuild, replace the files, restart).
#
#   ./deploy/linux/install.sh              # build + install (run as a normal user with sudo)
#   ./deploy/linux/install.sh --no-build   # reuse the existing target/release and app/dist
#
# What it creates:
#   /opt/stuby/bin/stuby-server     the server binary
#   /opt/stuby/web/                   the web UI (app/dist)
#   /etc/stuby/stuby.env            settings and secrets (640 root:stuby), kept on re-runs
#   /var/lib/stuby/files/             uploaded materials
#   /etc/systemd/system/stuby.service the service (user `stuby`, hardened)
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="$REPO/deploy/linux"
PREFIX=/opt/stuby
ETC=/etc/stuby
DATA=/var/lib/stuby
SVC_USER=stuby
BUILD=1

for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=0 ;;
    -h|--help) sed -n '2,15p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Opsi tidak dikenal: $arg" >&2; exit 2 ;;
  esac
done

say()  { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die()  { printf '\033[31mGAGAL:\033[0m %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

[ "$(uname -s)" = "Linux" ] || die "Skrip ini hanya untuk Linux."
[ "$(id -u)" -ne 0 ] || die "Jalankan sebagai pengguna biasa (bukan root); skrip memakai sudo hanya saat memasang."
have sudo || die "sudo tidak ditemukan."

if [ "$BUILD" -eq 1 ]; then
  say "Memeriksa alat build"
  missing=()
  have cc   || missing+=("compiler C")
  have curl || missing+=(curl)
  have git  || missing+=(git)
  if [ "${#missing[@]}" -gt 0 ]; then
    if have apt-get; then
      echo "Memasang: build-essential pkg-config curl git ca-certificates"
      sudo apt-get update -y && sudo apt-get install -y build-essential pkg-config curl git ca-certificates
    elif have dnf; then
      echo "Memasang: gcc make pkgconf-pkg-config curl git ca-certificates"
      sudo dnf install -y gcc make pkgconf-pkg-config curl git ca-certificates
    else
      die "Pasang manual: ${missing[*]} (apt/dnf tidak ditemukan)."
    fi
  fi

  if ! have cargo && [ -x "$HOME/.cargo/bin/cargo" ]; then export PATH="$HOME/.cargo/bin:$PATH"; fi
  if ! have cargo; then
    echo "Rust belum terpasang. Pemasang resmi rustup (https://sh.rustup.rs) akan dijalankan untuk akun ini."
    if [ -t 0 ]; then
      read -r -p "Lanjut memasang rustup? [y/N] " yn
      [ "$yn" = "y" ] || [ "$yn" = "Y" ] || die "Pasang Rust dulu (https://rustup.rs), lalu jalankan ulang."
    else
      die "Rust belum terpasang. Pasang dulu (https://rustup.rs), lalu jalankan ulang."
    fi
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
    export PATH="$HOME/.cargo/bin:$PATH"
  fi

  have node || die "Node.js 20 atau lebih baru dibutuhkan untuk membangun UI. Pasang dari https://nodejs.org atau lewat nvm."
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$node_major" -ge 20 ] || die "Node.js $node_major terlalu lama; butuh 20 atau lebih baru."

  say "Membangun server (cargo build --release)"
  # rust-toolchain.toml menetapkan versi Rust; rustup memasangnya otomatis pada build pertama.
  (cd "$REPO" && cargo build --release --locked -p stuby-server)

  say "Membangun UI web (app/dist)"
  # Mode standalone: UI memanggil API di origin yang sama (server yang menyajikannya), apa pun isi app/.env.
  (cd "$REPO/app" && npm ci && npm run build:standalone)
fi

BIN="$REPO/target/release/stuby-server"
DIST="$REPO/app/dist"
[ -x "$BIN" ] || die "Tidak ada $BIN. Jalankan tanpa --no-build."
[ -f "$DIST/index.html" ] || die "Tidak ada $DIST/index.html. Jalankan tanpa --no-build."

say "Menyiapkan pengguna dan folder"
if ! id "$SVC_USER" >/dev/null 2>&1; then
  sudo useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin "$SVC_USER"
fi
sudo install -d -m 755 "$PREFIX" "$PREFIX/bin" "$PREFIX/web"
sudo install -d -m 750 -o "$SVC_USER" -g "$SVC_USER" "$DATA" "$DATA/files"
sudo install -d -m 750 -o root -g "$SVC_USER" "$ETC"

say "Memasang berkas"
sudo install -m 755 "$BIN" "$PREFIX/bin/stuby-server"
sudo rm -rf "${PREFIX:?}/web"
sudo install -d -m 755 "$PREFIX/web"
sudo cp -r "$DIST"/. "$PREFIX/web/"
sudo chmod -R a+rX "$PREFIX/web"
sudo install -m 644 "$HERE/stuby.service" /etc/systemd/system/stuby.service

NEW_ENV=0
if [ ! -f "$ETC/stuby.env" ]; then
  sudo install -m 640 -o root -g "$SVC_USER" "$HERE/stuby.env.example" "$ETC/stuby.env"
  NEW_ENV=1
fi

sudo systemctl daemon-reload
sudo systemctl enable stuby >/dev/null

# Start only when the two required secrets are filled in; otherwise the service would crash-loop.
filled() { sudo grep -Eq "^$1=.+" "$ETC/stuby.env"; }
placeholder_db() { sudo grep -Eq '^DATABASE_URL=.*(<kata-sandi>|<ref-proyek>)' "$ETC/stuby.env"; }
if filled DATABASE_URL && ! placeholder_db && { filled APP_PASSWORD || filled APP_PASSWORD_HASH; }; then
  say "Menjalankan layanan"
  sudo systemctl restart stuby
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS "http://127.0.0.1:8080/api/v1/health" >/dev/null 2>&1; then
      echo "Server menjawab:"; curl -fsS "http://127.0.0.1:8080/api/v1/health"; echo
      OK=1; break
    fi
    sleep 1
  done
  if [ "${OK:-0}" -ne 1 ]; then
    echo "Server belum menjawab di 127.0.0.1:8080. Lihat log:  sudo journalctl -u stuby -n 50 --no-pager" >&2
    exit 1
  fi
  say "Selesai"
else
  say "Pemasangan selesai, tetapi layanan BELUM dijalankan"
  [ "$NEW_ENV" -eq 1 ] && echo "Berkas pengaturan baru dibuat: $ETC/stuby.env"
  cat <<EOF
Isi DATABASE_URL dan APP_PASSWORD, lalu:
  sudo nano $ETC/stuby.env
  sudo systemctl restart stuby
  curl http://127.0.0.1:8080/api/v1/health
EOF
fi

cat <<EOF

Langkah berikutnya (HTTPS dan domain): deploy/linux/Caddyfile.example, panduan lengkap di
docs/LINUX_SERVER_SETUP.md. Log:  sudo journalctl -u stuby -f
Memperbarui nanti:  git pull && ./deploy/linux/install.sh
EOF
