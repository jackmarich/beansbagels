#!/bin/bash

# Script to close all orders
echo "Closing all orders..."

# Set the environment variable to close orders
export ORDERS_OPEN=false

# Restart the server with orders closed
echo "Restarting server with orders closed..."
pkill -f "node server.js" 2>/dev/null || true
sleep 2
ORDERS_OPEN=false npm start &

echo "Orders are now closed. The server is running with ORDERS_OPEN=false"
echo "To reopen orders, run: ./open_orders.sh"

