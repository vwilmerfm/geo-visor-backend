const pool = require('../config/db');
const ExcelJS = require('exceljs');

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
                    c.ciu_com_area AS nombre, 
                    c.geom 
                FROM marco_referencial.mr_comunidades c
                JOIN insumos.municipios_ds_5050 m 
                  ON c.cod_depto = m.cod_depto 
                 AND c.cod_prov = m.cod_prov 
                 AND c.cod_mpio = m.cod_mpio
                WHERE m.id_0 = $1

                UNION ALL

                SELECT 
                    c.id, 
                    c.ciu_com_area AS nombre, 
                    a.geom 
                FROM marco_referencial.mr_d_apa a
                JOIN marco_referencial.mr_comunidades c 
                  ON a.id_com_area = c.id_com_area
                JOIN insumos.municipios_ds_5050 m 
                  ON a.cod_depto = m.cod_depto 
                 AND a.cod_prov = m.cod_prov 
                 AND a.cod_mpio = m.cod_mpio
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

exports.descargarExcel = async (req, res) => {
    const { nivel, id } = req.query;
    let whereClause = '';

    try {
        if (nivel === 'departamental') {
            whereClause = `a.cod_depto = (SELECT cod_depto FROM insumos.lim_depto WHERE id = $1 LIMIT 1)`;
        } else if (nivel === 'municipal') {
            whereClause = `(a.cod_depto, a.cod_prov, a.cod_mpio) = (SELECT cod_depto, cod_prov, cod_mpio FROM insumos.municipios_ds_5050 WHERE id_0 = $1 LIMIT 1)`;
        } else if (nivel === 'comunidad') {
            whereClause = `a.id_com_area = (SELECT id_com_area FROM marco_referencial.mr_comunidades WHERE id = $1 LIMIT 1)`;
        } else {
            return res.status(400).json({ error: 'Nivel no válido' });
        }

        const query = `
            SELECT
                a.cod_depto, a.depto, a.cod_prov, a.prov, a.cod_mpio, a.mpio,
                a.cod_cd_com_area, a.ciu_com_area AS ciu_com, a.id_com_area, a.tipo_area,
                COALESCE(a.total_viv_cpv, 0) as total_viv_cpv_24,
                COALESCE(a.tot_viv_12, 0) as total_viv_cnpv_12,
                COALESCE(a.upa_13, 0) as total_upa_cna13,
                COALESCE(a.f1_ca_apa, 0) as total_prod_f1
            FROM marco_referencial.mr_d_apa a
            WHERE ${whereClause}
            ORDER BY a.cod_prov, a.cod_mpio, a.id_com_area;
        `;

        const result = await pool.query(query, [id]);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Datos_Censo');

        worksheet.columns = [
            { header: 'cod_depto', key: 'cod_depto', width: 12 },
            { header: 'depto', key: 'depto', width: 20 },
            { header: 'cod_prov', key: 'cod_prov', width: 12 },
            { header: 'prov', key: 'prov', width: 25 },
            { header: 'cod_mpio', key: 'cod_mpio', width: 12 },
            { header: 'mpio', key: 'mpio', width: 25 },
            { header: 'cod_cd_com_area', key: 'cod_cd_com_area', width: 18 },
            { header: 'ciu_com', key: 'ciu_com', width: 35 },
            { header: 'id_com_area', key: 'id_com_area', width: 20 },
            { header: 'tipo_area', key: 'tipo_area', width: 15 },
            { header: 'total_viv_cpv_24', key: 'total_viv_cpv_24', width: 18 },
            { header: 'total_viv_cnpv_12', key: 'total_viv_cnpv_12', width: 18 },
            { header: 'total_upa_cna13', key: 'total_upa_cna13', width: 18 },
            { header: 'total_prod_f1', key: 'total_prod_f1', width: 15 }
        ];

        worksheet.getRow(1).eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF217346' } };
        });

        worksheet.addRows(result.rows);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Reporte_Censo_${nivel}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error generando Excel:', error);
        res.status(500).json({ error: 'Error interno al generar el archivo' });
    }
};

exports.getSectores = async (req, res) => {
    const { id } = req.params;

    console.log("Cargando sectores para la comunidad ID:", id);

    try {
        const query = `
            SELECT json_build_object(
                           'type', 'FeatureCollection',
                           'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)
                   ) as geojson
            FROM (
                     SELECT
                         s.gid as id,
                         s.sector_ca,
                         s.geom
                     FROM marco_referencial.mr_ad_sector s
                              JOIN marco_referencial.mr_comunidades c
                                   ON s.cod_depto = c.cod_depto
                                       AND s.cod_prov = c.cod_prov
                                       AND s.cod_mpio = c.cod_mpio
                              JOIN marco_referencial.mr_d_apa a
                                   ON c.id_com_area = a.id_com_area
                     WHERE c.id = $1 AND ST_Intersects(s.geom, a.geom)
                 ) as t;
        `;

        const result = await pool.query(query, [id]);
        res.json(result.rows[0].geojson);

    } catch (error) {
        console.error('Error obteniendo sectores de la comunidad:', error);
        res.status(500).json({ error: 'Error interno al consultar los sectores' });
    }
};

exports.getSectoresPorMunicipio = async (req, res) => {
    const { municipio_id } = req.params;

    try {
        const query = `
            SELECT json_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)
            ) as geojson
            FROM (
                SELECT 
                    s.gid as id, 
                    s.sector_ca, 
                    s.geom 
                FROM marco_referencial.mr_ad_sector s
                JOIN insumos.municipios_ds_5050 m 
                  ON s.cod_depto = m.cod_depto 
                 AND s.cod_prov = m.cod_prov 
                 AND s.cod_mpio = m.cod_mpio
                WHERE m.id_0 = $1
            ) as t;
        `;

        const result = await pool.query(query, [municipio_id]);
        res.json(result.rows[0].geojson);

    } catch (error) {
        console.error('Error obteniendo sectores del municipio:', error);
        res.status(500).json({ error: 'Error al consultar los sectores municipales' });
    }
};