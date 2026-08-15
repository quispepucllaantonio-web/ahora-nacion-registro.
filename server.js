const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const db = require('./database');

const app = express();
const PORT = Number(process.env.PORT || 3005);
const JWT_SECRET = process.env.JWT_SECRET || 'DEV_ONLY_CHANGE_THIS_SECRET';
const APP_NAME = process.env.APP_NAME || 'AHORA NACIÓN – REGISTRO DE PARTICIPANTES';

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function nowLocal() {
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(d);
  const get = (type) => parts.find(p => p.type === type)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
    year: Number(get('year'))
  };
}

function clean(v) {
  return String(v ?? '').trim().replace(/\s+/g, ' ');
}

function escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Acceso denegado.' });
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada.' });
  }
}

// Dynamic campaign page + Open Graph.
app.get(['/c/:slug', '/:slug'], (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.includes('.')) return next();

  const slug = req.params.slug || 'campana-general';
  const campaign = db.prepare(
    'SELECT * FROM campaigns WHERE slug = ? AND is_active = 1'
  ).get(slug) || db.prepare(
    'SELECT * FROM campaigns WHERE is_active = 1 ORDER BY id ASC LIMIT 1'
  ).get();

  if (!campaign) return res.status(404).send('No hay campañas activas.');

  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  res.send(`<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(campaign.title)} | ${escapeHtml(APP_NAME)}</title>
<meta property="og:type" content="website">
<meta property="og:url" content="${escapeHtml(fullUrl)}">
<meta property="og:title" content="${escapeHtml(campaign.og_title || campaign.title)}">
<meta property="og:description" content="${escapeHtml(campaign.og_description || campaign.description)}">
<meta property="og:image" content="${escapeHtml(campaign.og_image || '/ahora-nacion-logo.svg')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="/css/styles.css">
</head>
<body>
<div id="app" data-slug="${escapeHtml(campaign.slug)}"></div>
<script src="/js/app.js"></script>
</body>
</html>`);
});

// Public campaign API
app.get('/api/public/campaign/:identifier', (req, res) => {
  const { identifier } = req.params;
  let campaign;

  if (/^\d+$/.test(identifier)) {
    campaign = db.prepare(
      'SELECT * FROM campaigns WHERE id = ? AND is_active = 1'
    ).get(Number(identifier));
  } else {
    campaign = db.prepare(
      'SELECT * FROM campaigns WHERE slug = ? AND is_active = 1'
    ).get(identifier);
  }

  if (!campaign) {
    campaign = db.prepare(
      'SELECT * FROM campaigns WHERE is_active = 1 ORDER BY id ASC LIMIT 1'
    ).get();
  }

  if (!campaign) return res.status(404).json({ error: 'No hay campañas activas.' });
  res.json(campaign);
});

app.get('/api/public/campaigns', (req, res) => {
  res.json(db.prepare(
    'SELECT id, slug, title, category FROM campaigns WHERE is_active = 1 ORDER BY title ASC'
  ).all());
});

// Public registration with transaction-safe sequential numbering.
const registerParticipant = db.transaction((data) => {
  const campaign = db.prepare(
    'SELECT id, title, share_message, slug FROM campaigns WHERE id = ? AND is_active = 1'
  ).get(data.campaign_id);

  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

  if (data.tiene_dni) {
    const existing = db.prepare(`
      SELECT id, reg_number
      FROM registrations
      WHERE campaign_id = ? AND tiene_dni = 1 AND dni = ? AND estado = 'ACTIVO'
    `).get(data.campaign_id, data.dni);

    if (existing) throw new Error(`DUPLICATE_DNI:${existing.reg_number}`);
  }

  const { date, time, year } = nowLocal();

  let counter = db.prepare(
    'SELECT last_number FROM registration_counters WHERE campaign_id = ? AND year = ?'
  ).get(data.campaign_id, year);

  if (!counter) {
    db.prepare(`
      INSERT INTO registration_counters (campaign_id, year, last_number)
      VALUES (?, ?, 0)
    `).run(data.campaign_id, year);
    counter = { last_number: 0 };
  }

  const next = Number(counter.last_number) + 1;
  db.prepare(`
    UPDATE registration_counters
    SET last_number = ?
    WHERE campaign_id = ? AND year = ?
  `).run(next, data.campaign_id, year);

  const regNumber = `INS-${year}-${String(next).padStart(4, '0')}`;

  const result = db.prepare(`
    INSERT INTO registrations
    (reg_number, campaign_id, nombres, apellido_paterno, apellido_materno,
     tiene_dni, dni, celular, comunidad, observaciones,
     fecha_registro, hora_registro, estado)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVO')
  `).run(
    regNumber, data.campaign_id, data.nombres, data.apellido_paterno,
    data.apellido_materno, data.tiene_dni ? 1 : 0, data.dni,
    data.celular, data.comunidad, data.observaciones, date, time
  );

  return {
    id: result.lastInsertRowid,
    reg_number: regNumber,
    fecha_registro: date,
    hora_registro: time,
    campaign_title: campaign.title,
    share_message: campaign.share_message,
    campaign_slug: campaign.slug
  };
});

