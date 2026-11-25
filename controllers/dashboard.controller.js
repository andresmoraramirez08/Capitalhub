const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const obtenerResumen = async (req, res) => {
    try {
        // 1. Contar citas del día (que no estén canceladas)
        const citasResult = await pool.query(`
            SELECT COUNT(*) FROM citas 
            WHERE fecha_cita = CURRENT_DATE AND estado != 'CANCELADA'
        `);

        // 2. Sumar Ingresos del día por citas completadas
        const ingresosCitasResult = await pool.query(`
            SELECT COALESCE(SUM(s.precio), 0) AS total 
            FROM citas c
            JOIN servicios s ON c.servicio_id = s.id
            WHERE c.fecha_cita = CURRENT_DATE AND c.estado = 'COMPLETADA'
        `);

        // 3. Sumar Ventas de productos del día (excluyendo canceladas)
        const ingresosProductosResult = await pool.query(`
            SELECT COALESCE(SUM(total), 0) AS total
            FROM ventas
            WHERE creado_en::date = CURRENT_DATE AND estado <> 'CANCELADA'
        `);

        // 4. Contar barberos activos
        const barberosResult = await pool.query(`
            SELECT COUNT(*) FROM barberos WHERE activo = true
        `);

        const ingresosCitas = parseFloat(ingresosCitasResult.rows[0].total) || 0;
        const ingresosProductos = parseFloat(ingresosProductosResult.rows[0].total) || 0;
        const ingresosTotales = Number((ingresosCitas + ingresosProductos).toFixed(2));

        res.status(200).json({
            citasPendientes: parseInt(citasResult.rows[0].count, 10),
            ingresos: ingresosTotales,
            ingresosCitas,
            ingresosProductos,
            barberosActivos: parseInt(barberosResult.rows[0].count, 10)
        });
    } catch (error) {
        console.error("Error al cargar resumen del dashboard:", error);
        res.status(500).json({ message: "Error interno" });
    }
};

module.exports = { obtenerResumen };