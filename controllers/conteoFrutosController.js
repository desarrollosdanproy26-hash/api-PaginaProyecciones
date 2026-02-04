const { getConnection, sql } = require('../config/database');

/**
 * Calcular promedios de los datos de conteo
 */
function calcularPromedios(datos) {
  if (!datos || datos.length === 0) return {};

  const campos = [
    'N_Cuajas', 'N_Frtotal', 'N_FrtPerdidos', 'N_FrtVI', 'N_FrtVT',
    'N_FrtM30', 'N_FrtM50', 'N_FrtM75', 'N_FrtVMP30', 'N_FrtVMP50',
    'N_FrtVMP75', 'N_FrtP30', 'N_FrtP50', 'N_FrtP75', 'N_FrtPN',
    'N_FrtNP', 'N_FrtN', 'N_FrtRM', 'N_FrtR', 'N_FrtDS',
    'N_FrtDeshL', 'N_FrtDeforL', 'N_FrtFMD', 'N_FrtDescomp', 'N_FrtPB',
    'N_FrtRL', 'N_FrtRS', 'N_FrtRajMod', 'N_FrtFC', 'N_FrtFQ',
    'N_FrtDP', 'N_FrtDA', 'N_FrtDM', 'N_FrtDC', 'N_FrtDPR',
    'N_FrtDPP', 'N_FrtFV', 'N_FrtDPT', 'N_FrtFA', 'N_FrtTAPR'
  ];

  const promedios = {};
  campos.forEach(campo => {
    const valores = datos.map(d => parseFloat(d[campo]) || 0).filter(v => v !== 0);
    promedios[campo] = valores.length > 0
      ? parseFloat((valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(2))
      : 0;
  });

  return promedios;
}

/**
 * Obtener lista de fundos (OPTIMIZADO - SIN FILTROS)
 */
async function getFundos(req, res) {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT idFundo, Fundo
      FROM Fundo
      ORDER BY Fundo
    `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('❌ Error al obtener fundos:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getModulosByFundo(req, res) {
  try {
    const { idFundo } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idFundo', sql.Int, idFundo)
      .query(`
        SELECT 
          m.idModulo, 
          m.Modulo,
          CASE 
            WHEN EXISTS (
              SELECT 1 
              FROM Turno t
              INNER JOIN Lote l ON l.idTurno = t.idTurno
              INNER JOIN TBL_ProyeccionesPimiento p ON p.idLote = l.idLote
              INNER JOIN Evaluacion e ON e.idEvaluacion = p.IdEvaluacion
              WHERE t.idModulo = m.idModulo 
              AND p.Validacion = 2
              AND e.Evaluacion = 'Conteos'
            ) THEN 'rojo'
            ELSE 'verde'
          END AS Color
        FROM Modulo m
        WHERE m.idFundo = @idFundo
        ORDER BY m.Modulo
      `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('❌ Error al obtener módulos:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getTurnosByModulo(req, res) {
  try {
    const { idModulo } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idModulo', sql.Int, idModulo)
      .query(`
        SELECT 
          t.idTurno, 
          t.Turno, 
          t.SubTurno,
          CASE 
            WHEN EXISTS (
              SELECT 1 
              FROM Lote l
              INNER JOIN TBL_ProyeccionesPimiento p ON p.idLote = l.idLote
              INNER JOIN Evaluacion e ON e.idEvaluacion = p.IdEvaluacion
              WHERE l.idTurno = t.idTurno 
              AND p.Validacion = 2
              AND e.Evaluacion = 'Conteos'
            ) THEN 'rojo'
            ELSE 'verde'
          END AS Color
        FROM Turno t
        WHERE t.idModulo = @idModulo
        ORDER BY t.Turno, t.SubTurno
      `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('❌ Error al obtener turnos:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

async function getLotesByTurno(req, res) {
  try {
    const { idTurno } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .query(`
        SELECT 
          L.idLote, 
          L.Lote,
          V.Variedad,
          CASE 
            WHEN EXISTS (
              SELECT 1 FROM TBL_ProyeccionesPimiento P 
              INNER JOIN Evaluacion E ON E.idEvaluacion = P.IdEvaluacion
              WHERE P.idLote = L.idLote 
              AND P.Validacion = 2
              AND E.Evaluacion = 'Conteos'
            ) THEN 'rojo'
            ELSE 'verde'
          END AS Color
        FROM Lote L
        INNER JOIN Variedad V ON V.idVariedad = L.idVariedad
        WHERE L.idTurno = @idTurno
        ORDER BY L.Lote
      `);

    res.json({
      success: true,
      data: result.recordset
    });
  } catch (err) {
    console.error('❌ Error al obtener lotes:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtener datos de conteo por lote (últimas 2 semanas) - DETALLE
 */
async function getDatosConteo(req, res) {
  try {
    const { idLote } = req.params;
    const pool = await getConnection();
    
    // PASO 1: Obtener el año máximo
    const anioResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .query(`
        SELECT MAX(YEAR(Fecha)) as MaxAnio
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Conteos'
      `);
    
    const maxAnio = anioResult.recordset[0]?.MaxAnio;
    if (!maxAnio) {
      return res.json({
        success: true,
        ultimaSemana: { semana: null, datos: [], promedios: {} },
        penultimaSemana: { semana: null, datos: [], promedios: {} }
      });
    }
    
    // PASO 2: Obtener las últimas 2 semanas del año máximo
    const semanasResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('maxAnio', sql.Int, maxAnio)
      .query(`
        SELECT DISTINCT TOP 2 DATEPART(iso_week, Fecha) as Semana
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Conteos' AND YEAR(Fecha) = @maxAnio
        ORDER BY Semana DESC
      `);
    
    if (semanasResult.recordset.length === 0) {
      return res.json({
        success: true,
        ultimaSemana: { semana: null, datos: [], promedios: {} },
        penultimaSemana: { semana: null, datos: [], promedios: {} }
      });
    }
    
    const semanas = semanasResult.recordset.map(r => r.Semana);
    const ultimaSemana = semanas[0];
    const penultimaSemana = semanas[1] || semanas[0];
    
    // PASO 3: Obtener datos detallados
    const result = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('maxAnio', sql.Int, maxAnio)
      .input('semana1', sql.Int, ultimaSemana)
      .input('semana2', sql.Int, penultimaSemana)
      .query(`
        SELECT 
          TBL.idtablamaestra as id,
          DATEPART(iso_week, TBL.Fecha) as Semana,
          TBL.Fecha,
          TBL.Hora,
          U.Nombre,
          TBL.Muestra,
          TBL.Vivero,
          TBL.Descripcion,
          TBL.CodSubTurno,
          TBL.N_Cuajas,
          TBL.N_Frtotal,
          TBL.N_FrtPerdidos,
          TBL.N_FrtVI,
          TBL.N_FrtVT,
          TBL.N_FrtM30,
          TBL.N_FrtM50,
          TBL.N_FrtM75,
          TBL.N_FrtVMP30,
          TBL.N_FrtVMP50,
          TBL.N_FrtVMP75,
          TBL.N_FrtP30,
          TBL.N_FrtP50,
          TBL.N_FrtP75,
          TBL.N_FrtPN,
          TBL.N_FrtNP,
          TBL.N_FrtN,
          TBL.N_FrtRM,
          TBL.N_FrtR,
          TBL.N_FrtDS,
          TBL.N_FrtDeshL,
          TBL.N_FrtDeforL,
          TBL.N_FrtFMD,
          TBL.N_FrtDescomp,
          TBL.N_FrtPB,
          TBL.N_FrtRL,
          TBL.N_FrtRS,
          TBL.N_FrtRajMod,
          TBL.N_FrtFC,
          TBL.N_FrtFQ,
          TBL.N_FrtDP,
          TBL.N_FrtDA,
          TBL.N_FrtDM,
          TBL.N_FrtDC,
          TBL.N_FrtDPR,
          TBL.N_FrtDPP,
          TBL.N_FrtFV,
          TBL.N_FrtDPT,
          TBL.N_FrtFA,
          TBL.N_FrtTAPR
        FROM TBL_ProyeccionesPimiento TBL 
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Usuario U ON U.idUsuario = TBL.idUsuario
        WHERE TBL.idLote = @idLote 
          AND E.Evaluacion = 'Conteos'
          AND YEAR(TBL.Fecha) = @maxAnio
          AND DATEPART(iso_week, TBL.Fecha) IN (@semana1, @semana2)
          AND TBL.Validacion != 0
        ORDER BY TBL.Fecha DESC, TBL.Hora DESC, TBL.Muestra ASC
      `);
    
    // Separar datos por semana
    const datosUltimaSemana = result.recordset.filter(r => r.Semana === ultimaSemana);
    const datosPenultimaSemana = result.recordset.filter(r => r.Semana === penultimaSemana);
    
    res.json({
      success: true,
      ultimaSemana: {
        semana: ultimaSemana,
        datos: datosUltimaSemana,
        promedios: calcularPromedios(datosUltimaSemana)
      },
      penultimaSemana: {
        semana: penultimaSemana,
        datos: datosPenultimaSemana,
        promedios: calcularPromedios(datosPenultimaSemana)
      }
    });
  } catch (err) {
    console.error('❌ Error al obtener datos conteo:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Actualizar un registro individual
 */
async function actualizarRegistro(req, res) {
  try {
    const { id } = req.params;
    const datos = req.body;
    
    const pool = await getConnection();
    
    // Construir dinámicamente el UPDATE
    const campos = Object.keys(datos).filter(key => key !== 'id');
    const setClauses = campos.map(campo => `${campo} = @${campo}`).join(', ');
    
    const request = pool.request().input('id', sql.Int, id);
    
    campos.forEach(campo => {
      const valor = datos[campo];
      if (typeof valor === 'number') {
        request.input(campo, sql.Float, valor);
      } else if (typeof valor === 'string') {
        request.input(campo, sql.NVarChar, valor);
      }
    });
    
    await request.query(`
      UPDATE TBL_ProyeccionesPimiento 
      SET ${setClauses}
      WHERE idtablamaestra = @id
    `);
    
    res.json({
      success: true,
      message: 'Registro actualizado correctamente'
    });
  } catch (err) {
    console.error('❌ Error al actualizar registro:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtener datos de conteo por turno (últimas 2 semanas)
 */
async function getDatosConteoTurno(req, res) {
  try {
    const { idTurno } = req.params;
    const pool = await getConnection();
    
    // PASO 1: Obtener el año máximo
    const anioResult = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .query(`
        SELECT MAX(YEAR(TBL.Fecha)) as MaxAnio
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno AND E.Evaluacion = 'Conteos'
      `);
    
    const maxAnio = anioResult.recordset[0]?.MaxAnio;
    if (!maxAnio) {
      return res.json({
        success: true,
        ultimaSemana: { semana: null, lotes: [], promedioGeneral: {} },
        penultimaSemana: { semana: null, lotes: [], promedioGeneral: {} }
      });
    }
    
    // PASO 2: Obtener las últimas 2 semanas del año máximo
    const semanasResult = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .input('maxAnio', sql.Int, maxAnio)
      .query(`
        SELECT DISTINCT TOP 2 DATEPART(iso_week, TBL.Fecha) as Semana
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno AND E.Evaluacion = 'Conteos' AND YEAR(TBL.Fecha) = @maxAnio
        ORDER BY Semana DESC
      `);
    
    if (semanasResult.recordset.length === 0) {
      return res.json({
        success: true,
        ultimaSemana: { semana: null, lotes: [], promedioGeneral: {} },
        penultimaSemana: { semana: null, lotes: [], promedioGeneral: {} }
      });
    }
    
    const semanas = semanasResult.recordset.map(r => r.Semana);
    const ultimaSemana = semanas[0];
    const penultimaSemana = semanas[1] || semanas[0];
    
    // PASO 3: Obtener los datos usando el query proporcionado
    const result = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .input('maxAnio', sql.Int, maxAnio)
      .input('semana1', sql.Int, ultimaSemana)
      .input('semana2', sql.Int, penultimaSemana)
      .query(`
        SELECT 
          DATEPART(iso_week, TBL.Fecha) AS Semana,
          TBL.Fecha                    AS Fecha,
          L.idLote                     AS idLote,
          L.Lote                       AS Lote,
          TBL.Vivero                   AS Vivero,
          TBL.Descripcion              AS Descripcion,
          TBL.CodSubTurno              AS CodSubTurno,
          TBL.N_Cuajas                 AS N_Cuajas,
          TBL.N_Frtotal                AS N_Frtotal,
          TBL.N_FrtPerdidos            AS N_FrtPerdidos,
          TBL.N_FrtVI                  AS N_FrtVI,
          TBL.N_FrtVT                  AS N_FrtVT,
          TBL.N_FrtM30                 AS N_FrtM30,
          TBL.N_FrtM50                 AS N_FrtM50,
          TBL.N_FrtM75                 AS N_FrtM75,
          TBL.N_FrtVMP30               AS N_FrtVMP30,
          TBL.N_FrtVMP50               AS N_FrtVMP50,
          TBL.N_FrtVMP75               AS N_FrtVMP75,
          TBL.N_FrtP30                 AS N_FrtP30,
          TBL.N_FrtP50                 AS N_FrtP50,
          TBL.N_FrtP75                 AS N_FrtP75,
          TBL.N_FrtPN                  AS N_FrtPN,
          TBL.N_FrtNP                  AS N_FrtNP,
          TBL.N_FrtN                   AS N_FrtN,
          TBL.N_FrtRM                  AS N_FrtRM,
          TBL.N_FrtR                   AS N_FrtR,
          TBL.N_FrtDS                  AS N_FrtDS,
          TBL.N_FrtDeshL               AS N_FrtDeshL,
          TBL.N_FrtDeforL              AS N_FrtDeforL,
          TBL.N_FrtFMD                 AS N_FrtFMD,
          TBL.N_FrtDescomp             AS N_FrtDescomp,
          TBL.N_FrtPB                  AS N_FrtPB,
          TBL.N_FrtRL                  AS N_FrtRL,
          TBL.N_FrtRS                  AS N_FrtRS,
          TBL.N_FrtRajMod              AS N_FrtRajMod,
          TBL.N_FrtFC                  AS N_FrtFC,
          TBL.N_FrtFQ                  AS N_FrtFQ,
          TBL.N_FrtDP                  AS N_FrtDP,
          TBL.N_FrtDA                  AS N_FrtDA,
          TBL.N_FrtDM                  AS N_FrtDM,
          TBL.N_FrtDC                  AS N_FrtDC,
          TBL.N_FrtDPR                 AS N_FrtDPR,
          TBL.N_FrtDPP                 AS N_FrtDPP,
          TBL.N_FrtFV                  AS N_FrtFV,
          TBL.N_FrtDPT                 AS N_FrtDPT,
          TBL.N_FrtFA                  AS N_FrtFA,
          TBL.N_FrtTAPR                AS N_FrtTAPR
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno
          AND E.Evaluacion = 'Conteos'
          AND YEAR(TBL.Fecha) = @maxAnio
          AND DATEPART(iso_week, TBL.Fecha) IN (@semana1, @semana2)
        ORDER BY L.Lote, DATEPART(iso_week, TBL.Fecha)
      `);
    
    // Separar por semana
    const datosUltimaSemana = result.recordset.filter(r => r.Semana === ultimaSemana);
    const datosPenultimaSemana = result.recordset.filter(r => r.Semana === penultimaSemana);
    
    // Agrupar por lote y calcular promedios
    const agruparPorLote = (datos) => {
      const lotes = {};
      datos.forEach(registro => {
        if (!lotes[registro.idLote]) {
          lotes[registro.idLote] = {
            idLote: registro.idLote,
            Lote: registro.Lote,
            datos: []
          };
        }
        lotes[registro.idLote].datos.push(registro);
      });
      
      // Calcular promedios por lote
      return Object.values(lotes).map(lote => ({
        idLote: lote.idLote,
        Lote: lote.Lote,
        fecha: lote.datos[0]?.Fecha || null,
        promedios: calcularPromedios(lote.datos)
      }));
    };
    
    const lotesPenultimaSemana = agruparPorLote(datosPenultimaSemana);
    const lotesUltimaSemana = agruparPorLote(datosUltimaSemana);
    
    // Calcular promedio GENERAL del turno
    const promedioGeneralPenultima = calcularPromedios(datosPenultimaSemana);
    const promedioGeneralUltima = calcularPromedios(datosUltimaSemana);
    
    res.json({
      success: true,
      ultimaSemana: {
        semana: ultimaSemana,
        lotes: lotesUltimaSemana,
        promedioGeneral: promedioGeneralUltima
      },
      penultimaSemana: {
        semana: penultimaSemana,
        lotes: lotesPenultimaSemana,
        promedioGeneral: promedioGeneralPenultima
      }
    });
  } catch (err) {
    console.error('❌ Error al obtener datos conteo turno:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Obtener promedios a NIVEL LOTE para Conteos (últimas 2 semanas)
 */
async function getDatosConteoLote(req, res) {
  try {
    const { idLote } = req.params;
    const pool = await getConnection();
    
    // PASO 1: Obtener el año máximo
    const anioResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .query(`
        SELECT MAX(YEAR(Fecha)) as MaxAnio
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Conteos'
      `);
    
    const maxAnio = anioResult.recordset[0]?.MaxAnio;
    if (!maxAnio) {
      return res.json({
        success: true,
        ultimaSemana: { semana: null, promedios: {} },
        penultimaSemana: { semana: null, promedios: {} }
      });
    }
    
    // PASO 2: Obtener las últimas 2 semanas del año máximo
    const semanasResult = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('maxAnio', sql.Int, maxAnio)
      .query(`
        SELECT DISTINCT TOP 2 DATEPART(iso_week, Fecha) as Semana
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Conteos' AND YEAR(Fecha) = @maxAnio
        ORDER BY Semana DESC
      `);
    
    if (semanasResult.recordset.length === 0) {
      return res.json({
        success: true,
        ultimaSemana: { semana: null, promedios: {} },
        penultimaSemana: { semana: null, promedios: {} }
      });
    }
    
    const semanas = semanasResult.recordset.map(r => r.Semana);
    const ultimaSemana = semanas[0];
    const penultimaSemana = semanas[1] || semanas[0];
    
    // PASO 3: Obtener TODOS los datos del lote para calcular promedios
    const result = await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('maxAnio', sql.Int, maxAnio)
      .input('semana1', sql.Int, ultimaSemana)
      .input('semana2', sql.Int, penultimaSemana)
      .query(`
        SELECT 
          DATEPART(iso_week, TBL.Fecha) as Semana,
          TBL.Fecha,
          L.Lote,
          TBL.N_Cuajas,
          TBL.N_Frtotal,
          TBL.N_FrtPerdidos,
          TBL.N_FrtVI,
          TBL.N_FrtVT,
          TBL.N_FrtM30,
          TBL.N_FrtM50,
          TBL.N_FrtM75,
          TBL.N_FrtVMP30,
          TBL.N_FrtVMP50,
          TBL.N_FrtVMP75,
          TBL.N_FrtP30,
          TBL.N_FrtP50,
          TBL.N_FrtP75,
          TBL.N_FrtPN,
          TBL.N_FrtNP,
          TBL.N_FrtN,
          TBL.N_FrtRM,
          TBL.N_FrtR,
          TBL.N_FrtDS,
          TBL.N_FrtDeshL,
          TBL.N_FrtDeforL,
          TBL.N_FrtFMD,
          TBL.N_FrtDescomp,
          TBL.N_FrtPB,
          TBL.N_FrtRL,
          TBL.N_FrtRS,
          TBL.N_FrtRajMod,
          TBL.N_FrtFC,
          TBL.N_FrtFQ,
          TBL.N_FrtDP,
          TBL.N_FrtDA,
          TBL.N_FrtDM,
          TBL.N_FrtDC,
          TBL.N_FrtDPR,
          TBL.N_FrtDPP,
          TBL.N_FrtFV,
          TBL.N_FrtDPT,
          TBL.N_FrtFA,
          TBL.N_FrtTAPR
        FROM TBL_ProyeccionesPimiento TBL 
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE TBL.idLote = @idLote 
          AND E.Evaluacion = 'Conteos'
          AND YEAR(TBL.Fecha) = @maxAnio
          AND DATEPART(iso_week, TBL.Fecha) IN (@semana1, @semana2)
      `);
    
    // Separar y calcular promedios por semana
    const datosUltimaSemana = result.recordset.filter(r => r.Semana === ultimaSemana);
    const datosPenultimaSemana = result.recordset.filter(r => r.Semana === penultimaSemana);
    
    res.json({
      success: true,
      ultimaSemana: {
        semana: ultimaSemana,
        promedios: calcularPromedios(datosUltimaSemana)
      },
      penultimaSemana: {
        semana: penultimaSemana,
        promedios: calcularPromedios(datosPenultimaSemana)
      }
    });
  } catch (err) {
    console.error('❌ Error al obtener datos conteo lote:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

async function cambiarValidacionLote(req, res) {
  try {
    const { idLote } = req.params;
    const { validacionNueva } = req.body;
    
    const pool = await getConnection();
    
    await pool.request()
      .input('idLote', sql.Int, idLote)
      .input('validacionNueva', sql.Int, validacionNueva)
      .query(`
        UPDATE TBL_ProyeccionesPimiento
        SET Validacion = @validacionNueva
        WHERE idLote = @idLote 
        AND Validacion = 2
        AND IdEvaluacion = (SELECT idEvaluacion FROM Evaluacion WHERE Evaluacion = 'Conteos')
      `);
    
    res.json({
      success: true,
      message: 'Validación actualizada correctamente'
    });
  } catch (err) {
    console.error('❌ Error al cambiar validación:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  getFundos,
  getModulosByFundo,
  getTurnosByModulo,
  getLotesByTurno,
  getDatosConteo,
  actualizarRegistro,
  getDatosConteoTurno,
  getDatosConteoLote,
  cambiarValidacionLote
};
