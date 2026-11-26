const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
    const tokenHeader = req.headers['authorization'];
    if (!tokenHeader) {
        return res.status(403).json({ error: 'Acceso denegado. No hay token de seguridad.' });
    }

    try {
        const token = tokenHeader.startsWith('Bearer ') 
            ? tokenHeader.split(' ')[1] 
            : tokenHeader;

        const decodificado = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decodificado;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado.' });
    }
};

const verificarRol = (rolesPermitidos) => {
    return (req, res, next) => {
        const rolUsuario = req.user ? Number(req.user.rol || req.user.rol_id) : null;
        const permitidosNum = rolesPermitidos.map(Number);

        if (!req.user || !permitidosNum.includes(rolUsuario)) {
            return res.status(403).json({
                error: 'No tienes los permisos necesarios para realizar esta acción.'
            });
        }
        next();
    };
};

/**
 * Para rutas públicas que también aceptan sesión (agendar en el portal):
 * sin token sigue como invitado (req.user = null); con token válido llena req.user;
 * con token vencido o alterado responde 401 para que la página pida iniciar sesión otra vez.
 */
const verificarTokenOpcional = (req, res, next) => {
    const tokenHeader = req.headers['authorization'];
    if (!tokenHeader) {
        req.user = null;
        return next();
    }
    try {
        const token = tokenHeader.startsWith('Bearer ') ? tokenHeader.split(' ')[1] : tokenHeader;
        req.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
    }
};

module.exports = { verificarToken, verificarRol, verificarTokenOpcional };