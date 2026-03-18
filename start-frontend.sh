#!/bin/bash
echo "Starting Target Bot Frontend..."
cd "$(dirname "$0")/frontend"
npm install
npm run dev

