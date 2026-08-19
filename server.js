require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');
const db = require('./database');
const supabase = require('./supabase');

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
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(d);

  const get = type => parts.find(p => p.type === type)?.value;

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
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization || '';

  if (!h.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Acceso denegado.'
    });
  }

  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      error: 'Sesión inválida o expirada.'
    });
  }
}

/* ============================================================
   PÁGINA PÚBLICA DE CAMPAÑA
   FUENTE OFICIAL: SUPABASE
   ============================================================ */

app.get(['/c/:slug', '/:slug'], async (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.includes('.')) {
    return next();
  }

  try {
    const slug = req.params.slug || 'campana-general';

    let { data: campaign, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!campaign) {
      const fallback = await supabase
        .from('campaigns')
        .select('*')
        .eq('is_active', true)
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallback.error) {
        throw fallback.error;
      }

      campaign = fallback.data;
    }

    if (!campaign) {
      return res.status(404).send('No hay campañas activas.');
    }

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

  } catch (err) {
    console.error('ERROR página pública:', err);
    res.status(500).send('No se pudo consultar la campaña.');
  }
});

/* ============================================================
   API PÚBLICA — CAMPAÑAS
   ============================================================ */

app.get('/api/public/campaign/:identifier', async (req, res) => {
  try {
    const { identifier } = req.params;

    let query = supabase
      .from('campaigns')
      .select('*')
      .eq('is_active', true);

    query = /^\d+$/.test(identifier)
      ? query.eq('id', Number(identifier))
      : query.eq('slug', identifier);

    let { data, error } = await query.maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      const fallback = await supabase
        .from('campaigns')
        .select('*')
        .eq('is_active', true)
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fallback.error) {
        throw fallback.error;
      }

      data = fallback.data;
    }

    if (!data) {
      return res.status(404).json({
        error: 'No hay campañas activas.'
      });
    }

    res.json(data);

  } catch (err) {
    console.error('ERROR /api/public/campaign/:identifier:', err);

    res.status(500).json({
      error: 'No se pudo consultar la campaña.'
    });
  }
});

app.get('/api/public/campaigns', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('campaigns')
      .select(`
        id,
        slug,
        title,
        category,
        header_text,
        description,
        share_message,
        og_title,
        og_description,
        og_image,
        is_active,
        created_at
      `)
      .eq('is_active', true)
      .order('title', { ascending: true });

    if (error) {
      throw error;
    }

    res.json(data || []);

  } catch (err) {
    console.error('ERROR /api/public/campaigns:', err);

    res.status(500).json({
      error: 'No se pudieron consultar las campañas.'
    });
  }
});

/* ============================================================
   REGISTRO PÚBLICO
   SUPABASE + RPC ATÓMICA
   ============================================================ */

const registerParticipant = async data => {

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, title, share_message, slug')
    .eq('id', data.campaign_id)
    .eq('is_active', true)
    .maybeSingle();

  if (campaignError) {
    throw new Error('SUPABASE_ERROR');
  }

  if (!campaign) {
    throw new Error('CAMPAIGN_NOT_FOUND');
  }

  const { date, time, year } = nowLocal();

  const { data: result, error: registerError } =
    await supabase.rpc(
      'register_participant_atomic',
      {
        p_campaign_id: data.campaign_id,
        p_nombres: data.nombres,
        p_apellido_paterno: data.apellido_paterno,
        p_apellido_materno: data.apellido_materno,
        p_tiene_dni: Boolean(data.tiene_dni),
        p_dni: data.dni,
        p_celular: data.celular,
        p_comunidad: data.comunidad,
        p_observaciones: data.observaciones,
        p_fecha_registro: date,
        p_hora_registro: time,
        p_year: year
      }
    );

  if (registerError) {

    console.error(
      'ERROR REGISTRO ATÓMICO SUPABASE:',
      JSON.stringify(registerError, null, 2)
    );

    if (
      registerError.message &&
      registerError.message.startsWith('DUPLICATE_DNI:')
    ) {
      throw new Error(registerError.message);
    }

    throw new Error(
      `SUPABASE_REGISTER_ERROR:${registerError.message}`
    );
  }

  if (!result || !result.length) {
    throw new Error('SUPABASE_EMPTY_RESULT');
  }

  const registered = result[0];

  return {
    id: registered.id,
    reg_number: registered.reg_number,
    fecha_registro: registered.fecha_registro,
    hora_registro: registered.hora_registro,
    campaign_title: campaign.title,
    share_message: campaign.share_message,
    campaign_slug: campaign.slug
  };
};

