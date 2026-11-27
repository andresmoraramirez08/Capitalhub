// =============================================================================
// CapitalHub - Fotos de productos en Cloudinary (API HTTPS, sin dependencias)
// El disco de los hostings gratuitos se borra al reiniciar, por eso las fotos
// se guardan en Cloudinary y en la base solo queda la URL (productos.imagen_url).
// Variables en .env (Cloudinary > Settings > API Keys):
//   CLOUDINARY_CLOUD_NAME=...
//   CLOUDINARY_API_KEY=...
//   CLOUDINARY_API_SECRET=...
// Si faltan, el panel avisa que las fotos no están configuradas y todo lo demás sigue igual.
// =============================================================================
require('dotenv').config();
const crypto = require('crypto');

const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const CARPETA = 'capitalhub/productos';

const cloudinaryActivo = () => Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
);

/** Firma de Cloudinary: parámetros ordenados alfabéticamente + API secret, en SHA-1 */
function firmar(parametros) {
    const cadena = Object.keys(parametros).sort().map(k => `${k}=${parametros[k]}`).join('&');
    return crypto.createHash('sha1').update(cadena + process.env.CLOUDINARY_API_SECRET).digest('hex');
}

async function llamar(accion, parametros) {
    const timestamp = Math.floor(Date.now() / 1000);
    const firmados = { ...parametros, timestamp };
    delete firmados.file; // el archivo no entra en la firma

    const form = new FormData();
    for (const [k, v] of Object.entries({ ...parametros, timestamp })) form.append(k, String(v));
    form.append('api_key', process.env.CLOUDINARY_API_KEY);
    form.append('signature', firmar(firmados));

    const resp = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/${accion}`, {
        method: 'POST',
        body: form
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error((data.error && data.error.message) || `Cloudinary respondió ${resp.status}`);
    return data;
}

const idPublico = (productoId) => `${CARPETA}/producto_${Number(productoId)}`;

/**
 * Sube (o reemplaza) la foto de un producto. Regresa la URL https.
 * Cada producto tiene un solo archivo en Cloudinary, así que al cambiar la foto no quedan restos.
 */
async function subirImagenProducto(productoId, buffer, tipo) {
    const dataUri = `data:${tipo};base64,${buffer.toString('base64')}`;
    const r = await llamar('upload', {
        file: dataUri,
        public_id: idPublico(productoId),
        overwrite: 'true',
        invalidate: 'true'
    });
    return r.secure_url;
}

/** Borra la foto de un producto en Cloudinary (si no existe, no pasa nada) */
async function borrarImagenProducto(productoId) {
    await llamar('destroy', { public_id: idPublico(productoId), invalidate: 'true' });
}

module.exports = { cloudinaryActivo, subirImagenProducto, borrarImagenProducto, TIPOS_PERMITIDOS };
