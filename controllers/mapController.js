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
                WHERE CAST(cod_depto AS INTEGER) = $1 AND estado = TRUE
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

exports.getPrediosMunicipio = async (req, res) => {
    const { municipio_id } = req.params;
    try {
        const query = `
            SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)) as geojson
            FROM (
                SELECT p.gid as id, p.geom FROM marco_referencial.mr_d_predios p
                JOIN insumos.municipios_ds_5050 m ON p.cod_depto = m.cod_depto AND p.cod_prov = m.cod_prov AND p.cod_mpio = m.cod_mpio
                WHERE m.id_0 = $1
            ) as t;`;
        const result = await pool.query(query, [municipio_id]);
        res.json(result.rows[0].geojson);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
};

exports.getManzanosMunicipio = async (req, res) => {
    const { municipio_id } = req.params;
    try {
        const query = `
            SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)) as geojson
            FROM (
                SELECT p.gid as id, p.orden_manz, p.geom FROM marco_referencial.mr_a_manzanos p
                JOIN insumos.municipios_ds_5050 m ON p.cod_depto = m.cod_depto AND p.cod_prov = m.cod_prov AND p.cod_mpio = m.cod_mpio
                WHERE m.id_0 = $1
            ) as t;`;
        const result = await pool.query(query, [municipio_id]);
        res.json(result.rows[0].geojson);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
};

exports.getPeriurbanoMunicipio = async (req, res) => {
    const { municipio_id } = req.params;
    try {
        const query = `
            SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)) as geojson
            FROM (
                SELECT p.gid as id, p.clas, p.geom FROM marco_referencial.mr_a_periurbano p
                JOIN insumos.municipios_ds_5050 m ON p.cod_depto = m.cod_depto AND p.cod_prov = m.cod_prov AND p.cod_mpio = m.cod_mpio
                WHERE m.id_0 = $1
            ) as t;`;
        const result = await pool.query(query, [municipio_id]);
        res.json(result.rows[0].geojson);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
};

exports.getUpasMunicipio = async (req, res) => {
    const { municipio_id } = req.params;
    try {
        const query = `
            SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)) as geojson
            FROM (
                SELECT p.gid as id, p.geom FROM marco_referencial.mr_a_upa p
                JOIN insumos.municipios_ds_5050 m ON p.cod_depto = m.cod_depto AND p.cod_prov = m.cod_prov AND p.cod_mpio = m.cod_mpio
                WHERE m.id_0 = $1
            ) as t;`;
        const result = await pool.query(query, [municipio_id]);
        res.json(result.rows[0].geojson);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
};

exports.getAreaCensalMunicipio = async (req, res) => {
    const { municipio_id } = req.params;
    try {
        const query = `
            SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)) as geojson
            FROM (
                SELECT p.gid as id, p.areacensal_ca, p.geom FROM marco_referencial.mr_ad_areacensal p
                JOIN insumos.municipios_ds_5050 m ON p.cod_depto = m.cod_depto AND p.cod_prov = m.cod_prov AND p.cod_mpio = m.cod_mpio
                WHERE m.id_0 = $1
            ) as t;`;
        const result = await pool.query(query, [municipio_id]);
        res.json(result.rows[0].geojson);
    } catch (error) { res.status(500).json({ error: 'Error' }); }
};

exports.descargarExcelMunicipalSectores = async (req, res) => {
    const { id } = req.params;

    try {
        const getWhere = (alias) => `
            ${alias}.cod_depto = (SELECT cod_depto FROM insumos.municipios_ds_5050 WHERE id_0 = $1 LIMIT 1)
            AND ${alias}.cod_prov = (SELECT cod_prov FROM insumos.municipios_ds_5050 WHERE id_0 = $1 LIMIT 1)
            AND ${alias}.cod_mpio = (SELECT cod_mpio FROM insumos.municipios_ds_5050 WHERE id_0 = $1 LIMIT 1)
        `;

        const queryDisperso = `
            SELECT p.cod_depto, p.depto, p.cod_prov, p.prov, p.cod_mpio, p.mpio, p.superarea_ca, p.areacensal_ca, p.sector_ca,
                   p.sec_unico_ca, p.cod_cd_com_area, p.ciu_com_area, p.id_ciu_com, p.at_unico_ca, p.at_ca AS area_trabajo, SUM(p.total_viv_cpv) AS total_viv,
                   p.mixto
            FROM marco_referencial.mr_d_predios p
            WHERE ${getWhere('p')}
            GROUP BY p.cod_depto, p.depto, p.cod_prov, p.prov, p.cod_mpio, p.mpio, p.superarea_ca, p.areacensal_ca, p.sector_ca,
                     p.sec_unico_ca, p.cod_cd_com_area, p.ciu_com_area, p.id_ciu_com, p.at_unico_ca, p.at_ca, p.mixto
            ORDER BY p.sec_unico_ca, p.at_unico_ca;
        `;

        const queryAmanzanado = `
            SELECT m.cod_depto, m.depto, m.cod_prov, m.prov, m.cod_mpio, m.mpio, m.superarea_ca, m.areacensal_ca, m.sector_ca, m.sec_unico_ca,
                   m.cod_cd_com, m.ciu_com, m.id_ciu_com, m.id_manz, m.orden_manz, m.at_unico_ca, m.at_ca AS area_trabajo, SUM(m.total_viv_cpv) AS total_viv, m.mixto,
                   COALESCE(u.cant_upa, 0) AS cant_upa
            FROM marco_referencial.mr_a_manzanos AS m
                     LEFT JOIN (
                SELECT id_manz, COUNT(*) AS cant_upa
                FROM marco_referencial.mr_a_upa
                GROUP BY id_manz
            ) u ON m.id_manz = u.id_manz
            WHERE ${getWhere('m')}
            GROUP BY m.cod_depto, m.depto, m.cod_prov, m.prov, m.cod_mpio, m.mpio, m.superarea_ca, m.areacensal_ca, m.sector_ca, m.sec_unico_ca,
                     m.cod_cd_com, m.ciu_com, m.id_ciu_com, m.id_manz, m.orden_manz, m.at_unico_ca, m.at_ca, m.mixto, u.cant_upa
            ORDER BY m.sec_unico_ca, m.cod_cd_com;
        `;

        const queryComunidades = `
            SELECT
                apa.depto            AS departamento,
                apa.mpio             AS municipio,
                apa.codigo_mpio,
                apa.cod_cd_com_area,
                apa.id_com_area,
                apa.ciu_com_area,
                apa.tipo_area,
                apa.categoria,
                apa.id_com_12,
                apa.id_com_cna13,
                cna.cod_ine          AS id_com_cna,
                cna.depto_esta       AS departamento_cna,
                cna.mun_estadi       AS municipio_cna,
                cna.nom_comuni       AS comunidad_cna,
                UPPER(cnpv.idcomunida)  AS id_com_cnpv,
                UPPER(cnpv.departamen)  AS departamento_cnpv,
                UPPER(cnpv.municipio)   AS municipio_cnpv,
                UPPER(cnpv.nombrecomu)  AS comunidad_cnpv
            FROM marco_referencial.mr_d_apa AS apa
                     LEFT JOIN insumos.ca_cna_comunidades_cna_publicacion_nal_primera AS cna
                               ON apa.id_com_12 = cna.cod_ine
                     LEFT JOIN insumos.ca_cnpv_comunidades_cnpv_cna_nal_primera AS cnpv
                               ON apa.id_com_cna13 = cnpv.idcomunida
            WHERE ${getWhere('apa')}
            ORDER BY apa.codigo_mpio, apa.cod_cd_com_area;
        `;

        const [resultDisperso, resultAmanzanado, resultComunidades] = await Promise.all([
            pool.query(queryDisperso, [id]),
            pool.query(queryAmanzanado, [id]),
            pool.query(queryComunidades, [id])
        ]);

        const workbook = new ExcelJS.Workbook();

        const wsDisperso = workbook.addWorksheet('DISPERSO');
        wsDisperso.columns = [
            { header: 'cod_depto', key: 'cod_depto', width: 12 }, { header: 'depto', key: 'depto', width: 18 },
            { header: 'cod_prov', key: 'cod_prov', width: 12 }, { header: 'prov', key: 'prov', width: 25 },
            { header: 'cod_mpio', key: 'cod_mpio', width: 12 }, { header: 'mpio', key: 'mpio', width: 25 },
            { header: 'superarea_ca', key: 'superarea_ca', width: 15 },
            { header: 'areacensal_ca', key: 'areacensal_ca', width: 15 },
            { header: 'sector_ca', key: 'sector_ca', width: 12 },
            { header: 'sec_unico_ca', key: 'sec_unico_ca', width: 16 },
            { header: 'cod_cd_com_area', key: 'cod_cd_com_area', width: 18 },
            { header: 'ciu_com_area', key: 'ciu_com_area', width: 40 },
            { header: 'id_ciu_com', key: 'id_ciu_com', width: 18 },
            { header: 'at_unico_ca', key: 'at_unico_ca', width: 16 },
            { header: 'area_trabajo', key: 'area_trabajo', width: 15 },
            { header: 'total_viv', key: 'total_viv', width: 12 },
            { header: 'mixto', key: 'mixto', width: 10 }
        ];
        wsDisperso.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1976D2' } }; });
        wsDisperso.addRows(resultDisperso.rows);

        const wsAmanzanado = workbook.addWorksheet('AMANZANADO');
        wsAmanzanado.columns = [
            { header: 'cod_depto', key: 'cod_depto', width: 12 }, { header: 'depto', key: 'depto', width: 18 },
            { header: 'cod_prov', key: 'cod_prov', width: 12 }, { header: 'prov', key: 'prov', width: 25 },
            { header: 'cod_mpio', key: 'cod_mpio', width: 12 }, { header: 'mpio', key: 'mpio', width: 25 },
            { header: 'superarea_ca', key: 'superarea_ca', width: 15 },
            { header: 'areacensal_ca', key: 'areacensal_ca', width: 15 },
            { header: 'sector_ca', key: 'sector_ca', width: 12 },
            { header: 'sec_unico_ca', key: 'sec_unico_ca', width: 16 },
            { header: 'cod_cd_com', key: 'cod_cd_com', width: 15 },
            { header: 'ciu_com', key: 'ciu_com', width: 40 },
            { header: 'id_ciu_com', key: 'id_ciu_com', width: 18 },
            { header: 'id_manz', key: 'id_manz', width: 20 },
            { header: 'orden_manz', key: 'orden_manz', width: 15 },
            { header: 'at_unico_ca', key: 'at_unico_ca', width: 16 },
            { header: 'area_trabajo', key: 'area_trabajo', width: 15 },
            { header: 'total_viv', key: 'total_viv', width: 12 },
            { header: 'mixto', key: 'mixto', width: 10 },
            { header: 'cant_upa', key: 'cant_upa', width: 12 }
        ];
        wsAmanzanado.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF388E3C' } }; });
        wsAmanzanado.addRows(resultAmanzanado.rows);

        const wsComunidades = workbook.addWorksheet('DATOS_APA ');
        wsComunidades.columns = [
            { header: 'departamento', key: 'departamento', width: 18 },
            { header: 'municipio', key: 'municipio', width: 25 },
            { header: 'codigo_mpio', key: 'codigo_mpio', width: 15 },
            { header: 'cod_cd_com_area', key: 'cod_cd_com_area', width: 20 },
            { header: 'id_com_area', key: 'id_com_area', width: 20 },
            { header: 'ciu_com_area', key: 'ciu_com_area', width: 40 },
            { header: 'tipo_area', key: 'tipo_area', width: 15 },
            { header: 'categoria', key: 'categoria', width: 15 },
            { header: 'id_com_12', key: 'id_com_12', width: 18 },
            { header: 'id_com_cna13', key: 'id_com_cna13', width: 18 },
            { header: 'id_com_cna', key: 'id_com_cna', width: 18 },
            { header: 'departamento_cna', key: 'departamento_cna', width: 20 },
            { header: 'municipio_cna', key: 'municipio_cna', width: 25 },
            { header: 'comunidad_cna', key: 'comunidad_cna', width: 35 },
            { header: 'id_com_cnpv', key: 'id_com_cnpv', width: 18 },
            { header: 'departamento_cnpv', key: 'departamento_cnpv', width: 20 },
            { header: 'municipio_cnpv', key: 'municipio_cnpv', width: 25 },
            { header: 'comunidad_cnpv', key: 'comunidad_cnpv', width: 35 }
        ];
        wsComunidades.getRow(1).eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8E24AA' } }; });
        wsComunidades.addRows(resultComunidades.rows);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Reporte_Sectores_Mpio_${id}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.error('Error generando Excel Sectores Municipal:', error);
        res.status(500).json({ error: 'Error interno al generar el archivo' });
    }
};

exports.getSuperAreaMunicipio = async (req, res) => {
    const { municipio_id } = req.params;
    try {
        const query = `
            SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)) as geojson
            FROM (
                SELECT p.gid as id, p.superarea_ca, p.geom 
                FROM marco_referencial.mr_ad_super_area p
                JOIN insumos.municipios_ds_5050 m ON p.cod_depto = m.cod_depto AND p.cod_prov = m.cod_prov AND p.cod_mpio = m.cod_mpio
                WHERE m.id_0 = $1
            ) as t;`;
        const result = await pool.query(query, [municipio_id]);
        res.json(result.rows[0].geojson);
    } catch (error) {
        console.error('Error en getSuperAreaMunicipio:', error);
        res.status(500).json({ error: 'Error interno de base de datos' });
    }
};

exports.getAreaTrabajoMunicipio = async (req, res) => {
    const { municipio_id } = req.params;
    try {
        const query = `
            SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(ST_AsGeoJSON(t.*)::json), '[]'::json)) as geojson
            FROM (
                SELECT p.gid as id, p.at_ca, p.geom 
                FROM marco_referencial.mr_ad_area_trabajo p
                JOIN insumos.municipios_ds_5050 m ON p.cod_depto = m.cod_depto AND p.cod_prov = m.cod_prov AND p.cod_mpio = m.cod_mpio
                WHERE m.id_0 = $1
            ) as t;`;
        const result = await pool.query(query, [municipio_id]);
        res.json(result.rows[0].geojson);
    } catch (error) {
        console.error('Error en getAreaTrabajoMunicipio:', error);
        res.status(500).json({ error: 'Error interno de base de datos' });
    }
};