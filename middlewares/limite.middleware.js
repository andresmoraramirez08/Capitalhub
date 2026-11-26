// =============================================================================
// CapitalHub - Límite de peticiones para las rutas públicas (anti-spam)
// Cuenta cuántas peticiones hace cada IP en una ventana de tiempo; si se pasa,
// responde 429. Se guarda en memoria (suficiente para un solo servidor).
// Uso: router.post('/citas', limitarPeticiones({ max: 10, ventanaMin: 15 }), handler)
// =============================================================================
const limitarPeticiones = ({ max = 10, ventanaMin = 15, mensaje } = {}) => {
    const ventanaMs = ventanaMin * 60 * 1000;
    const conteos = new Map(); // ip -> { total, reinicio }

    // Limpieza periódica para que el mapa no crezca sin fin
    setInterval(() => {
        const ahora = Date.now();
        for (const [ip, dato] of conteos) {
            if (dato.reinicio <= ahora) conteos.delete(ip);
        }
    }, ventanaMs).unref();

    return (req, res, next) => {
        const ip = req.ip || (req.socket && req.socket.remoteAddress) || 'desconocida';
        const ahora = Date.now();
        let dato = conteos.get(ip);
        if (!dato || dato.reinicio <= ahora) {
            dato = { total: 0, reinicio: ahora + ventanaMs };
            conteos.set(ip, dato);
        }
        dato.total++;
        if (dato.total > max) {
            const minutos = Math.ceil((dato.reinicio - ahora) / 60000);
            return res.status(429).json({
                message: mensaje || `Demasiados intentos. Intenta de nuevo en ${minutos} min.`
            });
        }
        next();
    };
};

module.exports = { limitarPeticiones };
