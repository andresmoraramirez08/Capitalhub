// =============================================================================
// CapitalHub - Respaldo de la base de datos
// Uso (desde la carpeta del proyecto):   npm run respaldo
//
// Genera un archivo en la carpeta /respaldos con la fecha y hora, por ejemplo:
//   respaldos/capitalhub_2026-11-26_00-30.backup
// Usa los datos de conexión del archivo .env (no se escriben contraseñas aquí).
//
// Para RESTAURAR un respaldo (en pgAdmin: clic derecho en la base > Restore...,
// o desde la terminal):
//   pg_restore -U <usuario> -d <base> --clean --if-exists respaldos/<archivo>.backup
// =============================================================================
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// 1. Encontrar pg_dump: primero la variable PG_DUMP_PATH, luego la instalación
//    típica de PostgreSQL en Windows, y si no, el que esté en el PATH.
function buscarPgDump() {
    if (process.env.PG_DUMP_PATH && fs.existsSync(process.env.PG_DUMP_PATH)) {
        return process.env.PG_DUMP_PATH;
    }
    const base = 'C:\\Program Files\\PostgreSQL';
    if (fs.existsSync(base)) {
        const versiones = fs.readdirSync(base)
            .filter(v => fs.existsSync(path.join(base, v, 'bin', 'pg_dump.exe')))
            .sort((a, b) => Number(b) - Number(a)); // la versión más nueva primero
        if (versiones.length > 0) return path.join(base, versiones[0], 'bin', 'pg_dump.exe');
    }
    return 'pg_dump';
}

// 2. Nombre del archivo con fecha y hora local
const ahora = new Date();
const dos = (n) => String(n).padStart(2, '0');
const sello = `${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}_${dos(ahora.getHours())}-${dos(ahora.getMinutes())}`;
const carpeta = path.join(__dirname, '..', 'respaldos');
fs.mkdirSync(carpeta, { recursive: true });
const archivo = path.join(carpeta, `${process.env.DB_NAME || 'capitalhub'}_${sello}.backup`);

const pgDump = buscarPgDump();
const args = [
    '-h', process.env.DB_HOST || 'localhost',
    '-p', String(process.env.DB_PORT || 5432),
    '-U', process.env.DB_USER || 'postgres',
    '-F', 'c',          // formato "custom": comprimido y se restaura con pg_restore
    '-f', archivo,
    process.env.DB_NAME
];

console.log(`💾 Respaldando la base "${process.env.DB_NAME}" con ${pgDump} ...`);
const proceso = spawn(pgDump, args, {
    // La contraseña va por variable de entorno para que no aparezca en pantalla
    env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' },
    stdio: ['ignore', 'inherit', 'inherit']
});

proceso.on('error', (err) => {
    console.error('🔴 No se encontró pg_dump. Instala las herramientas de PostgreSQL o agrega');
    console.error('   en tu .env la ruta completa, por ejemplo:');
    console.error('   PG_DUMP_PATH=C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe');
    console.error('   Detalle:', err.message);
    process.exit(1);
});

proceso.on('close', (codigo) => {
    if (codigo === 0) {
        const kb = (fs.statSync(archivo).size / 1024).toFixed(1);
        console.log(`🟢 Respaldo listo: ${archivo} (${kb} KB)`);
    } else {
        console.error(`🔴 El respaldo falló (código ${codigo}). Revisa los datos de conexión del .env.`);
        if (fs.existsSync(archivo) && fs.statSync(archivo).size === 0) fs.unlinkSync(archivo);
        process.exit(codigo || 1);
    }
});
