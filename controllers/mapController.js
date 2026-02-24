const pool = require('../config/db');

exports.getDepartamentos = async (req, res) => {
    try {
        const query = `
            SELECT json_build_object(
                           'type', 'FeatureCollection',
                           'features', json_agg(ST_AsGeoJSON(t.*)::json)
                   ) as geojson
            FROM (
                     SELECT
                         id,
                         depto AS nombre,
                         cod_depto AS codigo_ine,
                         geom
                     FROM insumos.lim_depto
                 ) as t;
        `;

        const result = await pool.query(query);
        res.json(result.rows[0].geojson);

    } catch (error) {
        console.error('Error obteniendo departamentos:', error);
        res.status(500).json({ error: 'Error obteniendo cartografia de departamentos' });
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
                SELECT 
                    id_0 AS id,             
                    mpio AS nombre,         
                    cod_mpio AS codigo_ine, 
                    geom 
                FROM insumos.municipios_ds_5050 
                WHERE CAST(cod_depto AS INTEGER) = $1
            ) as t;
        `;

        const result = await pool.query(query, [departamento_id]);
        res.json(result.rows[0].geojson);

    } catch (error) {
        console.error('Error obteniendo municipios:', error);
        res.status(500).json({ error: 'Error interno al consultar la cartografia de municipios' });
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
                SELECT 
                    c.id, 
                    c.ciu_com AS nombre, 
                    c.geom 
                FROM marco_referencial.mr_comunidades c
                JOIN insumos.municipios_ds_5050 m 
                  ON c.cod_depto = m.cod_depto 
                 AND c.cod_prov = m.cod_prov 
                 AND c.cod_mpio = m.cod_mpio
                WHERE m.id_0 = $1
            ) as t;
        `;

        const result = await pool.query(query, [municipio_id]);
        res.json(result.rows[0].geojson);

    } catch (error) {
        console.error('Error obteniendo comunidades:', error);
        res.status(500).json({ error: 'Error interno al consultar las comunidades' });
    }
};

exports.getEstadisticas = async (req, res) => {
    const { nivel, id } = req.query;
    let query = '';

    try {
        if (nivel === 'departamental') {
            query = `
                SELECT 
                    COUNT(DISTINCT a.id_com_area) as comunidades,
                    COALESCE(CAST(SUM(a.total_viv_cpv) AS INTEGER), 0) as "viviendasCPV",
                    COALESCE(CAST(SUM(a.tot_viv_12) AS INTEGER), 0) as "viviendasCNPV",
                    COALESCE(CAST(SUM(a.upa_13) AS INTEGER), 0) as "upasCNA",
                    COALESCE(CAST(SUM(a.f1_ca_apa) AS INTEGER), 0) as "productores"
                FROM marco_referencial.mr_d_apa a
                JOIN insumos.lim_depto d ON a.cod_depto = d.cod_depto
                WHERE d.id = $1
            `;
        } else if (nivel === 'municipal') {
            query = `
                SELECT 
                    COUNT(DISTINCT a.id_com_area) as comunidades,
                    COALESCE(CAST(SUM(a.total_viv_cpv) AS INTEGER), 0) as "viviendasCPV",
                    COALESCE(CAST(SUM(a.tot_viv_12) AS INTEGER), 0) as "viviendasCNPV",
                    COALESCE(CAST(SUM(a.upa_13) AS INTEGER), 0) as "upasCNA",
                    COALESCE(CAST(SUM(a.f1_ca_apa) AS INTEGER), 0) as "productores"
                FROM marco_referencial.mr_d_apa a
                JOIN insumos.municipios_ds_5050 m 
                  ON a.cod_depto = m.cod_depto AND a.cod_prov = m.cod_prov AND a.cod_mpio = m.cod_mpio
                WHERE m.id_0 = $1
            `;
        } else if (nivel === 'comunidad') {
            query = `
                SELECT 
                    1 as comunidades, 
                    COALESCE(CAST(SUM(a.total_viv_cpv) AS INTEGER), 0) as "viviendasCPV",
                    COALESCE(CAST(SUM(a.tot_viv_12) AS INTEGER), 0) as "viviendasCNPV",
                    COALESCE(CAST(SUM(a.upa_13) AS INTEGER), 0) as "upasCNA",
                    COALESCE(CAST(SUM(a.f1_ca_apa) AS INTEGER), 0) as "productores"
                FROM marco_referencial.mr_d_apa a
                JOIN marco_referencial.mr_comunidades c 
                  ON a.cod_depto = c.cod_depto 
                 AND a.cod_prov = c.cod_prov 
                 AND a.cod_mpio = c.cod_mpio 
                 AND a.id_com_area = c.id_com_area
                WHERE c.id = $1
            `;
        } else {
            return res.status(400).json({ error: 'Nivel no válido' });
        }

        const result = await pool.query(query, [id]);
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error obteniendo estadísticas:', error);
        res.status(500).json({ error: 'Error interno al consultar estadísticas' });
    }
};

exports.getApaComunidad = async (req, res) => {
    const { id } = req.params;

    try {
        const query = `
            SELECT json_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)
            ) as geojson
            FROM (
                SELECT a.geom 
                FROM marco_referencial.mr_d_apa a
                JOIN marco_referencial.mr_comunidades c 
                  ON a.id_com_area = c.id_com_area
                WHERE c.id = $1
            ) as t;
        `;

        const result = await pool.query(query, [id]);
        res.json(result.rows[0].geojson);

    } catch (error) {
        console.error('Error obteniendo el poligono APA:', error);
        res.status(500).json({ error: 'Error interno al consultar el APA de la comunidad' });
    }
};