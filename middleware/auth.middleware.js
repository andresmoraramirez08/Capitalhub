const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Acceso denegado. Se requiere token.' });

    try {
        // Quitamos la palabra "Bearer " para leer solo el token puro
        const tokenLimpio = token.replace('Bearer ', '');
        const verificado = jwt.verify(tokenLimpio, process.env.JWT_SECRET);
        req.user = verificado; // Guardamos la info del usuario (ID y Rol) en la petición
        next(); // Autorizamos el paso a la ruta solicitada
    } catch (error) {
        res.status(401).json({ message: 'Token inválido o expirado.' });
    }
};

module.exports = { verificarToken };