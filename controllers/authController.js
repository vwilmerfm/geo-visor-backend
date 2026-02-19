const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

exports.registrarUsuario = async (req, res) => {
    const { username, password, email, rol_id } = req.body;

    try {
        const userCheck = await pool.query('SELECT * FROM seguridad.usuarios WHERE username = $1', [username]);
        if (userCheck.rows.length > 0) {
            return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        const query = `
            INSERT INTO seguridad.usuarios (username, password_hash, email, origen_auth, rol_id)
            VALUES ($1, $2, $3, 'LOCAL', $4)
            RETURNING id, username, email, origen_auth;
        `;
        const values = [username, passwordHash, email, rol_id || 2];
        const result = await pool.query(query, values);

        res.status(201).json({
            mensaje: 'Usuario creado exitosamente en local',
            usuario: result.rows[0]
        });

    } catch (error) {
        console.error('Error en el registro:', error);
        res.status(500).json({ error: 'Error interno del servidor al crear usuario en local' });
    }
};

exports.loginLocal = async (req, res) => {
    const { username, password } = req.body;

    try {
        const query = `
            SELECT u.*, r.nombre as rol_nombre 
            FROM seguridad.usuarios u 
            LEFT JOIN seguridad.roles r ON u.rol_id = r.id 
            WHERE u.username = $1 AND u.origen_auth = 'LOCAL'
        `;
        const result = await pool.query(query, [username]);
        const user = result.rows[0];

        if (!user) {
            await registrarAuditoriaLogin(username, false, 'LOCAL', req);
            return res.status(401).json({ error: 'Usuario no encontrado o credenciales inválidas' });
        }

        const passwordMatch = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatch) {
            await registrarAuditoriaLogin(username, false, 'LOCAL', req);
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        await registrarAuditoriaLogin(username, true, 'LOCAL', req);

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.rol_nombre },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        res.json({
            mensaje: 'Autenticación local exitosa',
            token,
            user: { username: user.username, role: user.rol_nombre }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};

async function registrarAuditoriaLogin(username, exitoso, origenAuth, req) {
    try {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const query = `
            INSERT INTO seguridad.historial_sesiones (username, exitoso, origen_auth, ip_address) 
            VALUES ($1, $2, $3, $4)
        `;
        await pool.query(query, [username, exitoso, origenAuth, ip]);
    } catch (error) {
        console.error('Error guardando historial de login:', error);
    }
}