app.post('/api/public/register', async (req, res) => {

  try {

    const data = {
      campaign_id: Number(req.body.campaign_id),

      nombres: clean(req.body.nombres),

      apellido_paterno:
        clean(req.body.apellido_paterno),

      apellido_materno:
        clean(req.body.apellido_materno),

      tiene_dni:
        ['true', '1', 1, true]
          .includes(req.body.tiene_dni),

      dni:
        clean(req.body.dni)
          .replace(/\D/g, ''),

      celular:
        clean(req.body.celular)
          .replace(/\s+/g, ''),

      comunidad:
        clean(req.body.comunidad),

      observaciones:
        clean(req.body.observaciones)
    };

    if (
      !data.campaign_id ||
      !data.nombres ||
      !data.apellido_paterno ||
      !data.apellido_materno ||
      !data.celular ||
      !data.comunidad
    ) {
      return res.status(400).json({
        error: 'Completa todos los campos obligatorios.'
      });
    }

    if (
      data.tiene_dni &&
      !/^\d{8}$/.test(data.dni)
    ) {
      return res.status(400).json({
        error: 'El DNI debe contener exactamente 8 dígitos.'
      });
    }

    if (!/^\d{9}$/.test(data.celular)) {
      return res.status(400).json({
        error: 'El celular debe contener 9 dígitos.'
      });
    }

    const result = await registerParticipant(data);

    res.status(201).json({
      success: true,
      ...result
    });

  } catch (err) {

    if (err.message === 'CAMPAIGN_NOT_FOUND') {
      return res.status(400).json({
        error: 'La campaña no está activa.'
      });
    }

    if (err.message.startsWith('DUPLICATE_DNI:')) {

      const reg = err.message.split(':')[1];

      return res.status(409).json({
        error:
          `Este DNI ya está registrado en esta campaña. Código: ${reg}.`
      });
    }

    console.error(err);

    res.status(500).json({
      error:
        'No se pudo guardar el registro. Intenta nuevamente.'
    });
  }
});

/* ============================================================
   ADMIN LOGIN
   SQLITE SOLO PARA USUARIOS ADMINISTRATIVOS
   ============================================================ */

app.post('/api/admin/login', (req, res) => {

  const username = clean(req.body.username);
  const password = String(req.body.password || '');

  const user = db
    .prepare(
      'SELECT * FROM users WHERE username = ?'
    )
    .get(username);

  if (
    !user ||
    !bcrypt.compareSync(
      password,
      user.password_hash
    )
  ) {
    return res.status(401).json({
      error: 'Usuario o contraseña incorrectos.'
    });
  }

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    },
    JWT_SECRET,
    {
      expiresIn: '12h'
    }
  );

  res.json({
    token,

    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    }
  });
});

app.get('/api/admin/me', authMiddleware, (req, res) => {
  res.json({
    user: req.user
  });
});
/* ============================================================
   ADMIN — ESTADÍSTICAS
   FUENTE OFICIAL: SUPABASE
   ============================================================ */

