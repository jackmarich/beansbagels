#!/bin/bash

# Script to open all orders
echo "Opening all orders..."

# Set the environment variable to open orders
export ORDERS_OPEN=true

# Restart the server with orders open
echo "Restarting server with orders open..."
pkill -f "node server.js" 2>/dev/null || true
sleep 2
ORDERS_OPEN=true npm start &

echo "Orders are now open. The server is running with ORDERS_OPEN=true"
echo "To close orders, run: ./close_orders.sh"

