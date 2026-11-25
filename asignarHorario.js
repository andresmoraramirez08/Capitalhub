const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

async function asignarHorario() {
    try {
        // 1. Buscamos a Kevin Mora directamente en la tabla de barberos
        const resBarbero = await pool.query("SELECT id FROM barberos WHERE nombre = 'Kevin Mora'");
        
        if (resBarbero.rows.length === 0) {
            console.log("No se encontró a Kevin Mora en la tabla barberos.");
            return;
        }
        
        const barberoId = resBarbero.rows[0].id;
        console.log("ID de barbero encontrado:", barberoId);

        // 2. Le asignamos horario de Lunes (1) a Sábado (6) de 11:00 AM a 9:00 PM
        for (let dia = 1; dia <= 6; dia++) { 
            await pool.query(`
                INSERT INTO horarios_barberos (barbero_id, dia_semana, hora_inicio, hora_fin, es_descanso)
                VALUES ($1, $2, '11:00:00', '21:00:00', false)
            `, [barberoId, dia]);
        }
        
        console.log('🟢 Horario de 11:00 a 21:00 asignado exitosamente a Kevin Mora.');
    } catch (error) {
        console.error('🔴 Error detallado:', error.message);
    } finally {
        pool.end();
    }
}

asignarHorario();