app.get('/api/admin/stats', authMiddleware, async (req, res) => {

  try {

    const today = nowLocal().date;

    const [
      registrationsResult,
      campaignsResult,
      todayResult,
      communitiesResult,
      campaignResult,
      campaignRegsResult
    ] = await Promise.all([

      supabase
        .from('registrations')
        .select('id', {
          count: 'exact',
          head: true
        })
        .eq('estado', 'ACTIVO'),

      supabase
        .from('campaigns')
        .select('id', {
          count: 'exact',
          head: true
        })
        .eq('is_active', true),

      supabase
        .from('registrations')
        .select('id', {
          count: 'exact',
          head: true
        })
        .eq('estado', 'ACTIVO')
        .eq('fecha_registro', today),

      supabase
        .from('registrations')
        .select('comunidad')
        .eq('estado', 'ACTIVO')
        .not('comunidad', 'is', null)
        .neq('comunidad', ''),

      supabase
        .from('campaigns')
        .select(
          'id, title, category, slug, created_at'
        )
        .order('created_at', {
          ascending: false
        }),

      supabase
        .from('registrations')
        .select('campaign_id, estado')
    ]);

    for (const result of [
      registrationsResult,
      campaignsResult,
      todayResult,
      communitiesResult,
      campaignResult,
      campaignRegsResult
    ]) {
      if (result.error) {
        throw result.error;
      }
    }

    /*
     * Contar comunidades
     */

    const communityMap = new Map();

    for (const row of communitiesResult.data || []) {

      const comunidad = clean(row.comunidad);

      if (!comunidad) {
        continue;
      }

      communityMap.set(
        comunidad,
        (communityMap.get(comunidad) || 0) + 1
      );
    }

    const topCommunities =
      Array.from(communityMap.entries())
        .map(([comunidad, count]) => ({
          comunidad,
          count
        }))
        .sort((a, b) => {

          if (b.count !== a.count) {
            return b.count - a.count;
          }

          return a.comunidad.localeCompare(
            b.comunidad
          );

        })
        .slice(0, 10);

    /*
     * Contar registros por campaña
     */

    const campaignCounts = new Map();

    for (
      const row of
      campaignRegsResult.data || []
    ) {

      if (row.estado !== 'ACTIVO') {
        continue;
      }

      const campaignId =
        Number(row.campaign_id);

      campaignCounts.set(
        campaignId,
        (campaignCounts.get(campaignId) || 0) + 1
      );
    }

    const campaignStats =
      (campaignResult.data || []).map(campaign => ({

        id: campaign.id,

        title: campaign.title,

        category: campaign.category,

        slug: campaign.slug,

        total_registros:
          campaignCounts.get(
            Number(campaign.id)
          ) || 0

      }));

    res.json({

      totalRegistrations:
        registrationsResult.count || 0,

      activeCampaigns:
        campaignsResult.count || 0,

      todayRegistrations:
        todayResult.count || 0,

      topCommunities,

      campaignStats

    });

  } catch (err) {

    console.error(
      'ERROR SUPABASE /api/admin/stats:',
      JSON.stringify(err, null, 2)
    );

    res.status(500).json({
      error:
        'No se pudieron obtener las estadísticas.'
    });
  }

});


/* ============================================================
   ADMIN — LISTADO DE REGISTROS
   FUENTE OFICIAL: SUPABASE
   ============================================================ */

app.get(
  '/api/admin/registrations',
  authMiddleware,
  async (req, res) => {

    try {

      const {
        search = '',
        campaign_id = '',
        comunidad = '',
        fecha_inicio = '',
        fecha_fin = '',
        estado = ''
      } = req.query;

      let query = supabase
        .from('registrations')
        .select(`
          *,
          campaigns!inner (
            title,
            category
          )
        `)
        .order('id', {
          ascending: false
        });

      /*
       * Filtro por campaña
       */

      if (campaign_id) {

        query = query.eq(
          'campaign_id',
          Number(campaign_id)
        );

      }

      /*
       * Filtro por comunidad
       */

      if (comunidad) {

        query = query.ilike(
          'comunidad',
          `%${clean(comunidad)}%`
        );

      }

      /*
       * Filtro por fechas
       */

      if (fecha_inicio) {

        query = query.gte(
          'fecha_registro',
          fecha_inicio
        );

      }

      if (fecha_fin) {

        query = query.lte(
          'fecha_registro',
          fecha_fin
        );

      }

      /*
       * Filtro por estado
       */

      if (estado) {

        query = query.eq(
          'estado',
          estado
        );

      }

      /*
       * Búsqueda general
       */

      if (search) {

        const s = clean(search);

        query = query.or([
          `nombres.ilike.%${s}%`,
          `apellido_paterno.ilike.%${s}%`,
          `apellido_materno.ilike.%${s}%`,
          `dni.ilike.%${s}%`,
          `celular.ilike.%${s}%`,
          `reg_number.ilike.%${s}%`
        ].join(','));

      }

      const {
        data,
        error
      } = await query;

      if (error) {
        throw error;
      }

      const rows =
        (data || []).map(r => ({

          id: r.id,

          reg_number:
            r.reg_number,

          campaign_id:
            r.campaign_id,

          campaign_title:
            r.campaigns?.title || '',

          campaign_category:
            r.campaigns?.category || '',

          nombres:
            r.nombres,

          apellido_paterno:
            r.apellido_paterno,

          apellido_materno:
            r.apellido_materno,

          tiene_dni:
            r.tiene_dni,

          dni:
            r.dni,

          celular:
            r.celular,

          comunidad:
            r.comunidad,

          observaciones:
            r.observaciones,

          fecha_registro:
            r.fecha_registro,

          hora_registro:
            r.hora_registro,

          estado:
            r.estado,

          created_at:
            r.created_at

        }));

      res.json(rows);

    } catch (err) {

      console.error(
        'ERROR /api/admin/registrations:',
        JSON.stringify(err, null, 2)
      );

      res.status(500).json({
        error:
          'No se pudieron consultar los registros.'
      });

    }

  }
);


