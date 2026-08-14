const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new Database(dbPath);

// Habilitar claves foráneas y modo WAL para mejor rendimiento
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function initDatabase() {
  // 1. Tabla de Usuarios (Administradores)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'ADMIN',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Crear tabla de campañas si no existe
  db.exec(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      header_text TEXT NOT NULL DEFAULT 'AHORA NACIÓN — REGISTRO DE PARTICIPANTES',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Inscripción',
      share_message TEXT NOT NULL,
      og_title TEXT,
      og_description TEXT,
      og_image TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Actualizar campaña por defecto existente a Ahora Nación
  db.prepare(`
    UPDATE campaigns 
    SET header_text = 'AHORA NACIÓN',
        title = 'AHORA NACIÓN — REGISTRO DE PARTICIPANTES',
        description = 'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación. Completa tus datos para registrar tu participación.',
        share_message = '🔴 AHORA NACIÓN — REGISTRO DE PARTICIPANTES\n\n¡Súmate a nuestro movimiento!\nRegistro de personas interesadas en conocer, participar o afiliarse a Ahora Nación.\n\n📱 Completa tus datos aquí:\n\n🔗 [ENLACE]',
        og_title = 'AHORA NACIÓN — Registro de Participantes',
        og_description = 'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación.',
        og_image = '/ahora-nacion-logo.png'
    WHERE slug = 'campana-general' OR id = 1
  `).run();

  // Crear campaña por defecto si no existe ninguna
  const campaignCount = db.prepare('SELECT COUNT(*) as count FROM campaigns').get().count;
  if (campaignCount === 0) {
    db.prepare(`
      INSERT INTO campaigns (slug, header_text, title, description, category, share_message, og_title, og_description, og_image)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'campana-general',
      'AHORA NACIÓN',
      'AHORA NACIÓN — REGISTRO DE PARTICIPANTES',
      'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación. Completa tus datos para registrar tu participación.',
      'Inscripción',
      '🔴 AHORA NACIÓN — REGISTRO DE PARTICIPANTES\n\n¡Súmate a nuestro movimiento!\nRegistro de personas interesadas en conocer, participar o afiliarse a Ahora Nación.\n\n📱 Completa tus datos aquí:\n\n🔗 [ENLACE]',
      'AHORA NACIÓN — Registro de Participantes',
      'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación.',
      '/ahora-nacion-logo.png'
    );
    console.log(' Campaña de Ahora Nación configurada (Slug: campana-general)');
  }
}

initDatabase();

module.exports = db;
