-- MIGRACIÓN AHORA NACIÓN - DATOS SQLITE -> SUPABASE
-- Generado automáticamente. No contiene contraseñas en texto plano.

-- CAMPAIGNS
INSERT INTO public.campaigns
(id, slug, header_text, title, description, category, share_message, og_title, og_description, og_image, is_active, created_at)
VALUES
(1, 'campana-general', 'AHORA NACIÓN', 'AHORA NACIÓN – REGISTRO DE PARTICIPANTES', 'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación. Completa tus datos para registrar tu participación.', 'Inscripción', '🔴 AHORA NACIÓN – REGISTRO DE PARTICIPANTES\n\nSúmate a nuestro movimiento.\n\nCompleta tus datos aquí: [ENLACE]', 'AHORA NACIÓN – Registro de Participantes', 'Registro de personas interesadas en conocer, participar o afiliarse a Ahora Nación.', '/ahora-nacion-logo.svg', TRUE, '2026-08-15 12:57:24')
ON CONFLICT (id) DO NOTHING;

-- REGISTRATION COUNTERS
INSERT INTO public.registration_counters
(campaign_id, year, last_number)
VALUES
(1, 2026, 11)
ON CONFLICT (campaign_id, year) DO NOTHING;

-- REGISTRATIONS
INSERT INTO public.registrations
(id, reg_number, campaign_id, nombres, apellido_paterno, apellido_materno, tiene_dni, dni, celular, comunidad, observaciones, fecha_registro, hora_registro, estado, created_at)
VALUES
(5, 'INS-2026-0001', 1, 'lucio', 'noguera', 'pdro', TRUE, '15242635', '939254812', 'santoshari', 'obtmo', '2026-08-17', '07:57:03', 'ACTIVO', '2026-08-17 12:57:03')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.registrations
(id, reg_number, campaign_id, nombres, apellido_paterno, apellido_materno, tiene_dni, dni, celular, comunidad, observaciones, fecha_registro, hora_registro, estado, created_at)
VALUES
(6, 'INS-2026-0002', 1, 'Arturo', 'Pasional', 'Vilchez', TRUE, '40650525', '925294321', 'Mimirini', 'Positivo', '2026-08-17', '08:44:59', 'ACTIVO', '2026-08-17 13:45:00')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.registrations
(id, reg_number, campaign_id, nombres, apellido_paterno, apellido_materno, tiene_dni, dni, celular, comunidad, observaciones, fecha_registro, hora_registro, estado, created_at)
VALUES
(7, 'INS-2026-0003', 1, 'Mari', 'Savedra', 'Gomez', TRUE, '40852314', '925294321', 'Santoshari', 'Falta', '2026-08-17', '08:53:02', 'ACTIVO', '2026-08-17 13:53:02')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.registrations
(id, reg_number, campaign_id, nombres, apellido_paterno, apellido_materno, tiene_dni, dni, celular, comunidad, observaciones, fecha_registro, hora_registro, estado, created_at)
VALUES
(8, 'INS-2026-0004', 1, 'Pedro', 'Lucas', 'Juan', TRUE, '89562345', '925294321', 'Mantaro', 'Bueno', '2026-08-17', '10:22:28', 'ACTIVO', '2026-08-17 15:22:28')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.registrations
(id, reg_number, campaign_id, nombres, apellido_paterno, apellido_materno, tiene_dni, dni, celular, comunidad, observaciones, fecha_registro, hora_registro, estado, created_at)
VALUES
(9, 'INS-2026-0005', 1, 'Haylin', 'Barboza', 'Yumpiri', TRUE, '81458658', '928772846', 'Llochegua', '', '2026-08-17', '10:27:21', 'ACTIVO', '2026-08-17 15:27:21')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.registrations
(id, reg_number, campaign_id, nombres, apellido_paterno, apellido_materno, tiene_dni, dni, celular, comunidad, observaciones, fecha_registro, hora_registro, estado, created_at)
VALUES
(10, 'INS-2026-0006', 1, 'Astri', 'Quispe', 'Calixto', TRUE, '45784537', '978542135', 'Mantaro', 'Activo', '2026-08-17', '15:02:49', 'ACTIVO', '2026-08-17 20:02:49')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.registrations
(id, reg_number, campaign_id, nombres, apellido_paterno, apellido_materno, tiene_dni, dni, celular, comunidad, observaciones, fecha_registro, hora_registro, estado, created_at)
VALUES
(11, 'INS-2026-0007', 1, 'Mauro', 'Fuentes', 'Dias', TRUE, '45781223', '935395321', 'Mantaro', 'Bueno', '2026-08-17', '15:19:47', 'ACTIVO', '2026-08-17 20:19:47')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.registrations
(id, reg_number, campaign_id, nombres, apellido_paterno, apellido_materno, tiene_dni, dni, celular, comunidad, observaciones, fecha_registro, hora_registro, estado, created_at)
VALUES
(12, 'INS-2026-0008', 1, 'prueva', 'sistema', 'test', FALSE, '', '999999999', 'Mantaro', '', '2026-08-18', '08:26:45', 'INACTIVO', '2026-08-18 13:26:45')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.registrations
(id, reg_number, campaign_id, nombres, apellido_paterno, apellido_materno, tiene_dni, dni, celular, comunidad, observaciones, fecha_registro, hora_registro, estado, created_at)
VALUES
(13, 'INS-2026-0009', 1, 'Prueva', 'Sistem', 'Final', FALSE, '', '999999999', 'Prueva', 'Prurva final', '2026-08-18', '09:06:15', 'ACTIVO', '2026-08-18 14:06:15')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.registrations
(id, reg_number, campaign_id, nombres, apellido_paterno, apellido_materno, tiene_dni, dni, celular, comunidad, observaciones, fecha_registro, hora_registro, estado, created_at)
VALUES
(14, 'INS-2026-0010', 1, 'Provar', 'Ahora', 'Queda', FALSE, '', '999999999', 'Prueva', 'Bien', '2026-08-18', '09:31:59', 'ACTIVO', '2026-08-18 14:31:59')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.registrations
(id, reg_number, campaign_id, nombres, apellido_paterno, apellido_materno, tiene_dni, dni, celular, comunidad, observaciones, fecha_registro, hora_registro, estado, created_at)
VALUES
(15, 'INS-2026-0011', 1, 'Prueva', 'Once', 'Completa', FALSE, '', '999999999', 'Santoshari', 'Vale', '2026-08-18', '09:39:10', 'ACTIVO', '2026-08-18 14:39:10')
ON CONFLICT (id) DO NOTHING;

-- USERS
INSERT INTO public.users
(id, username, password_hash, name, role, created_at)
VALUES
(1, 'admin', '$2a$12$eWEe9XN2CdAaxMfGAbkS9Ogq83Q8QnaAr1B/a1FBKPE5xv/Edt28C', 'Administrador', 'ADMIN', '2026-08-15 12:57:25')
ON CONFLICT (id) DO NOTHING;

-- ACTUALIZAR SECUENCIAS IDENTITY
SELECT setval(pg_get_serial_sequence('public.campaigns','id'), COALESCE((SELECT MAX(id) FROM public.campaigns), 1), true);
SELECT setval(pg_get_serial_sequence('public.registrations','id'), COALESCE((SELECT MAX(id) FROM public.registrations), 1), true);
SELECT setval(pg_get_serial_sequence('public.users','id'), COALESCE((SELECT MAX(id) FROM public.users), 1), true);