require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');

if (!process.env.SUPABASE_URL) {
  throw new Error('Falta SUPABASE_URL en .env');
}

if (!process.env.SUPABASE_SECRET_KEY) {
  throw new Error('Falta SUPABASE_SECRET_KEY en .env');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

module.exports = supabase;