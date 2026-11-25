const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const ROL_CLIENTE = 3;

const listarClientes = async (req, res) => {
    try {
        const buscar = (req.query.buscar || '').trim();

        let query = `
            SELECT
                u.id,
                u.nombre,
                u.apellidos,
                u.email,
                u.telefono,
                u.activo,
                u.creado_en,
                COUNT(c.id)::int AS total_citas,
                COUNT(c.id) FILTER (WHERE c.estado = 'COMPLETADA')::int AS citas_completadas,
                MAX(c.fecha_cita) AS ultima_visita,
                COALESCE(SUM(s.precio) FILTER (WHERE c.estado = 'COMPLETADA'), 0)::numeric(10,2) AS total_gastado
            FROM usuarios u
            LEFT JOIN citas c
                ON u.telefono IS NOT NULL
                AND u.telefono <> ''
                AND c.telefono_invitado = u.telefono
            LEFT JOIN servicios s ON c.servicio_id = s.id
            WHERE u.rol_id = $1
        `;

        const params = [ROL_CLIENTE];

        if (buscar) {
            query += `
                AND (
                    u.nombre ILIKE $2
                    OR COALESCE(u.apellidos, '') ILIKE $2
                    OR COALESCE(u.telefono, '') ILIKE $2
                    OR COALESCE(u.email, '') ILIKE $2
                )
            `;
            params.push(`%${buscar}%`);
        }

        query += `
            GROUP BY u.id, u.nombre, u.apellidos, u.email, u.telefono, u.activo, u.creado_en
            ORDER BY ultima_visita DESC NULLS LAST, u.nombre ASC
        `;

        const result = await pool.query(query, params);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error al listar clientes:', error);
        res.status(500).json({ message: 'Error interno al obtener clientes' });
    }
};

const crearClienteRapido = async (req, res) => {
    try {
        const { nombre, apellidos, telefono, email } = req.body;
        const nombreLimpio = (nombre || '').trim();
        const telLimpio = (telefono || '').trim();
        const emailLimpio = (email || '').trim().toLowerCase();
        const apellidosLimpio = (apellidos || '').trim();

        if (!nombreLimpio || !telLimpio) {
            return res.status(400).json({ message: 'Nombre y teléfono son obligatorios' });
        }

        // Buscar si ya existe un cliente con ese teléfono o correo
        const existente = await pool.query(
            `SELECT id, nombre, apellidos, telefono, email, activo
             FROM usuarios
             WHERE rol_id = $1
               AND (
                   telefono = $2
                   OR ($3 <> '' AND LOWER(COALESCE(email, '')) = $3)
               )
             LIMIT 1`,
            [ROL_CLIENTE, telLimpio, emailLimpio]
        );

        if (existente.rowCount > 0) {
            return res.status(200).json({
                message: 'Cliente ya registrado; se reutilizó su perfil',
                cliente: existente.rows[0],
                existente: true
            });
        }

        const idNuevo = crypto.randomUUID();
        const passwordTemporal = crypto.createHash('sha256').update(crypto.randomUUID()).digest('hex');

        const insertRes = await pool.query(
            `INSERT INTO usuarios (id, nombre, apellidos, telefono, email, password_hash, rol_id, activo)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)
             RETURNING id, nombre, apellidos, telefono, email, activo`,
            [
                idNuevo,
                nombreLimpio,
                apellidosLimpio || null,
                telLimpio,
                emailLimpio || null,
                passwordTemporal,
                ROL_CLIENTE
            ]
        );

        res.status(201).json({
            message: 'Cliente creado con rol 3',
            cliente: insertRes.rows[0],
            existente: false
        });
    } catch (error) {
        console.error('Error al crear cliente rápido:', error);
        res.status(500).json({ message: 'Error interno al registrar cliente' });
    }
};

const obtenerHistorialCliente = async (req, res) => {
    try {
        const { id } = req.params;

        const clienteRes = await pool.query(
            `SELECT id, nombre, apellidos, telefono, email FROM usuarios WHERE id = $1 AND rol_id = $2`,
            [id, ROL_CLIENTE]
        );

        if (clienteRes.rows.length === 0) {
            return res.status(404).json({ message: 'Cliente no encontrado' });
        }

        const cliente = clienteRes.rows[0];
        const nombreCompleto = `${cliente.nombre || ''} ${cliente.apellidos || ''}`.trim();

        const citasRes = await pool.query(
            `
            SELECT
                c.id,
                c.fecha_cita,
                c.hora_inicio,
                c.nombre_invitado,
                c.telefono_invitado,
                c.estado,
                s.nombre AS servicio,
                s.precio,
                b.nombre AS nombre_barbero
            FROM citas c
            LEFT JOIN servicios s ON c.servicio_id = s.id
            LEFT JOIN barberos b ON c.barbero_id = b.id
            WHERE
                ($1 <> '' AND c.telefono_invitado = $1)
                OR ($2 <> '' AND c.nombre_invitado ILIKE $2)
            ORDER BY c.fecha_cita DESC, c.hora_inicio DESC
            `,
            [cliente.telefono || '', nombreCompleto || cliente.nombre || '']
        );

        res.status(200).json({
            cliente,
            citas: citasRes.rows
        });
    } catch (error) {
        console.error('Error al obtener historial del cliente:', error);
        res.status(500).json({ message: 'Error interno al obtener historial' });
    }
};

module.exports = {
    listarClientes,
    crearClienteRapido,
    obtenerHistorialCliente
};