app.post('/api/public/register', (req, res) => {
  try {
    const data = {
      campaign_id: Number(req.body.campaign_id),
      nombres: clean(req.body.nombres),
      apellido_paterno: clean(req.body.apellido_paterno),
      apellido_materno: clean(req.body.apellido_materno),
      tiene_dni: ['true', '1', 1, true].includes(req.body.tiene_dni),
      dni: clean(req.body.dni).replace(/\D/g, ''),
      celular: clean(req.body.celular).replace(/\s+/g, ''),
      comunidad: clean(req.body.comunidad),
      observaciones: clean(req.body.observaciones)
    };

    if (!data.campaign_id || !data.nombres || !data.apellido_paterno ||
        !data.apellido_materno || !data.celular || !data.comunidad) {
      return res.status(400).json({ error: 'Completa todos los campos obligatorios.' });
    }

    if (data.tiene_dni && !/^\d{8}$/.test(data.dni)) {
      return res.status(400).json({ error: 'El DNI debe contener exactamente 8 dígitos.' });
    }

    if (!/^\d{9}$/.test(data.celular)) {
      return res.status(400).json({ error: 'El celular debe contener 9 dígitos.' });
    }

    const result = registerParticipant(data);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    if (err.message === 'CAMPAIGN_NOT_FOUND') {
      return res.status(400).json({ error: 'La campaña no está activa.' });
    }
    if (err.message.startsWith('DUPLICATE_DNI:')) {
      const reg = err.message.split(':')[1];
      return res.status(409).json({ error: `Este DNI ya está registrado en esta campaña. Código: ${reg}.` });
    }
    console.error(err);
    res.status(500).json({ error: 'No se pudo guardar el registro. Intenta nuevamente.' });
  }
});

// Admin login
app.post('/api/admin/login', (req, res) => {
  const username = clean(req.body.username);
  const password = String(req.body.password || '');
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({ token, user: { id: user.id, username: user.username, name: user.name, role: user.role } });
});

app.get('/api/admin/me', authMiddleware, (req, res) => res.json({ user: req.user }));

app.get('/api/admin/stats', authMiddleware, (req, res) => {
  const total = db.prepare("SELECT COUNT(*) AS count FROM registrations WHERE estado='ACTIVO'").get().count;
  const campaigns = db.prepare("SELECT COUNT(*) AS count FROM campaigns WHERE is_active=1").get().count;
  const today = nowLocal().date;
  const todayCount = db.prepare(
    "SELECT COUNT(*) AS count FROM registrations WHERE fecha_registro=? AND estado='ACTIVO'"
  ).get(today).count;
  const communities = db.prepare(`
    SELECT comunidad, COUNT(*) AS count
    FROM registrations
    WHERE estado='ACTIVO'
    GROUP BY comunidad
    ORDER BY count DESC, comunidad ASC
    LIMIT 10
  `).all();

  const campaignStats = db.prepare(`
    SELECT c.id, c.title, c.category, c.slug,
           COUNT(CASE WHEN r.estado='ACTIVO' THEN 1 END) AS total_registros
    FROM campaigns c
    LEFT JOIN registrations r ON r.campaign_id=c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();

  res.json({ totalRegistrations: total, activeCampaigns: campaigns, todayRegistrations: todayCount, topCommunities: communities, campaignStats });
});

app.get('/api/admin/registrations', authMiddleware, (req, res) => {
  const { search='', campaign_id='', comunidad='', fecha_inicio='', fecha_fin='', estado='' } = req.query;
  let query = `
    SELECT r.*, c.title AS campaign_title, c.category AS campaign_category
    FROM registrations r
    JOIN campaigns c ON c.id=r.campaign_id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (
      r.nombres LIKE ? OR r.apellido_paterno LIKE ? OR r.apellido_materno LIKE ?
      OR r.dni LIKE ? OR r.celular LIKE ? OR r.reg_number LIKE ?
    )`;
    const s = `%${clean(search)}%`;
    params.push(s,s,s,s,s,s);
  }
  if (campaign_id) { query += ' AND r.campaign_id=?'; params.push(Number(campaign_id)); }
  if (comunidad) { query += ' AND r.comunidad LIKE ?'; params.push(`%${clean(comunidad)}%`); }
  if (fecha_inicio) { query += ' AND r.fecha_registro>=?'; params.push(fecha_inicio); }
  if (fecha_fin) { query += ' AND r.fecha_registro<=?'; params.push(fecha_fin); }
  if (estado) { query += ' AND r.estado=?'; params.push(estado); }

  query += ' ORDER BY r.id DESC';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/admin/communities', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT DISTINCT comunidad FROM registrations
    WHERE comunidad IS NOT NULL AND comunidad <> ''
    ORDER BY comunidad ASC
  `).all();
  res.json(rows.map(x => x.comunidad));
});

