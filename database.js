const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'database.sqlite');
const db = new Database(dbPath);

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('synchronous = NORMAL');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'ADMIN',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      header_text TEXT NOT NULL DEFAULT 'AHORA NACIÓN',
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Inscripción',
      share_message TEXT NOT NULL DEFAULT '',
      og_title TEXT,
      og_description TEXT,
      og_image TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS registration_counters (
      campaign_id INTEGER NOT NULL,
      year INTEGER NOT NULL,
      last_number INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (campaign_id, year),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reg_number TEXT NOT NULL,
      campaign_id INTEGER NOT NULL,
      nombres TEXT NOT NULL,
      apellido_paterno TEXT NOT NULL,
      apellido_materno TEXT NOT NULL,
      tiene_dni INTEGER NOT NULL DEFAULT 0,
      dni TEXT NOT NULL DEFAULT '',
      celular TEXT NOT NULL,
      comunidad TEXT NOT NULL,
      observaciones TEXT NOT NULL DEFAULT '',
      fecha_registro TEXT NOT NULL,
      hora_registro TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'ACTIVO',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS ux_reg_campaign_number
      ON registrations(campaign_id, reg_number);

    CREATE UNIQUE INDEX IF NOT EXISTS ux_reg_campaign_dni
      ON registrations(campaign_id, dni)
      WHERE tiene_dni = 1 AND dni <> '';

    CREATE INDEX IF NOT EXISTS ix_reg_campaign ON registrations(campaign_id);
    CREATE INDEX IF NOT EXISTS ix_reg_dni ON registrations(dni);
    CREATE INDEX IF NOT EXISTS ix_reg_celular ON registrations(celular);
    CREATE INDEX IF NOT EXISTS ix_reg_comunidad ON registrations(comunidad);
    CREATE INDEX IF NOT EXISTS ix_reg_fecha ON registrations(fecha_registro);
  `);

  const campaignCount = db.prepare('SELECT COUNT(*) AS count FROM campaigns').get().count;
  if (campaignCount === 0) {
    const share = '🔴 AHORA NACIÓN – REGISTRO DE PARTICIPANTES\\n\\nSúmate a nuestro movimiento.\\n\\nCompleta tus datos aquí: [ENLACE]';
    db.prepare(`
      INSERT INTO campaigns
      (slug, header_text, title, description, category, share_message, og_title, og_description, og_image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'campana-general',
      'AHORA NACIÓN',
      'AHORA NACIÓN – REGISTRO DE PARTICIPANTES',
      'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación. Completa tus datos para registrar tu participación.',
      'Inscripción',
      share,
      'AHORA NACIÓN – Registro de Participantes',
      'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación.',
      '/ahora-nacion-logo.svg'
    );
  }

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'Admin123!';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);

  if (!existing) {
    const hash = bcrypt.hashSync(password, 12);
    db.prepare(`
      INSERT INTO users (username, password_hash, name, role)
      VALUES (?, ?, ?, 'ADMIN')
    `).run(username, hash, 'Administrador');
    console.log(`Usuario administrador creado: ${username}`);
  }
}

initDatabase();

module.exports = db;
