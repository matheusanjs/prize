#!/bin/bash
set -e
echo "=== Deploy Prize Clube - Reservas + Checklist ==="
echo ""
echo "1/3 Build backend..."
cd /root/prize-clube/backend && npm run build
echo "Backend OK"
echo ""
echo "2/3 Build admin..."
cd /root/prize-clube/admin && npm run build
echo "Admin OK"
echo ""
echo "3/3 Restart PM2..."
pm2 restart backend
pm2 restart admin
echo ""
echo "=== Deploy concluido ==="
pm2 status