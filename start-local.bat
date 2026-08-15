@echo off
echo Instalando dependencias...
call npm install
if not exist .env copy .env.example .env
echo.
echo Iniciando Ahora Nacion...
npm start
pause
