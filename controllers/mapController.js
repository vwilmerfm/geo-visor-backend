const pool = require('../config/db');

exports.getDepartamentos = async (req, res) => {
    try {
        const query = `
            SELECT json_build_object(
                'type', 'FeatureCollection',
                'features', json_agg(ST_AsGeoJSON(t.*)::json)
            ) as geojson
            FROM (
                SELECT id, nombre, codigo_ine, geom FROM departamentos
            ) as t(id, nombre, codigo_ine, geom);
        `;

        const result = await pool.query(query);

        res.json(result.rows[0].geojson);

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error obteniendo cartografía' });
    }
};

exports.getMunicipiosPorDepartamento = async (req, res) => {
    const { departamento_id } = req.params;

    try {
        const query = `
            SELECT json_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)
            ) as geojson
            FROM (
                SELECT id, nombre, codigo_ine, geom 
                FROM municipios 
                WHERE departamento_id = $1
            ) as t;
        `;

        const result = await pool.query(query, [departamento_id]);

        res.json(result.rows[0].geojson);

    } catch (error) {
        console.error('Error obteniendo municipios:', error);
        res.status(500).json({ error: 'Error interno al consultar la cartografía' });
    }
};

exports.getComunidades = async (req, res) => {
    const { municipio_id } = req.params;

    try {
        const query = `
            SELECT json_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)
            ) as geojson
            FROM (
                SELECT id, nombre, geom 
                FROM comunidades 
                WHERE municipio_id = $1
            ) as t;
        `;

        const result = await pool.query(query, [municipio_id]);
        res.json(result.rows[0].geojson);

    } catch (error) {
        console.error('Error obteniendo comunidades:', error);
        res.status(500).json({ error: 'Error interno al consultar las comunidades' });
    }
};