/* ============================================================
   ADMIN — COMUNIDADES
   FUENTE OFICIAL: SUPABASE
   ============================================================ */

app.get(
  '/api/admin/communities',
  authMiddleware,
  async (req, res) => {

    try {

      const {
        data,
        error
      } = await supabase
        .from('registrations')
        .select('comunidad')
        .not(
          'comunidad',
          'is',
          null
        )
        .neq(
          'comunidad',
          ''
        );

      if (error) {
        throw error;
      }

      const communities =
        [
          ...new Set(
            (data || [])
              .map(row =>
                clean(row.comunidad)
              )
              .filter(Boolean)
          )
        ]
        .sort((a, b) =>
          a.localeCompare(b)
        );

      res.json(communities);

    } catch (err) {

      console.error(
        'ERROR /api/admin/communities:',
        err
      );

      res.status(500).json({
        error:
          'No se pudieron consultar las comunidades.'
      });

    }

  }
);
/* ============================================================
   ADMIN — EDITAR REGISTRO
   FUENTE OFICIAL: SUPABASE
   ============================================================ */

app.put(
  '/api/admin/registrations/:id',
  authMiddleware,
  async (req, res) => {

    try {

      const id = Number(req.params.id);

      if (!Number.isInteger(id)) {
        return res.status(400).json({
          error: 'ID de registro inválido.'
        });
      }

      const data = {
        nombres:
          clean(req.body.nombres),

        apellido_paterno:
          clean(req.body.apellido_paterno),

        apellido_materno:
          clean(req.body.apellido_materno),

        tiene_dni:
          ['true', '1', 1, true]
            .includes(req.body.tiene_dni),

        dni:
          clean(req.body.dni)
            .replace(/\D/g, ''),

        celular:
          clean(req.body.celular)
            .replace(/\s+/g, ''),

        comunidad:
          clean(req.body.comunidad),

        observaciones:
          clean(req.body.observaciones),

        estado:
          req.body.estado === 'INACTIVO'
            ? 'INACTIVO'
            : 'ACTIVO'
      };

      if (
        !data.nombres ||
        !data.apellido_paterno ||
        !data.apellido_materno ||
        !data.celular ||
        !data.comunidad
      ) {
        return res.status(400).json({
          error:
            'Completa todos los campos obligatorios.'
        });
      }

      if (
        data.tiene_dni &&
        !/^\d{8}$/.test(data.dni)
      ) {
        return res.status(400).json({
          error:
            'El DNI debe contener exactamente 8 dígitos.'
        });
      }

      if (!/^\d{9}$/.test(data.celular)) {
        return res.status(400).json({
          error:
            'El celular debe contener 9 dígitos.'
        });
      }

      /*
       * Primero comprobamos que exista.
       */

      const existing =
        await supabase
          .from('registrations')
          .select('id')
          .eq('id', id)
          .maybeSingle();

      if (existing.error) {
        throw existing.error;
      }

      if (!existing.data) {
        return res.status(404).json({
          error:
            'El registro no existe.'
        });
      }

      /*
       * Actualización.
       */

      const {
        data: updated,
        error
      } = await supabase
        .from('registrations')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) {

        /*
         * Control de DNI duplicado si existe
         * una restricción UNIQUE.
         */

        if (
          error.code === '23505' &&
          error.message?.toLowerCase()
            .includes('dni')
        ) {
          return res.status(409).json({
            error:
              'El DNI ya está registrado.'
          });
        }

        throw error;
      }

      res.json({
        success: true,
        data: updated
      });

    } catch (err) {

      console.error(
        'ERROR EDITANDO REGISTRO:',
        JSON.stringify(err, null, 2)
      );

      res.status(500).json({
        error:
          'No se pudo actualizar el registro.'
      });

    }

  }
);


