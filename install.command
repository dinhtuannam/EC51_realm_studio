#!/bin/bash
cd "$(dirname "$0")"

if [ -d "node_modules" ]; then
  echo "Da thay thu muc node_modules - hinh nhu ban da cai dat truoc do roi."
  read -p "Ban co muon cai dat lai tu dau khong? (y/N): " confirm
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Da huy, khong cai dat lai."
    read -p "Nhan Enter de dong..."
    exit 0
  fi
fi

npm install
echo ""
echo "Da cai dat xong. Co the dong cua so nay va chay start.command."
read -p "Nhan Enter de dong..."
