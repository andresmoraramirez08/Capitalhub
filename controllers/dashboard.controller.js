const { Pool } = require('pg');

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

const obtenerResumen = async (req, res) => {
    try {
        // Consultar total de citas registradas
        const citasResult = await pool.query('SELECT COUNT(*) AS total_citas FROM citas');
        
        // Consultar barberos activos
        const barberosResult = await pool.query('SELECT COUNT(*) AS total_barberos FROM barberos WHERE activo = TRUE');

        // Consultar ingresos (sumando el precio de servicios de citas completadas, por ahora en 0 si no hay)
        // Más adelante lo conectaremos con las ventas reales
        
        res.json({
            citasPendientes: citasResult.rows[0].total_citas,
            ingresos: 0, 
            barberosActivos: barberosResult.rows[0].total_barberos
        });
    } catch (error) {
        console.error('Error al obtener el resumen:', error);
        res.status(500).json({ message: 'Error interno del servidor' });
    }
};

module.exports = { obtenerResumen };