/* ============================================================
   ADMIN — CAMBIAR ESTADO
   ============================================================ */

app.patch(
  '/api/admin/registrations/:id/status',
  authMiddleware,
  async (req, res) => {

    try {

      const id = Number(req.params.id);

      const estado =
        req.body.estado === 'INACTIVO'
          ? 'INACTIVO'
          : 'ACTIVO';

      if (!Number.isInteger(id)) {
        return res.status(400).json({
          error: 'ID inválido.'
        });
      }

      const {
        data,
        error
      } = await supabase
        .from('registrations')
        .update({ estado })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        data
      });

    } catch (err) {

      console.error(
        'ERROR CAMBIANDO ESTADO:',
        err
      );

      res.status(500).json({
        error:
          'No se pudo cambiar el estado.'
      });

    }

  }
);


/* ============================================================
   ADMIN — CAMPAÑAS
   FUENTE OFICIAL: SUPABASE
   ============================================================ */

app.get(
  '/api/admin/campaigns',
  authMiddleware,
  async (req, res) => {

    try {

      const {
        data: campaigns,
        error: campaignError
      } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', {
          ascending: false
        });

      if (campaignError) {
        throw campaignError;
      }

      const {
        data: registrations,
        error: registrationError
      } = await supabase
        .from('registrations')
        .select('campaign_id,estado');

      if (registrationError) {
        throw registrationError;
      }

      const counts = new Map();

      for (
        const registration of
        registrations || []
      ) {

        if (
          registration.estado !==
          'ACTIVO'
        ) {
          continue;
        }

        const campaignId =
          Number(
            registration.campaign_id
          );

        counts.set(
          campaignId,
          (counts.get(campaignId) || 0) + 1
        );
      }

      const result =
        (campaigns || []).map(c => ({

          ...c,

          total_registros:
            counts.get(Number(c.id)) || 0

        }));

      res.json(result);

    } catch (err) {

      console.error(
        'ERROR /api/admin/campaigns:',
        JSON.stringify(err, null, 2)
      );

      res.status(500).json({
        error:
          'No se pudieron consultar las campañas.'
      });

    }

  }
);


/* ============================================================
   ADMIN — CREAR CAMPAÑA
   ============================================================ */

