const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3005;
const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_super_segura_2026_registro_civil';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// ----------------------------------------------------
// MIDDLEWARE DE AUTENTICACIÓN ADMIN
// ----------------------------------------------------
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Acceso denegado. No se proporcionó token.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

// ----------------------------------------------------
// RUTA DE NAVEGACIÓN Y OPEN GRAPH (SSR Meta Tags)
// ----------------------------------------------------
app.get(['/c/:slug', '/'], (req, res, next) => {
  // Si la petición es para una ruta de API o un archivo estático con extensión (ej. .css, .js, .png), omitir
  if (req.path.startsWith('/api') || req.path.includes('.')) {
    return next();
  }

  const slug = req.params.slug || 'campana-general';
  let campaign = db.prepare('SELECT * FROM campaigns WHERE slug = ? AND is_active = 1').get(slug);

  if (!campaign) {
    campaign = db.prepare('SELECT * FROM campaigns WHERE is_active = 1 ORDER BY id ASC LIMIT 1').get();
  }

  if (!campaign) {
    campaign = {
      header_text: 'AHORA NACIÓN',
      title: 'AHORA NACIÓN — REGISTRO DE PARTICIPANTES',
      description: 'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación. Completa tus datos para registrar tu participación.',
      og_title: 'AHORA NACIÓN — Registro de Participantes',
      og_description: 'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación.',
      og_image: '/ahora-nacion-logo.png'
    };
  }

  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  const htmlResponse = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(campaign.title)} - Sistema de Inscripción</title>
  
  <!-- Open Graph Meta Tags para WhatsApp / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeHtml(fullUrl)}" />
  <meta property="og:title" content="${escapeHtml(campaign.og_title || campaign.title)}" />
  <meta property="og:description" content="${escapeHtml(campaign.og_description || campaign.description)}" />
  <meta property="og:image" content="${escapeHtml(campaign.og_image)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  
  <!-- Twitter Card Tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(campaign.og_title || campaign.title)}" />
  <meta name="twitter:description" content="${escapeHtml(campaign.og_description || campaign.description)}" />
  <meta name="twitter:image" content="${escapeHtml(campaign.og_image)}" />

  <!-- Preload Styles -->
  <link rel="stylesheet" href="/css/styles.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <div id="app" data-slug="${escapeHtml(slug)}"></div>
  <script src="/js/app.js"></script>
