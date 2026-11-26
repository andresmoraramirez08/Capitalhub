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

module.exports = { verificarToken, verificarRol };