app.post(
  '/api/admin/campaigns',
  authMiddleware,
  async (req, res) => {

    try {

      const title =
        clean(req.body.title);

      const category =
        clean(
          req.body.category ||
          'Inscripción'
        );

      const header_text =
        clean(
          req.body.header_text ||
          'AHORA NACIÓN'
        );

      const description =
        clean(req.body.description);

      const share_message =
        clean(req.body.share_message);

      const og_title =
        clean(req.body.og_title);

      const og_description =
        clean(req.body.og_description);

      const is_active =
        Boolean(req.body.is_active);

      if (!title) {
        return res.status(400).json({
          error:
            'El título es obligatorio.'
        });
      }

      if (!share_message) {
        return res.status(400).json({
          error:
            'El mensaje de WhatsApp es obligatorio.'
        });
      }

      /*
       * Generar slug estable.
       */

      let slug =
        title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 80);

      if (!slug) {
        slug = `campana-${Date.now()}`;
      }

      const {
        data: sameSlug,
        error: slugError
      } = await supabase
        .from('campaigns')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();

      if (slugError) {
        throw slugError;
      }

      if (sameSlug) {
        slug =
          `${slug}-${Date.now()}`
            .slice(0, 90);
      }

      const {
        data,
        error
      } = await supabase
        .from('campaigns')
        .insert({
          slug,
          header_text,
          title,
          description,
          category,
          share_message,
          og_title,
          og_description,
          og_image:
            '/ahora-nacion-logo.svg',
          is_active
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      res.status(201).json({
        success: true,
        data
      });

    } catch (err) {

      console.error(
        'ERROR CREANDO CAMPAÑA:',
        JSON.stringify(err, null, 2)
      );

      res.status(500).json({
        error:
          'No se pudo crear la campaña.'
      });

    }

  }
);


/* ============================================================
   ADMIN — EDITAR CAMPAÑA
   ============================================================ */

app.put(
  '/api/admin/campaigns/:id',
  authMiddleware,
  async (req, res) => {

    try {

      const id =
        Number(req.params.id);

      if (!Number.isInteger(id)) {
        return res.status(400).json({
          error:
            'ID de campaña inválido.'
        });
      }

      const update = {};

      if (
        req.body.header_text !==
        undefined
      ) {
        update.header_text =
          clean(req.body.header_text);
      }

      if (
        req.body.title !==
        undefined
      ) {
        update.title =
          clean(req.body.title);
      }

      if (
        req.body.description !==
        undefined
      ) {
        update.description =
          clean(req.body.description);
      }

      if (
        req.body.category !==
        undefined
      ) {
        update.category =
          clean(req.body.category);
      }

      if (
        req.body.share_message !==
        undefined
      ) {
        update.share_message =
          clean(req.body.share_message);
      }

      if (
        req.body.og_title !==
        undefined
      ) {
        update.og_title =
          clean(req.body.og_title);
      }

      if (
        req.body.og_description !==
        undefined
      ) {
        update.og_description =
          clean(req.body.og_description);
      }

      if (
        req.body.is_active !==
        undefined
      ) {
        update.is_active =
          Boolean(req.body.is_active);
      }

      const {
        data,
        error
      } = await supabase
        .from('campaigns')
        .update(update)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw error;
      }

      res.json({
        success: true,
        data
      });

    } catch (err) {

      console.error(
        'ERROR EDITANDO CAMPAÑA:',
        JSON.stringify(err, null, 2)
      );

      res.status(500).json({
        error:
          'No se pudo actualizar la campaña.'
      });

    }

  }
);
/* ============================================================
   ADMIN — EXPORTAR CSV
   FUENTE OFICIAL: SUPABASE
   ============================================================ */

app.get(
  '/api/admin/export/csv',
  authMiddleware,
  async (req, res) => {

    try {

      const {
        data,
        error
      } = await supabase
        .from('registrations')
        .select(`
          reg_number,
          nombres,
          apellido_paterno,
          apellido_materno,
          tiene_dni,
          dni,
          celular,
          comunidad,
          observaciones,
          fecha_registro,
          hora_registro,
          estado,
          campaigns (
            title,
            category
          )
        `)
        .order('id', {
          ascending: true
        });

      if (error) {
        throw error;
      }

      const rows = data || [];

      const headers = [
        'N° Registro',
        'Nombres',
        'Apellido Paterno',
        'Apellido Materno',
        'Tiene DNI',
        'DNI',
        'Celular',
        'Comunidad',
        'Observaciones',
        'Fecha',
        'Hora',
        'Estado',
        'Campaña',
        'Categoría'
      ];

      const csvEscape = value => {

        const text =
          String(value ?? '');

        return `"${text
          .replace(/"/g, '""')}"`;
      };

      const lines = [
        headers
          .map(csvEscape)
          .join(',')
      ];

      for (const r of rows) {

        lines.push([
          r.reg_number,
          r.nombres,
          r.apellido_paterno,
          r.apellido_materno,
          r.tiene_dni ? 'SI' : 'NO',
          r.dni,
          r.celular,
          r.comunidad,
          r.observaciones,
          r.fecha_registro,
          r.hora_registro,
          r.estado,
          r.campaigns?.title || '',
          r.campaigns?.category || ''
        ].map(csvEscape).join(','));

      }

      const csv =
        '\uFEFF' +
        lines.join('\r\n');

      res.setHeader(
        'Content-Type',
        'text/csv; charset=utf-8'
      );

      res.setHeader(
        'Content-Disposition',
        'attachment; filename="registros-ahora-nacion.csv"'
      );

      res.send(csv);

    } catch (err) {

      console.error(
        'ERROR EXPORTANDO CSV:',
        JSON.stringify(err, null, 2)
      );

      res.status(500).json({
        error:
          'No se pudo generar el archivo CSV.'
      });

    }

  }
);