</body>
</html>`;

  res.send(htmlResponse);
});

// Helper de escape HTML
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ----------------------------------------------------
// RUTAS PÚBLICAS DE LA API
// ----------------------------------------------------

// Obtener datos de campaña pública por slug o ID
app.get('/api/public/campaign/:identifier', (req, res) => {
  const { identifier } = req.params;
  let campaign;

  if (!isNaN(identifier)) {
    campaign = db.prepare('SELECT * FROM campaigns WHERE id = ? AND is_active = 1').get(Number(identifier));
  } else {
    campaign = db.prepare('SELECT * FROM campaigns WHERE slug = ? AND is_active = 1').get(identifier);
  }

  if (!campaign) {
    // Si no encuentra por slug, devolver la campaña por defecto activa
    campaign = db.prepare('SELECT * FROM campaigns WHERE is_active = 1 ORDER BY id ASC LIMIT 1').get();
  }

  if (!campaign) {
    return res.status(440).json({ error: 'No hay campañas activas disponibles actualmente.' });
  }

  res.json(campaign);
});

// Listar campañas activas para selector público si fuera necesario
app.get('/api/public/campaigns', (req, res) => {
  const campaigns = db.prepare('SELECT id, slug, title, category FROM campaigns WHERE is_active = 1 ORDER BY title ASC').all();
  res.json(campaigns);
});

// Registrar nuevo participante
app.post('/api/public/register', (req, res) => {
  try {
    let {
      campaign_id,
      nombres,
      apellido_paterno,
      apellido_materno,
      tiene_dni,
      dni,
      celular,
      comunidad,
      observaciones
    } = req.body;

    // Sanear strings
    nombres = (nombres || '').trim();
    apellido_paterno = (apellido_paterno || '').trim();
    apellido_materno = (apellido_materno || '').trim();
    celular = (celular || '').trim();
    comunidad = (comunidad || '').trim();
    observaciones = (observaciones || '').trim();
    tiene_dni = (tiene_dni === true || tiene_dni === 1 || tiene_dni === '1' || tiene_dni === 'true') ? 1 : 0;
    dni = tiene_dni ? (dni || '').trim() : '';

    // Validaciones de presencia
    if (!campaign_id || !nombres || !apellido_paterno || !apellido_materno || !celular || !comunidad) {
      return res.status(400).json({ error: 'Por favor, completa todos los campos obligatorios (*).' });
    }

    if (tiene_dni) {
      if (!dni || !/^\d{8}$/.test(dni)) {
        return res.status(400).json({ error: 'El número de DNI debe contener exactamente 8 dígitos numéricos.' });
      }

      // Validar duplicidad de DNI en esta campaña
      const existing = db.prepare(`
        SELECT id, reg_number FROM registrations 
        WHERE campaign_id = ? AND tiene_dni = 1 AND dni = ? AND estado = 'ACTIVO'
      `).get(campaign_id, dni);

      if (existing) {
        return res.status(400).json({
          error: `El DNI N° ${dni} ya se encuentra registrado en esta campaña con el código ${existing.reg_number}.`
        });
      }
    }

    // Validar celular (mínimo 9 dígitos)
    if (!/^\d{9,15}$/.test(celular.replace(/\s+/g, ''))) {
      return res.status(400).json({ error: 'Ingrese un número de celular válido (ejemplo: 987654321).' });
    }

    // Verificar campaña activa
    const campaign = db.prepare('SELECT id, title, share_message, slug FROM campaigns WHERE id = ? AND is_active = 1').get(campaign_id);
    if (!campaign) {
      return res.status(400).json({ error: 'La campaña seleccionada ya no se encuentra activa.' });
    }

    // Generar Número de Inscripción Secuencial
    const countResult = db.prepare('SELECT COUNT(*) as count FROM registrations WHERE campaign_id = ?').get(campaign_id);
    const seqNum = String(countResult.count + 1).padStart(4, '0');
    const currentYear = new Date().getFullYear();
    const reg_number = `INS-${currentYear}-${seqNum}`;

    // Obtener Fecha y Hora local
    const now = new Date();
    const fecha_registro = now.toISOString().split('T')[0];
    const hora_registro = now.toTimeString().split(' ')[0];

    const stmt = db.prepare(`
      INSERT INTO registrations (
        reg_number, campaign_id, nombres, apellido_paterno, apellido_materno,
        tiene_dni, dni, celular, comunidad, observaciones,
        fecha_registro, hora_registro, estado
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO')
    `);

    const result = stmt.run(
      reg_number, campaign_id, nombres, apellido_paterno, apellido_materno,
      tiene_dni, dni, celular, comunidad, observaciones,
      fecha_registro, hora_registro
    );

    res.json({
      success: true,
      id: result.lastInsertRowid,
      reg_number,
      fecha_registro,
      hora_registro,
      campaign_title: campaign.title,
      share_message: campaign.share_message,
      campaign_slug: campaign.slug
    });
  } catch (err) {
    console.error('Error en /api/public/register:', err);
    res.status(500).json({ error: 'Ocurrió un error al procesar el registro. Intente nuevamente.' });
  }
});

// ----------------------------------------------------
// RUTAS PRIVADAS DEL PANEL DE ADMINISTRACIÓN
// ----------------------------------------------------

// Login de Administrador
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Ingrese usuario y contraseña.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role }
  });
});

// Datos de la sesión admin activa
app.get('/api/admin/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// Dashboard Stats
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  const totalRegistrations = db.prepare("SELECT COUNT(*) as count FROM registrations WHERE estado = 'ACTIVO'").get().count;
  const activeCampaigns = db.prepare("SELECT COUNT(*) as count FROM campaigns WHERE is_active = 1").get().count;
  
  const todayStr = new Date().toISOString().split('T')[0];
  const todayRegistrations = db.prepare("SELECT COUNT(*) as count FROM registrations WHERE fecha_registro = ? AND estado = 'ACTIVO'").get(todayStr).count;

  const topCommunities = db.prepare(`
    SELECT comunidad, COUNT(*) as count 
    FROM registrations 
    WHERE estado = 'ACTIVO'
    GROUP BY comunidad 
    ORDER BY count DESC 
    LIMIT 5
  `).all();

  const campaignStats = db.prepare(`
    SELECT c.id, c.title, c.category, COUNT(r.id) as total_inscritos
    FROM campaigns c
    LEFT JOIN registrations r ON c.id = r.campaign_id AND r.estado = 'ACTIVO'
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();

  res.json({
    totalRegistrations,
    activeCampaigns,
    todayRegistrations,
    topCommunities,
    campaignStats
  });
});

