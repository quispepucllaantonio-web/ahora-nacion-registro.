#!/bin/sh
npm install
[ -f .env ] || cp .env.example .env
npm start
