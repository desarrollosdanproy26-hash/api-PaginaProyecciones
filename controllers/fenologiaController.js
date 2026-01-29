const { getConnection, sql } = require('../config/database');

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

/**
 * Obtener módulos por fundo (OPTIMIZADO)
 */
async function getModulosByFundo(req, res) {
  try {
    const { idFundo } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idFundo', sql.Int, idFundo)
      .query(`
        SELECT idModulo, Modulo
        FROM Modulo
        WHERE idFundo = @idFundo
        ORDER BY Modulo
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

/**
 * Obtener turnos por módulo (OPTIMIZADO)
 */
async function getTurnosByModulo(req, res) {
  try {
    const { idModulo } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idModulo', sql.Int, idModulo)
      .query(`
        SELECT idTurno, Turno, SubTurno
        FROM Turno
        WHERE idModulo = @idModulo
        ORDER BY Turno, SubTurno
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

/**
 * Obtener lotes por turno (OPTIMIZADO - SOLO 2 JOINS)
 */
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
          V.SubVariedad,
          T.Densidad,
          T.Vivero,
          T.Nro_Hileras
        FROM Lote L
        INNER JOIN Variedad V ON V.idVariedad = L.idVariedad
        INNER JOIN Turno T ON T.idTurno = L.idTurno
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
 * Obtener datos de fenología por lote (últimas 2 semanas) - OPTIMIZADO
 */
async function getDatosFenologia(req, res) {
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
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Fenologia'
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
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Fenologia' AND YEAR(Fecha) = @maxAnio
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
    
    // PASO 3: Obtener solo los datos necesarios del año máximo y semanas filtradas
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
          TBL.AltPlant as AlturaPlanta,
          TBL.N_bot as Botones,
          TBL.N_Flor as Flores,
          TBL.N_FrtN1 as FrutoNivel1,
          TBL.N_FrtN2 as FrutoNivel2,
          TBL.N_FrtN3 as FrutoNivel3,
          TBL.N_FrtN4 as FrutoNivel4,
          TBL.N_FrtN5 as FrutoNivel5,
          TBL.N_FrtN6 AS FrutoNivel6,
          TBL.N_CDA AS CuajasDañoAlternaria,
          TBL.N_CDP as CuajaDañoProdi,
          TBL.N_CDeforP as CuajaDeforme,
          TBL.N_PC as PreCuajas,
          TBL.LarFru as LargoFruto,
          TBL.AncFru as AnchoFruto,
          TBL.Mad as Maduro,
          TBL.Bif as Bifido
        FROM TBL_ProyeccionesPimiento TBL 
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Usuario U ON U.idUsuario = TBL.idUsuario
        WHERE TBL.idLote = @idLote 
          AND E.Evaluacion = 'Fenologia'
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
    console.error('❌ Error al obtener datos fenología:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * Actualizar registro de fenología (solo última semana)
 */
async function actualizarRegistro(req, res) {
  try {
    const { id } = req.params;
    const datos = req.body;

    const pool = await getConnection();

    // Campos numéricos editables
    const camposEditables = [
      'AlturaPlanta', 'Botones', 'Flores', 'FrutoNivel1', 'FrutoNivel2', 
      'FrutoNivel3', 'FrutoNivel4', 'FrutoNivel5', 'FrutoNivel6',
      'CuajasDañoAlternaria', 'CuajaDañoProdi', 'CuajaDeforme', 'PreCuajas',
      'LargoFruto', 'AnchoFruto', 'Maduro', 'Bifido'
    ];

    // Mapeo de nombres frontend a nombres de BD
    const mapeoColumnas = {
      'AlturaPlanta': 'AltPlant',
      'Botones': 'N_bot',
      'Flores': 'N_Flor',
      'FrutoNivel1': 'N_FrtN1',
      'FrutoNivel2': 'N_FrtN2',
      'FrutoNivel3': 'N_FrtN3',
      'FrutoNivel4': 'N_FrtN4',
      'FrutoNivel5': 'N_FrtN5',
      'FrutoNivel6': 'N_FrtN6',
      'CuajasDañoAlternaria': 'N_CDA',
      'CuajaDañoProdi': 'N_CDP',
      'CuajaDeforme': 'N_CDeforP',
      'PreCuajas': 'N_PC',
      'LargoFruto': 'LarFru',
      'AnchoFruto': 'AncFru',
      'Maduro': 'Mad',
      'Bifido': 'Bif'
    };

    // Construir query UPDATE dinámicamente
    const setClauses = [];
    const request = pool.request();
    request.input('id', sql.Int, id);

    for (const campo of camposEditables) {
      if (datos.hasOwnProperty(campo)) {
        const nombreColumna = mapeoColumnas[campo] || campo;
        setClauses.push(`${nombreColumna} = @${campo}`);
        request.input(campo, sql.Float, datos[campo] || null);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No hay campos para actualizar'
      });
    }

    const query = `
      UPDATE TBL_ProyeccionesPimiento
      SET ${setClauses.join(', ')}
      WHERE idtablamaestra = @id
    `;

    await request.query(query);

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
 * Calcular promedios de campos numéricos
 */
function calcularPromedios(datos) {
  if (datos.length === 0) return {};

  const camposNumericos = [
    'AlturaPlanta', 'Botones', 'Flores', 'FrutoNivel1', 'FrutoNivel2',
    'FrutoNivel3', 'FrutoNivel4', 'FrutoNivel5', 'FrutoNivel6',
    'CuajasDañoAlternaria', 'CuajaDañoProdi', 'CuajaDeforme', 'PreCuajas',
    'LargoFruto', 'AnchoFruto', 'Maduro', 'Bifido'
  ];

  const promedios = {};

  for (const campo of camposNumericos) {
    const valores = datos
      .map(d => d[campo])
      .filter(v => v !== null && v !== undefined && !isNaN(v));
    
    if (valores.length > 0) {
      const suma = valores.reduce((acc, val) => acc + parseFloat(val), 0);
      promedios[campo] = (suma / valores.length).toFixed(2);
    } else {
      promedios[campo] = 0;
    }
  }

  return promedios;
}

/**
 * Obtener promedios a NIVEL TURNO (todos los lotes del turno) - últimas 2 semanas
 */
async function getDatosNivelTurno(req, res) {
  try {
    const { idTurno } = req.params;
    const pool = await getConnection();
    
    // PASO 1: Obtener el año máximo
    const anioResult = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .query(`
        SELECT MAX(YEAR(Fecha)) as MaxAnio
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno AND E.Evaluacion = 'Fenologia'
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
      .input('idTurno', sql.Int, idTurno)
      .input('maxAnio', sql.Int, maxAnio)
      .query(`
        SELECT DISTINCT TOP 2 DATEPART(iso_week, Fecha) as Semana
        FROM TBL_ProyeccionesPimiento TBL
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno AND E.Evaluacion = 'Fenologia' AND YEAR(Fecha) = @maxAnio
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
    
    // PASO 3: Obtener TODOS los datos del turno para calcular promedios
    const result = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .input('maxAnio', sql.Int, maxAnio)
      .input('semana1', sql.Int, ultimaSemana)
      .input('semana2', sql.Int, penultimaSemana)
      .query(`
        SELECT 
          DATEPART(iso_week, TBL.Fecha) as Semana,
          TBL.AltPlant as AlturaPlanta,
          TBL.N_bot as Botones,
          TBL.N_Flor as Flores,
          TBL.N_FrtN1 as FrutoNivel1,
          TBL.N_FrtN2 as FrutoNivel2,
          TBL.N_FrtN3 as FrutoNivel3,
          TBL.N_FrtN4 as FrutoNivel4,
          TBL.N_FrtN5 as FrutoNivel5,
          TBL.N_FrtN6 AS FrutoNivel6,
          TBL.N_CDA AS CuajasDañoAlternaria,
          TBL.N_CDP as CuajaDañoProdi,
          TBL.N_CDeforP as CuajaDeforme,
          TBL.N_PC as PreCuajas,
          TBL.LarFru as LargoFruto,
          TBL.AncFru as AnchoFruto,
          TBL.Mad as Maduro,
          TBL.Bif as Bifido
        FROM TBL_ProyeccionesPimiento TBL 
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        WHERE L.idTurno = @idTurno 
          AND E.Evaluacion = 'Fenologia'
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
    console.error('❌ Error al obtener datos nivel turno:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
/**
 * Obtener promedios a NIVEL LOTE (todas las muestras del lote) - últimas 2 semanas
 */
async function getDatosNivelLote(req, res) {
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
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Fenologia'
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
        WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Fenologia' AND YEAR(Fecha) = @maxAnio
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
          TBL.AltPlant as AlturaPlanta,
          TBL.N_bot as Botones,
          TBL.N_Flor as Flores,
          TBL.N_FrtN1 as FrutoNivel1,
          TBL.N_FrtN2 as FrutoNivel2,
          TBL.N_FrtN3 as FrutoNivel3,
          TBL.N_FrtN4 as FrutoNivel4,
          TBL.N_FrtN5 as FrutoNivel5,
          TBL.N_FrtN6 AS FrutoNivel6,
          TBL.N_CDA AS CuajasDañoAlternaria,
          TBL.N_CDP as CuajaDañoProdi,
          TBL.N_CDeforP as CuajaDeforme,
          TBL.N_PC as PreCuajas,
          TBL.LarFru as LargoFruto,
          TBL.AncFru as AnchoFruto,
          TBL.Mad as Maduro,
          TBL.Bif as Bifido
        FROM TBL_ProyeccionesPimiento TBL 
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE TBL.idLote = @idLote 
          AND E.Evaluacion = 'Fenologia'
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
    console.error('❌ Error al obtener datos nivel lote:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
module.exports = {
  getFundos,
  getModulosByFundo,
  getTurnosByModulo,
  getLotesByTurno,
  getDatosFenologia,
  actualizarRegistro,
  getDatosNivelTurno,
  getDatosNivelLote
};