// Listar y Filtrar Registros
app.get('/api/admin/registrations', authMiddleware, (req, res) => {
  const { search, campaign_id, comunidad, fecha_inicio, fecha_fin, estado } = req.query;

  let query = `
    SELECT r.*, c.title as campaign_title, c.category as campaign_category
    FROM registrations r
    JOIN campaigns c ON r.campaign_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (
      r.nombres LIKE ? OR 
      r.apellido_paterno LIKE ? OR 
      r.apellido_materno LIKE ? OR 
      r.dni LIKE ? OR 
      r.celular LIKE ? OR 
      r.reg_number LIKE ?
    )`;
    const s = `%${search.trim()}%`;
    params.push(s, s, s, s, s, s);
  }

  if (campaign_id) {
    query += ` AND r.campaign_id = ?`;
    params.push(campaign_id);
  }

  if (comunidad) {
    query += ` AND r.comunidad LIKE ?`;
    params.push(`%${comunidad.trim()}%`);
  }

  if (fecha_inicio) {
    query += ` AND r.fecha_registro >= ?`;
    params.push(fecha_inicio);
  }

  if (fecha_fin) {
    query += ` AND r.fecha_registro <= ?`;
    params.push(fecha_fin);
  }

  if (estado) {
    query += ` AND r.estado = ?`;
    params.push(estado);
  }

  query += ` ORDER BY r.id DESC`;

  const rows = db.prepare(query).all(...params);
  res.json(rows);
});

// Obtener comunidades únicas para filtro
app.get('/api/admin/communities', authMiddleware, (req, res) => {
  const rows = db.prepare("SELECT DISTINCT comunidad FROM registrations WHERE comunidad IS NOT NULL AND comunidad != '' ORDER BY comunidad ASC").all();
  res.json(rows.map(r => r.comunidad));
});

// Editar un registro de participante
app.put('/api/admin/registrations/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const {
    nombres,
    apellido_paterno,
    apellido_materno,
    tiene_dni,
    dni,
    celular,
    comunidad,
    observaciones,
    estado
  } = req.body;

  const existing = db.prepare('SELECT id FROM registrations WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Registro no encontrado.' });
  }

  db.prepare(`
    UPDATE registrations
    SET nombres = ?, apellido_paterno = ?, apellido_materno = ?,
        tiene_dni = ?, dni = ?, celular = ?, comunidad = ?,
        observaciones = ?, estado = ?
    WHERE id = ?
  `).run(
    nombres.trim(),
    apellido_paterno.trim(),
    apellido_materno.trim(),
    tiene_dni ? 1 : 0,
    tiene_dni ? dni.trim() : '',
    celular.trim(),
    comunidad.trim(),
    observaciones ? observaciones.trim() : '',
    estado || 'ACTIVO',
    id
  );

  res.json({ success: true, message: 'Registro actualizado correctamente.' });
});

