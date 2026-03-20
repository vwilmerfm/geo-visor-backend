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
        const query = `
            SELECT u.*, r.nombre as rol_nombre 
            FROM seguridad.usuarios u 
            LEFT JOIN seguridad.roles r ON u.rol_id = r.id 
            WHERE LOWER(u.username) = LOWER($1)
        `;
        const result = await pool.query(query, [username]);
        let userDb = result.rows[0];

        if (userDb && !userDb.activo) {
            await registrarAuditoriaLogin(username, false, userDb.origen_auth, req);
            return res.status(403).json({ error: 'Tu cuenta ha sido desactivada. Contacta al administrador.' });
        }

        const adUserExists = await checkAdUserExists(username);

        if (adUserExists) {
            const adAuthSuccess = await authenticateWithAd(adUserExists.userPrincipalName, password);

            if (adAuthSuccess) {
                await registrarAuditoriaLogin(username, true, 'AD', req);

                if (!userDb) {
                    userDb = await syncUserFromAdToDb(username, adUserExists);
                }

                const token = generateToken(userDb);

                return res.json({
                    mensaje: 'Acceso CONCEDIDO via AD',
                    token,
                    user: { username: userDb.username, role: userDb.rol_nombre }
                });
            } else {
                await registrarAuditoriaLogin(username, false, 'AD', req);
                return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
            }
        }
        else {
            if (userDb && userDb.origen_auth === 'LOCAL') {
                const passwordMatch = await bcrypt.compare(password, userDb.password_hash);

                if (passwordMatch) {
                    await registrarAuditoriaLogin(username, true, 'LOCAL', req);
                    const token = generateToken(userDb);

                    return res.json({
                        mensaje: 'Acceso CONCEDIDO via Postgres',
                        token,
                        user: { username: userDb.username, role: userDb.rol_nombre }
                    });
                } else {
                    await registrarAuditoriaLogin(username, false, 'LOCAL', req);
                    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
                }
            } else {
                return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
            }
        }

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno del servidor al intentar iniciar sesión.' });
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

exports.getUsuarios = async (req, res) => {
    try {
        const query = `
            SELECT u.id, u.username, u.email, u.origen_auth, u.activo, u.rol_id, r.nombre as rol_nombre, u.created_at
            FROM seguridad.usuarios u
            LEFT JOIN seguridad.roles r ON u.rol_id = r.id
            ORDER BY u.id DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al obtener usuarios' });
    }
};

exports.getRoles = async (req, res) => {
    try {
        const result = await pool.query('SELECT id, nombre, descripcion FROM seguridad.roles ORDER BY id ASC');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener roles' });
    }
};

exports.updateUsuario = async (req, res) => {
    const { id } = req.params;
    const { rol_id, activo } = req.body;

    try {
        const query = `
            UPDATE seguridad.usuarios 
            SET rol_id = $1, activo = $2 
            WHERE id = $3 
            RETURNING id, username, activo, rol_id
        `;
        const result = await pool.query(query, [rol_id, activo, id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        res.json({ mensaje: 'Permisos actualizados correctamente', usuario: result.rows[0] });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error al actualizar permisos del usuario' });
    }
};

exports.buscarUsuariosAD = (req, res) => {
    const { search } = req.params;

    const ldapQuery = `(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=*${search}*)(mail=*${search}*)(displayName=*${search}*)))`;

    ad.findUsers(ldapQuery, (err, users) => {
        if (err) {
            console.error('Error buscando en AD:', err);
            return res.status(500).json({ error: 'Error al consultar el Active Directory' });
        }
        if (!users) return res.json([]);

        const mappedUsers = users.map(u => ({
            username: u.sAMAccountName,
            email: u.mail || '',
            displayName: u.displayName || ''
        }));

        res.json(mappedUsers);
    });
};

exports.crearUsuario = async (req, res) => {
    const { username, email, origen_auth, rol_id, password } = req.body;

    try {
        let password_hash = null;
        if (origen_auth === 'LOCAL') {
            if (!password) return res.status(400).json({ error: 'Los usuarios locales requieren contraseña' });
            password_hash = await bcrypt.hash(password, 10);
        }

        const query = `
            INSERT INTO seguridad.usuarios (username, email, origen_auth, rol_id, password_hash)
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING id, username, email, origen_auth, rol_id, activo
        `;
        const result = await pool.query(query, [username, email, origen_auth, rol_id, password_hash]);
        res.json({ mensaje: 'Usuario registrado exitosamente', usuario: result.rows[0] });

    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'El usuario ya está registrado en el sistema' });
        }
        console.error(error);
        res.status(500).json({ error: 'Error al registrar usuario' });
    }
};

exports.crearUsuarioAdmin = async (req, res) => {
    const { username, email, origen_auth, password } = req.body;
    const rol_id = req.body.rol_id || 1;

    try {
        let password_hash = null;

        if (origen_auth === 'LOCAL') {
            if (!password) {
                return res.status(400).json({ error: 'Los usuarios locales requieren una contraseña obligatoria.' });
            }
            password_hash = await bcrypt.hash(password, 10);
        }

        const query = `
            INSERT INTO seguridad.usuarios (username, email, origen_auth, rol_id, password_hash)
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING id, username, email, origen_auth, rol_id, activo
        `;

        const result = await pool.query(query, [username, email, origen_auth, rol_id, password_hash]);

        res.status(201).json({
            mensaje: 'Usuario administrador registrado exitosamente',
            usuario: result.rows[0]
        });

    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ error: 'Ese nombre de usuario ya está registrado en el sistema.' });
        }
        console.error('Error al crear usuario admin:', error);
        res.status(500).json({ error: 'Error interno al registrar el administrador.' });
    }
};

exports.buscarUsuariosAD = (req, res) => {
    const { search } = req.params;

    if (!search || search.length < 3) {
        return res.status(400).json({ error: 'Debes ingresar al menos 3 caracteres para buscar.' });
    }

    const ldapQuery = `(&(objectCategory=person)(objectClass=user)(|(sAMAccountName=*${search}*)(mail=*${search}*)(displayName=*${search}*)))`;

    ad.findUsers(ldapQuery, (err, users) => {
        if (err) {
            console.error('Error buscando en AD:', err);
            return res.status(500).json({ error: 'Error al consultar el Active Directory' });
        }

        if (!users || users.length === 0) return res.json([]);

        const mappedUsers = users.map(u => ({
            username: u.sAMAccountName,
            email: u.mail || '',
            nombre_completo: u.displayName || '',
            origen_auth: 'AD'
        }));

        res.json(mappedUsers);
    });
};