/* ============================================================
   ADMIN — EXPORTAR EXCEL
   FUENTE OFICIAL: SUPABASE
   ============================================================ */

app.get(
  '/api/admin/export/excel',
  authMiddleware,
  async (req, res) => {

    try {

      const {
        data,
        error
      } = await supabase
        .from('registrations')
        .select(`
          reg_number,
          nombres,
          apellido_paterno,
          apellido_materno,
          tiene_dni,
          dni,
          celular,
          comunidad,
          observaciones,
          fecha_registro,
          hora_registro,
          estado,
          campaigns (
            title,
            category
          )
        `)
        .order('id', {
          ascending: true
        });

      if (error) {
        throw error;
      }

      const rows =
        (data || []).map(r => ({

          'N° Registro':
            r.reg_number,

          'Nombres':
            r.nombres,

          'Apellido Paterno':
            r.apellido_paterno,

          'Apellido Materno':
            r.apellido_materno,

          'Tiene DNI':
            r.tiene_dni ? 'SI' : 'NO',

          'DNI':
            r.dni || '',

          'Celular':
            r.celular || '',

          'Comunidad':
            r.comunidad || '',

          'Observaciones':
            r.observaciones || '',

          'Fecha':
            r.fecha_registro || '',

          'Hora':
            r.hora_registro || '',

          'Estado':
            r.estado || '',

          'Campaña':
            r.campaigns?.title || '',

          'Categoría':
            r.campaigns?.category || ''

        }));

      const workbook =
        XLSX.utils.book_new();

      const worksheet =
        XLSX.utils.json_to_sheet(rows);

      worksheet['!cols'] = [
        { wch: 18 },
        { wch: 20 },
        { wch: 22 },
        { wch: 22 },
        { wch: 12 },
        { wch: 14 },
        { wch: 14 },
        { wch: 22 },
        { wch: 35 },
        { wch: 14 },
        { wch: 12 },
        { wch: 12 },
        { wch: 42 },
        { wch: 18 }
      ];

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        'Registros'
      );

      const buffer =
        XLSX.write(workbook, {
          type: 'buffer',
          bookType: 'xlsx'
        });

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );

      res.setHeader(
        'Content-Disposition',
        'attachment; filename="registros-ahora-nacion.xlsx"'
      );

      res.send(buffer);

    } catch (err) {

      console.error(
        'ERROR EXPORTANDO EXCEL:',
        JSON.stringify(err, null, 2)
      );

      res.status(500).json({
        error:
          'No se pudo generar el archivo Excel.'
      });

    }

  }
);


/* ============================================================
   HEALTH CHECK
   ============================================================ */

app.get('/api/health', (req, res) => {

  res.json({
    ok: true,
    app: APP_NAME,
    server: 'online',
    time: new Date().toISOString()
  });

});


/* ============================================================
   MANEJO DE RUTAS API NO ENCONTRADAS
   ============================================================ */

app.use('/api', (req, res) => {

  res.status(404).json({
    error: 'Ruta API no encontrada.'
  });

});


/* ============================================================
   MANEJO GLOBAL DE ERRORES
   ============================================================ */

app.use((err, req, res, next) => {

  console.error(
    'ERROR GLOBAL DEL SERVIDOR:',
    err
  );

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error:
      'Error interno del servidor.'
  });

});


/* ============================================================
   ARRANQUE
   ============================================================ */

app.listen(PORT, '0.0.0.0', () => {

  console.log('');
  console.log(APP_NAME);
  console.log(
    `Servidor: http://localhost:${PORT}`
  );
  console.log(
    'Base de datos de registros: SUPABASE'
  );
  console.log(
    'Base de datos de usuarios admin: SQLITE'
  );
  console.log('');

});