// Desactivar / Cambiar estado de registro
app.patch('/api/admin/registrations/:id/status', authMiddleware, (req, res) => {
  const { id } = req.params;
  const { estado } = req.body; // 'ACTIVO' o 'INACTIVO'

  const current = db.prepare('SELECT estado FROM registrations WHERE id = ?').get(id);
  if (!current) {
    return res.status(404).json({ error: 'Registro no encontrado.' });
  }

  const newStatus = estado || (current.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO');
  db.prepare('UPDATE registrations SET estado = ? WHERE id = ?').run(newStatus, id);

  res.json({ success: true, newStatus });
});

// CRUD de Campañas (Admin)
app.get('/api/admin/campaigns', authMiddleware, (req, res) => {
  const campaigns = db.prepare(`
    SELECT c.*, COUNT(r.id) as total_registros
    FROM campaigns c
    LEFT JOIN registrations r ON c.id = r.campaign_id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();
  res.json(campaigns);
});

app.post('/api/admin/campaigns', authMiddleware, (req, res) => {
  try {
    const {
      slug,
      header_text,
      title,
      description,
      category,
      share_message,
      og_title,
      og_description,
      og_image
    } = req.body;

    if (!title || !share_message) {
      return res.status(400).json({ error: 'Título y Mensaje de Difusión son obligatorios.' });
    }

    const finalSlug = (slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')) + '-' + Date.now().toString().slice(-4);

    const stmt = db.prepare(`
      INSERT INTO campaigns (
        slug, header_text, title, description, category, share_message, og_title, og_description, og_image
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      finalSlug,
      header_text || 'AHORA NACIÓN',
      title.trim(),
      description ? description.trim() : 'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación.',
      category || 'Inscripción',
      share_message.trim(),
      og_title || title,
      og_description || description || 'AHORA NACIÓN — Registro de Participantes',
      og_image || '/ahora-nacion-logo.png'
    );

    res.json({ success: true, id: result.lastInsertRowid, slug: finalSlug });
  } catch (err) {
    console.error('Error al crear campaña:', err);
    res.status(500).json({ error: 'Error al crear la campaña.' });
  }
});

app.put('/api/admin/campaigns/:id', authMiddleware, (req, res) => {
  const { id } = req.params;
  const {
    header_text,
    title,
    description,
    category,
    share_message,
    og_title,
    og_description,
    og_image,
    is_active
  } = req.body;

  db.prepare(`
    UPDATE campaigns
    SET header_text = ?, title = ?, description = ?, category = ?,
        share_message = ?, og_title = ?, og_description = ?, og_image = ?, is_active = ?
    WHERE id = ?
  `).run(
    header_text,
    title.trim(),
    description.trim(),
    category,
    share_message.trim(),
    og_title,
    og_description,
    og_image,
    is_active ? 1 : 0,
    id
  );

  res.json({ success: true, message: 'Campaña actualizada.' });
});

// EXPORTACIÓN A EXCEL (.xlsx)
app.get('/api/admin/export/excel', authMiddleware, (req, res) => {
  try {
    const { campaign_id, search, comunidad } = req.query;
    let query = `
      SELECT 
        r.reg_number as "N° Inscripción",
        c.title as "Campaña",
        c.category as "Categoría",
        r.nombres as "Nombres",
        r.apellido_paterno as "Apellido Paterno",
        r.apellido_materno as "Apellido Materno",
        CASE WHEN r.tiene_dni = 1 THEN 'Sí' ELSE 'No' END as "Tiene DNI",
        r.dni as "DNI",
        r.celular as "Celular",
        r.comunidad as "Comunidad/Localidad",
        r.observaciones as "Observaciones",
        r.fecha_registro as "Fecha Registro",
        r.hora_registro as "Hora Registro",
        r.estado as "Estado"
      FROM registrations r
      JOIN campaigns c ON r.campaign_id = c.id
      WHERE 1=1
    `;

    const params = [];
    if (campaign_id) {
      query += ` AND r.campaign_id = ?`;
      params.push(campaign_id);
    }
    if (search) {
      query += ` AND (r.nombres LIKE ? OR r.apellido_paterno LIKE ? OR r.dni LIKE ? OR r.celular LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }
    if (comunidad) {
      query += ` AND r.comunidad LIKE ?`;
      params.push(`%${comunidad}%`);
    }

    query += ` ORDER BY r.id DESC`;

    const rows = db.prepare(query).all(...params);

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inscritos');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `Relacion_Inscritos_${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Error al exportar Excel:', err);
    res.status(500).json({ error: 'Error al generar reporte Excel.' });
  }
});

// EXPORTACIÓN A CSV
app.get('/api/admin/export/csv', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        r.reg_number, c.title as campana, r.nombres, r.apellido_paterno, r.apellido_materno,
        r.tiene_dni, r.dni, r.celular, r.comunidad, r.observaciones, r.fecha_registro, r.hora_registro, r.estado
      FROM registrations r
      JOIN campaigns c ON r.campaign_id = c.id
      ORDER BY r.id DESC
    `).all();

    let csvContent = 'Nro_Inscripcion,Campana,Nombres,Apellido_Paterno,Apellido_Materno,Tiene_DNI,DNI,Celular,Comunidad,Observaciones,Fecha,Hora,Estado\n';
    rows.forEach(r => {
      csvContent += `"${r.reg_number}","${r.campana}","${r.nombres}","${r.apellido_paterno}","${r.apellido_materno}","${r.tiene_dni ? 'SI' : 'NO'}","${r.dni || ''}","${r.celular}","${r.comunidad}","${r.observaciones || ''}","${r.fecha_registro}","${r.hora_registro}","${r.estado}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Inscritos_${Date.now()}.csv"`);
    res.send('\uFEFF' + csvContent);
  } catch (err) {
    res.status(500).json({ error: 'Error al generar CSV.' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(` Servidor ejecutándose en http://localhost:${PORT} y en la red local puerto ${PORT}`);
});
