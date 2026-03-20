const jwt = require('jsonwebtoken');

const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Acceso denegado. No se proporcionó un token.' });
    }

    try {
        const decodificado = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decodificado;

        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token inválido o expirado.' });
    }
};

const esRol = (rolesPermitidos) => {
    return (req, res, next) => {
        if (!req.user || !rolesPermitidos.includes(req.user.role)) {
            console.log("req.user", req.user);
            return res.status(403).json({ error: 'No tienes permisos suficientes para realizar esta acción.' });
        }
        next();
    };
};

module.exports = { verificarToken, esRol };