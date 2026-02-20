const ActiveDirectory = require('activedirectory2');
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const adConfig = {
    url: process.env.AD_URL,
    baseDN: process.env.AD_BASE_DN,
    username: process.env.AD_USER,
    password: process.env.AD_PASSWORD
};

const ad = new ActiveDirectory(adConfig);

exports.login = async (req, res) => {
    const { username, password } = req.body;

    try {
        const adUserExists = await checkAdUserExists(username);

        console.log("adUserExists", adUserExists);

        if (adUserExists) {
            // const adAuthSuccess = await authenticateWithAd(username, password);
            const adAuthSuccess = await authenticateWithAd(adUserExists.userPrincipalName, password);

            if (adAuthSuccess) {
                await registrarAuditoriaLogin(username, true, 'AD', req);

                const userDb = await syncUserFromAdToDb(username, adUserExists);
                const token = generateToken(userDb);

                return res.json({
                    mensaje: 'Acceso CONCEDIDO via AD',
                    token,
                    user: { username: userDb.username, role: userDb.rol_nombre }
                });
            } else {
                await registrarAuditoriaLogin(username, false, 'AD', req);
                return res.status(401).json({ error: 'Denegar acceso: credenciales AD incorrectas' });
            }
        }
        else {
            const userLocal = await getUserFromDb(username);

            if (userLocal && userLocal.origen_auth === 'LOCAL') {
                const passwordMatch = await bcrypt.compare(password, userLocal.password_hash);

                if (passwordMatch) {
                    await registrarAuditoriaLogin(username, true, 'LOCAL', req);

                    const token = generateToken(userLocal);
                    return res.json({
                        mensaje: 'Acceso CONCEDIDO via Postgres',
                        token,
                        user: { username: userLocal.username, role: userLocal.rol_nombre }
                    });
                } else {
                    await registrarAuditoriaLogin(username, false, 'LOCAL', req);
                    return res.status(401).json({ error: 'Credenciales locales incorrectas' });
                }
            } else {
                return res.status(404).json({ error: 'Usuario no encontrado en ningún sistema' });
            }
        }

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
        console.error('Error al registrar auditoria:', error);
    }
}

function checkAdUserExists(username) {
    return new Promise((resolve) => {
        ad.findUser(username, (err, user) => {
            if (err) {
                console.log(`Busqueda en AD fallo o no se encontro a ${username}.`);
                return resolve(false);
            }
            if (!user) return resolve(false);
            return resolve(user);
        });
    });
}

function authenticateWithAd(username, password) {
    return new Promise((resolve) => {
        ad.authenticate(username, password, (err, auth) => {
            if (err) {
                console.error(`Error de autenticacion AD para ${username}:`, JSON.stringify(err));
                return resolve(false);
            }
            return resolve(auth);
        });
    });
}

async function getUserFromDb(username) {
    const query = `
        SELECT u.*, r.nombre as rol_nombre 
        FROM seguridad.usuarios u 
        LEFT JOIN seguridad.roles r ON u.rol_id = r.id 
        WHERE u.username = $1
    `;
    const result = await pool.query(query, [username]);
    return result.rows[0];
}

async function syncUserFromAdToDb(username, adInfo) {
    let user = await getUserFromDb(username);

    if (!user) {
        const insert = `
            INSERT INTO seguridad.usuarios (username, email, origen_auth, rol_id)
            VALUES ($1, $2, 'AD', 2) 
            RETURNING id, username, email, origen_auth, rol_id
        `;
        const email = adInfo.mail || `${username}@ine.gov.bo`;
        const res = await pool.query(insert, [username, email]);

        user = res.rows[0];
        user.rol_nombre = 'usuario';
    }
    return user;
}

function generateToken(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            role: user.rol_nombre || 'user'
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
    );
}