app.put('/api/admin/registrations/:id', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const current = db.prepare('SELECT id FROM registrations WHERE id=?').get(id);
  if (!current) return res.status(404).json({ error: 'Registro no encontrado.' });

  const b = req.body;
  const nombres = clean(b.nombres);
  const paterno = clean(b.apellido_paterno);
  const materno = clean(b.apellido_materno);
  const tieneDni = ['true','1',1,true].includes(b.tiene_dni);
  const dni = clean(b.dni).replace(/\D/g,'');
  const celular = clean(b.celular).replace(/\s+/g,'');
  const comunidad = clean(b.comunidad);
  const observaciones = clean(b.observaciones);
  const estado = b.estado === 'INACTIVO' ? 'INACTIVO' : 'ACTIVO';

  if (!nombres || !paterno || !materno || !celular || !comunidad) {
    return res.status(400).json({ error: 'Faltan campos obligatorios.' });
  }
  if (tieneDni && !/^\d{8}$/.test(dni)) {
    return res.status(400).json({ error: 'DNI inválido.' });
  }

  try {
    db.prepare(`
      UPDATE registrations
      SET nombres=?, apellido_paterno=?, apellido_materno=?, tiene_dni=?,
          dni=?, celular=?, comunidad=?, observaciones=?, estado=?
      WHERE id=?
    `).run(nombres,paterno,materno,tieneDni?1:0,dni,celular,comunidad,observaciones,estado,id);
    res.json({ success: true, message: 'Registro actualizado.' });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'El DNI ya existe en esta campaña.' });
    }
    res.status(500).json({ error: 'No se pudo actualizar.' });
  }
});

app.patch('/api/admin/registrations/:id/status', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT estado FROM registrations WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'Registro no encontrado.' });
  const estado = req.body.estado === 'INACTIVO'
    ? 'INACTIVO'
    : req.body.estado === 'ACTIVO'
      ? 'ACTIVO'
      : (row.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO');
  db.prepare('UPDATE registrations SET estado=? WHERE id=?').run(estado,id);
  res.json({ success:true, newStatus: estado });
});

// Campaign CRUD
app.get('/api/admin/campaigns', authMiddleware, (req, res) => {
  const rows = db.prepare(`
    SELECT c.*, COUNT(CASE WHEN r.estado='ACTIVO' THEN 1 END) AS total_registros
    FROM campaigns c
    LEFT JOIN registrations r ON r.campaign_id=c.id
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `).all();
  res.json(rows);
});

