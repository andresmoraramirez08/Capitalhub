const jwt = require('jsonwebtoken');

// 1. Guardia que verifica que el usuario haya iniciado sesión (Token válido)
const verificarToken = (req, res, next) => {
    // Buscamos el token en las cabeceras de la petición
    const tokenHeader = req.headers['authorization'];

    if (!tokenHeader) {
        return res.status(403).json({ error: 'Acceso denegado. No hay token de seguridad.' });
    }

    try {
        // Normalmente el token llega como "Bearer mIToken...", extraemos solo el token
        const token = tokenHeader.split(' ')[1] || tokenHeader;

        // Verificamos que el token sea auténtico usando tu llave secreta del .env
        const decodificado = jwt.verify(token, process.env.JWT_SECRET);

        // Guardamos los datos del usuario (id, rol) en la petición para usarlos en el controlador
        req.user = decodificado;

        // Todo en orden, le damos el pase a la siguiente función
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado. Inicia sesión de nuevo.' });
    }
};

// 2. Guardia que verifica los permisos (Roles)
const verificarRol = (rolesPermitidos) => {
    return (req, res, next) => {
        // Comparamos el rol del usuario que viene en el token con los roles permitidos
        if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
            return res.status(403).json({
                error: 'No tienes los permisos necesarios para realizar esta acción.'
            });
        }
        next();
    };
};

module.exports = { verificarToken, verificarRol };