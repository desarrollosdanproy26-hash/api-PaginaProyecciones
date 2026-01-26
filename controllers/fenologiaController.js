const { getConnection, sql } = require('../config/database');

/**
 * Obtener lista de fundos
 */
async function getFundos(req, res) {
  try {
    const pool = await getConnection();
    const result = await pool.request().query(`
      SELECT DISTINCT F.idFundo, F.Fundo
      FROM Fundo F
      INNER JOIN Modulo M ON M.idFundo = F.idFundo
      INNER JOIN Turno T ON T.idModulo = M.idModulo
      INNER JOIN Lote L ON L.idTurno = T.idTurno
      INNER JOIN TBL_ProyeccionesPimiento TBL ON TBL.idLote = L.idLote
      INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
      WHERE E.Evaluacion = 'Fenologia'
      ORDER BY F.Fundo
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
 * Obtener módulos por fundo
 */
async function getModulosByFundo(req, res) {
  try {
    const { idFundo } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idFundo', sql.Int, idFundo)
      .query(`
        SELECT DISTINCT M.idModulo, M.Modulo
        FROM Modulo M
        INNER JOIN Turno T ON T.idModulo = M.idModulo
        INNER JOIN Lote L ON L.idTurno = T.idTurno
        INNER JOIN TBL_ProyeccionesPimiento TBL ON TBL.idLote = L.idLote
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE M.idFundo = @idFundo AND E.Evaluacion = 'Fenologia'
        ORDER BY M.Modulo
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
 * Obtener turnos por módulo
 */
async function getTurnosByModulo(req, res) {
  try {
    const { idModulo } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idModulo', sql.Int, idModulo)
      .query(`
        SELECT DISTINCT T.idTurno, T.Turno, T.SubTurno
        FROM Turno T
        INNER JOIN Lote L ON L.idTurno = T.idTurno
        INNER JOIN TBL_ProyeccionesPimiento TBL ON TBL.idLote = L.idLote
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE T.idModulo = @idModulo AND E.Evaluacion = 'Fenologia'
        ORDER BY T.Turno, T.SubTurno
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
 * Obtener lotes por turno
 */
async function getLotesByTurno(req, res) {
  try {
    const { idTurno } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idTurno', sql.Int, idTurno)
      .query(`
        SELECT DISTINCT 
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
        INNER JOIN TBL_ProyeccionesPimiento TBL ON TBL.idLote = L.idLote
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        WHERE L.idTurno = @idTurno AND E.Evaluacion = 'Fenologia'
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
 * Obtener datos de fenología por lote (últimas 2 semanas)
 */
async function getDatosFenologia(req, res) {
  try {
    const { idLote } = req.params;
    const pool = await getConnection();
    
    const result = await pool.request()
      .input('idLote', sql.Int, idLote)
      .query(`
        WITH UltimasSemanas AS (
          SELECT DISTINCT TOP 2 DATEPART(iso_week, TBL.Fecha) as Semana
          FROM TBL_ProyeccionesPimiento TBL
          INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
          WHERE TBL.idLote = @idLote AND E.Evaluacion = 'Fenologia'
          ORDER BY Semana DESC
        )
        SELECT 
          TBL.idtablamaestra as id,
          TBL.Campaña,
          V.Variedad,
          V.SubVariedad,
          F.Fundo,
          M.Modulo,
          T.Turno,
          T.SubTurno,
          L.Lote,
          T.Densidad,
          T.Vivero,
          T.Nro_Hileras,
          DATEPART(iso_week, TBL.Fecha) as Semana,
          TBL.Fecha,
          TBL.Hora,
          E.Evaluacion,
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
          TBL.Bif as Bifido,
          TBL.Nivel,
          TBL.Clasificacion
        FROM TBL_ProyeccionesPimiento TBL 
        INNER JOIN Lote L ON L.idLote = TBL.idLote
        INNER JOIN Turno T ON T.idTurno = L.idTurno
        INNER JOIN Modulo M ON M.idModulo = T.idModulo
        INNER JOIN Fundo F ON F.idFundo = M.idFundo
        INNER JOIN Evaluacion E ON E.idEvaluacion = TBL.IdEvaluacion
        INNER JOIN Variedad V ON V.idVariedad = L.idVariedad
        INNER JOIN Usuario U ON U.idUsuario = TBL.idUsuario
        WHERE TBL.idLote = @idLote 
          AND E.Evaluacion = 'Fenologia'
          AND DATEPART(iso_week, TBL.Fecha) IN (SELECT Semana FROM UltimasSemanas)
        ORDER BY TBL.Fecha DESC, TBL.Hora DESC, TBL.Muestra ASC
      `);

    // Separar en penúltima y última semana
    const semanas = [...new Set(result.recordset.map(r => r.Semana))].sort((a, b) => b - a);
    const ultimaSemana = semanas[0];
    const penultimaSemana = semanas[1];

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

module.exports = {
  getFundos,
  getModulosByFundo,
  getTurnosByModulo,
  getLotesByTurno,
  getDatosFenologia,
  actualizarRegistro
};