app.post('/api/admin/campaigns', authMiddleware, (req, res) => {
  try {
    const b = req.body;
    const title = clean(b.title);
    const share = clean(b.share_message);
    if (!title || !share) return res.status(400).json({ error:'Título y mensaje de difusión son obligatorios.' });

    const base = clean(b.slug || title).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const slug = `${base || 'campana'}-${Date.now().toString().slice(-6)}`;

    const result = db.prepare(`
      INSERT INTO campaigns
      (slug,header_text,title,description,category,share_message,og_title,og_description,og_image,is_active)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      slug, clean(b.header_text) || 'AHORA NACIÓN', title, clean(b.description),
      clean(b.category) || 'Inscripción', share, clean(b.og_title) || title,
      clean(b.og_description) || clean(b.description), clean(b.og_image) || '/ahora-nacion-logo.svg',
      b.is_active === false ? 0 : 1
    );
    res.status(201).json({ success:true, id:result.lastInsertRowid, slug });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error:'No se pudo crear la campaña.' });
  }
});

app.put('/api/admin/campaigns/:id', authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const b = req.body;
  const existing = db.prepare('SELECT id FROM campaigns WHERE id=?').get(id);
  if (!existing) return res.status(404).json({ error:'Campaña no encontrada.' });

  db.prepare(`
    UPDATE campaigns SET
      header_text=?, title=?, description=?, category=?, share_message=?,
      og_title=?, og_description=?, og_image=?, is_active=?
    WHERE id=?
  `).run(
    clean(b.header_text) || 'AHORA NACIÓN',
    clean(b.title),
    clean(b.description),
    clean(b.category) || 'Inscripción',
    clean(b.share_message),
    clean(b.og_title),
    clean(b.og_description),
    clean(b.og_image),
    b.is_active ? 1 : 0,
    id
  );
  res.json({ success:true, message:'Campaña actualizada.' });
});

function exportRows(queryParams) {
  const { campaign_id='', search='', comunidad='' } = queryParams;
  let query = `
    SELECT
      r.reg_number AS "N° Inscripción",
      c.title AS "Campaña",
      c.category AS "Categoría",
      r.nombres AS "Nombres",
      r.apellido_paterno AS "Apellido Paterno",
      r.apellido_materno AS "Apellido Materno",
      CASE WHEN r.tiene_dni=1 THEN 'Sí' ELSE 'No' END AS "Tiene DNI",
      r.dni AS "DNI",
      r.celular AS "Celular",
      r.comunidad AS "Comunidad/Localidad",
      r.observaciones AS "Observaciones",
      r.fecha_registro AS "Fecha Registro",
      r.hora_registro AS "Hora Registro",
      r.estado AS "Estado"
    FROM registrations r
    JOIN campaigns c ON c.id=r.campaign_id
    WHERE 1=1
  `;
  const params=[];
  if (campaign_id) { query += ' AND r.campaign_id=?'; params.push(Number(campaign_id)); }
  if (search) {
    query += ' AND (r.nombres LIKE ? OR r.apellido_paterno LIKE ? OR r.apellido_materno LIKE ? OR r.dni LIKE ? OR r.celular LIKE ?)';
    const s=`%${clean(search)}%`; params.push(s,s,s,s,s);
  }
  if (comunidad) { query += ' AND r.comunidad LIKE ?'; params.push(`%${clean(comunidad)}%`); }
  query += ' ORDER BY r.id DESC';
  return db.prepare(query).all(...params);
}

app.get('/api/admin/export/excel', authMiddleware, (req,res) => {
  try {
    const rows=exportRows(req.query);
    const ws=XLSX.utils.json_to_sheet(rows);
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,ws,'Inscritos');
    const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
    res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',`attachment; filename="Inscritos-${nowLocal().date}.xlsx"`);
    res.send(buffer);
  } catch(err) {
    console.error(err); res.status(500).json({error:'Error al generar Excel.'});
  }
});

app.get('/api/admin/export/csv', authMiddleware, (req,res) => {
  try {
    const rows=exportRows(req.query);
    const headers=['N° Inscripción','Campaña','Categoría','Nombres','Apellido Paterno','Apellido Materno','Tiene DNI','DNI','Celular','Comunidad/Localidad','Observaciones','Fecha Registro','Hora Registro','Estado'];
    const csv=[headers,...rows.map(r=>headers.map(h=>r[h] ?? ''))]
      .map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
    res.setHeader('Content-Type','text/csv; charset=utf-8');
    res.setHeader('Content-Disposition',`attachment; filename="Inscritos-${nowLocal().date}.csv"`);
    res.send('\uFEFF'+csv);
  } catch(err) {
    console.error(err); res.status(500).json({error:'Error al generar CSV.'});
  }
});

app.get('/health', (req,res)=>res.json({ok:true, service:'ahora-nacion-registro'}));

app.listen(PORT,'0.0.0.0',()=>{
  console.log(`${APP_NAME}`);
  console.log(`Servidor: http://localhost:${PORT}`);
});
