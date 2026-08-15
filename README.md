# Ahora Nación – Prototipo funcional

Prototipo web para registrar participantes desde varios celulares mediante un mismo enlace.

## Qué incluye

- Formulario público responsive para celular.
- Base de datos SQLite persistente en `data/database.sqlite`.
- Numeración secuencial `INS-AAAA-0001`.
- Control de duplicidad de DNI por campaña.
- Panel administrador con login.
- Búsqueda y filtros.
- Edición y activación/desactivación.
- Creación y edición de campañas.
- Exportación a Excel y CSV.
- Mensaje de WhatsApp configurable por campaña.
- Diseño responsive.

## Instalación local

Requiere Node.js 18 o superior.

```bash
npm install
```

Copia `.env.example` a `.env` y cambia al menos `JWT_SECRET` y `ADMIN_PASSWORD`.

Luego:

```bash
npm start
```

Abre:

- Público: `http://localhost:3005/`
- Administración: `http://localhost:3005/admin/`

## Credenciales iniciales

Se toman de `.env`:

- Usuario: `ADMIN_USERNAME`
- Contraseña: `ADMIN_PASSWORD`

Si cambias estas variables después de que la base ya fue creada, el usuario existente no se cambia automáticamente. Puedes eliminar la base de prueba y volver a iniciar, o cambiar la contraseña desde el código/base en una etapa posterior.

## Usarlo desde varios celulares

El servidor debe estar publicado en Internet. Todos los celulares deben abrir el MISMO enlace.

Ejemplo:

`https://tu-dominio.example/c/campana-general`

La base de datos vive en el servidor, no en el celular. Por eso los registros de todos los dispositivos terminan en la misma base.

## Importante para alojamiento

SQLite necesita almacenamiento persistente. Si el proveedor borra el disco al reiniciar/recrear la instancia, se perderán los datos. Para un prototipo, usa un servicio con disco persistente o un servidor/VPS con almacenamiento persistente.

## Seguridad

Este proyecto es un prototipo. Antes de usar datos reales:

- cambia `JWT_SECRET`;
- cambia la contraseña de administrador;
- usa HTTPS;
- configura copias de seguridad;
- revisa las obligaciones legales aplicables al tratamiento de datos personales;
- no subas `.env` ni `*.sqlite` a GitHub.
