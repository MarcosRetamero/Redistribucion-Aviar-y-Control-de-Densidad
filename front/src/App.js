import React, { useState } from "react";
import axios from "axios";
import "./App.css";

const GALPONES = [
  { galpon: "G1", superficie_total: 1400, aves_actuales: 17500 },
  { galpon: "G2", superficie_total: 1000, aves_actuales: 12000 },
  { galpon: "G3", superficie_total: 1400, aves_actuales: 17500 },
  { galpon: "G4", superficie_total: 1800, aves_actuales: 23000 },
];

function App() {
  const [edad, setEdad] = useState(15);
  const [aves, setAves] = useState(70000);
  const [camadaNueva, setCamadaNueva] = useState(false);
  const [editarParametros, setEditarParametros] = useState(false);
  const [parametros, setParametros] = useState({
    rho_min: 7,
    rho_max: 60,
    delta_hot: 1.5,
    delta_cold: 0.6,
  });

  const [galpones, setGalpones] = useState(
    GALPONES.map((g) => ({
      ...g,
      temperatura: 29,
      porcentaje_superficie: 0.8,
    }))
  );

  const [resultados, setResultados] = useState({
    galpones: [],
    movimientos: [],
    costo_total: 0,
  });

  const handleChange = (i, campo, valor) => {
    const nuevos = [...galpones];
    nuevos[i][campo] = parseFloat(valor);
    setGalpones(nuevos);
  };

  const enviar = async () => {
    if (edad < 0 || edad > 100) {
      alert("La edad debe estar entre 0 y 100 días.");
      return;
    }
    if (camadaNueva && (aves < 100 || aves > 140000)) {
      alert("La cantidad total de aves debe estar entre 1.000 y 200.000.");
      return;
    }
    if (parametros.rho_min < 1 || parametros.rho_min >= parametros.rho_max) {
      alert("El valor de rho_min debe ser positivo y menor que rho_max.");
      return;
    }
    if (parametros.rho_max > 100) {
      alert("El valor de rho_max no debería superar 100 aves/m².");
      return;
    }
    if (parametros.delta_hot <= 0 || parametros.delta_cold <= 0) {
      alert("Los coeficientes de penalización deben ser mayores que cero.");
      return;
    }

    try {
      const payload = {
        edad_actual: parseInt(edad),
        ...parametros,
        galpones: galpones.map((g) => ({
          galpon: g.galpon,
          temperatura: g.temperatura,
          porcentaje_superficie: g.porcentaje_superficie,
          superficie_total: g.superficie_total,
          aves_actuales: camadaNueva ? 0 : g.aves_actuales,
        })),
      };
      if (camadaNueva) {
        payload.cantidad_aves = parseInt(aves);
      }
      const res = await axios.post("http://127.0.0.1:8000/optimizar", payload);

      // Validar densidades post-optimización
      const densidadesInvalidas = res.data.galpones.filter((g) => g.densidad_objetivo > parametros.rho_max);
      if (densidadesInvalidas.length > 0) {
        const nombres = densidadesInvalidas.map((g) => g.galpon).join(", ");
        throw new Error(`Densidad excedida en galpon(es): ${nombres}. Por favor, habilite una mayor superficie`);
      }

      setResultados(res.data);
    } catch (err) {
      console.error("Error al optimizar:", err);
      alert(err.message || "Error al optimizar");
    }
  };

  return (
    <div className="App">
      <h1>Optimización de Aves</h1>

      <section className="panel">
        <label>Edad actual (días):</label>
        <input type="number" value={edad} onChange={(e) => setEdad(e.target.value)} />

        <label>
          <input type="checkbox" checked={camadaNueva} onChange={() => setCamadaNueva(!camadaNueva)} />
          Camada nueva
        </label>

        {camadaNueva && (
          <div className="espaciado">
            <label>Cantidad total de aves:</label>
            <input type="number" value={aves} onChange={(e) => setAves(e.target.value)} />
          </div>
        )}
      </section>

      <section className="panel">
        <button onClick={() => setEditarParametros(!editarParametros)}>
          {editarParametros ? "Ocultar parámetros avanzados" : "Mostrar parámetros avanzados"}
        </button>

        {editarParametros && (
          <div className="parametros espaciado">
            {Object.entries(parametros).map(([key, val]) => (
              <div key={key}>
                <label>{key}:</label>
                <input
                  type="number"
                  value={val}
                  step="0.1"
                  onChange={(e) => setParametros({ ...parametros, [key]: parseFloat(e.target.value) })}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="galpones">
        {galpones.map((g, i) => (
          <div key={g.galpon} className="card">
            <h3>{g.galpon}</h3>
            <label>Temperatura: {g.temperatura}°C</label>
            <input type="range" min={20} max={35} step={0.1} value={g.temperatura} onChange={(e) => handleChange(i, "temperatura", e.target.value)} />

            <label>Superficie habilitada: {(g.porcentaje_superficie * 100).toFixed(0)}%</label>
            <input type="range" min={0} max={1} step={0.05} value={g.porcentaje_superficie} onChange={(e) => handleChange(i, "porcentaje_superficie", e.target.value)} />

            {!camadaNueva && (
              <div className="espaciado">
                <label>Aves actuales:</label>
                <input type="number" value={g.aves_actuales} onChange={(e) => handleChange(i, "aves_actuales", e.target.value)} />
              </div>
            )}
          </div>
        ))}
      </section>

      <button className="boton" onClick={enviar}>Optimizar</button>

      {resultados.galpones.length > 0 && (
        <>
          <h3>Galpones</h3>
          <table>
            <thead>
              <tr>
                <th>Galpón</th>
                <th>Superficie total (m²)</th>
                <th>Superficie habilitada (m²)</th>
                <th>% habilitada</th>
                <th>Superficie recomendada (m²)</th>
                <th>% recomendada</th>
              </tr>
            </thead>
            <tbody>
              {resultados.galpones.map((r) => (
                <tr key={r.galpon}>
                  <td>{r.galpon}</td>
                  <td>{r.sup_total}</td>
                  <td>{r.sup_efectiva}</td>
                  <td>{Math.min(Number(r.porcentaje_sup_habilitada), 100)}%</td>
                  <td>{r.sup_recomendada}</td>
                  <td>{Math.min(Number(r.porcentaje_sup_recomendada), 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Redistribución</h3>
          <table>
            <thead>
              <tr>
                <th>Galpón</th>
                <th>Aves actuales</th>
                <th>Densidad actual</th>
                <th>Aves asignadas</th>
                <th>Densidad (asignadas)</th>
                <th>Densidad óptima</th>
              </tr>
            </thead>
            <tbody>
              {resultados.galpones.map((r) => (
                <tr key={r.galpon}>
                  <td>{r.galpon}</td>
                  <td>{r.aves_actuales}</td>
                  <td>{r.densidad_actual}</td>
                  <td>{r.aves_objetivo}</td>
                  <td>{r.densidad_objetivo}</td>
                  <td>{r.rho_opt}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Traslado de las Aves</h3>
          <table>
            <thead>
              <tr>
                <th>Desde</th>
                <th>Hacia</th>
                <th>Cantidad</th>
                <th>Costo unitario</th>
                <th>Costo total</th>
              </tr>
            </thead>
            <tbody>
              {resultados.movimientos.map((m, index) => (
                <tr key={index}>
                  <td>{m.de}</td>
                  <td>{m.a}</td>
                  <td>{m.cantidad}</td>
                  <td>{m.costo_unitario}</td>
                  <td>{m.costo_total}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 style={{ marginTop: 20 }}>
            Costo total de redistribución: {resultados.costo_total}m
          </h4>
        </>
      )}
    </div>
  );
}

export default App;



/*import React, { useState } from "react";
import axios from "axios";
import "./App.css";

const GALPONES = [
  { galpon: "G1", superficie_total: 1400, aves_actuales: 17500 },
  { galpon: "G2", superficie_total: 1000, aves_actuales: 12000 },
  { galpon: "G3", superficie_total: 1400, aves_actuales: 17500 },
  { galpon: "G4", superficie_total: 1800, aves_actuales: 23000 },
];

function App() {
  const [edad, setEdad] = useState(15);
  const [aves, setAves] = useState(70000);
  const [camadaNueva, setCamadaNueva] = useState(false);
  const [editarParametros, setEditarParametros] = useState(false);
  const [parametros, setParametros] = useState({
    rho_min: 7,
    rho_max: 100,
    delta_hot: 1.5,
    delta_cold: 0.6,
  });

  const [galpones, setGalpones] = useState(
    GALPONES.map((g) => ({
      ...g,
      temperatura: 29,
      porcentaje_superficie: 0.8,
    }))
  );

  const [resultados, setResultados] = useState({
    galpones: [],
    movimientos: [],
    costo_total: 0,
  });

  const handleChange = (i, campo, valor) => {
    const nuevos = [...galpones];
    nuevos[i][campo] = parseFloat(valor);
    setGalpones(nuevos);
  };

  const enviar = async () => {
    if (edad < 0 || edad > 100) {
      alert("La edad debe estar entre 0 y 100 días.");
      return;
    }
    if (camadaNueva && (aves < 100 || aves > 140000)) {
      alert("La cantidad total de aves debe estar entre 1.000 y 200.000.");
      return;
    }
    if (parametros.rho_min < 1 || parametros.rho_min >= parametros.rho_max) {
      alert("El valor de rho_min debe ser positivo y menor que rho_max.");
      return;
    }
    if (parametros.rho_max > 100) {
      alert("El valor de rho_max no debería superar 100 aves/m².");
      return;
    }
    if (parametros.delta_hot <= 0 || parametros.delta_cold <= 0) {
      alert("Los coeficientes de penalización deben ser mayores que cero.");
      return;
    }

    try {
      const payload = {
        edad_actual: parseInt(edad),
        ...parametros,
        galpones: galpones.map((g) => ({
          galpon: g.galpon,
          temperatura: g.temperatura,
          porcentaje_superficie: g.porcentaje_superficie,
          superficie_total: g.superficie_total,
          aves_actuales: camadaNueva ? 0 : g.aves_actuales,
        })),
      };
      console.log("Payload:", payload); // 👈 debug visual

      if (camadaNueva) {
        payload.cantidad_aves = parseInt(aves);
      }

      const res = await axios.post("http://127.0.0.1:8000/optimizar", payload);
      setResultados(res.data);
    } catch (err) {
      console.error("Error al optimizar:", err);
      alert("Error al optimizar");
    }
  };

  return (
    <div
      className="App"
      style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}
    >
      <h2>Optimización de Aves por Galpón</h2>
      <div style={{ marginBottom: "10px" }}>
        <label>Edad actual: </label>
        <input
          type="number"
          value={edad}
          onChange={(e) => setEdad(e.target.value)}
          style={{ width: "60px", marginRight: "20px" }}
        />

        <label>
          <input
            type="checkbox"
            checked={camadaNueva}
            onChange={() => setCamadaNueva(!camadaNueva)}
            style={{ marginRight: "5px" }}
          />
          Camada nueva
        </label>

        {camadaNueva && (
          <span style={{ marginLeft: 20 }}>
            <label>Cantidad total de aves: </label>
            <input
              type="number"
              value={aves}
              onChange={(e) => setAves(e.target.value)}
              style={{ width: "100px" }}
            />
          </span>
        )}
      </div>
      <button
        onClick={() => setEditarParametros(!editarParametros)}
        style={{ marginBottom: "10px" }}
      >
        {editarParametros
          ? "Ocultar parámetros avanzados"
          : "Mostrar parámetros avanzados"}
      </button>
      {editarParametros && (
        <div style={{ marginBottom: 20 }}>
          <label>rho_min: </label>
          <input
            type="number"
            step="0.1"
            value={parametros.rho_min}
            onChange={(e) =>
              setParametros({
                ...parametros,
                rho_min: parseFloat(e.target.value),
              })
            }
          />
          <label style={{ marginLeft: 10 }}>rho_max: </label>
          <input
            type="number"
            step="0.1"
            value={parametros.rho_max}
            onChange={(e) =>
              setParametros({
                ...parametros,
                rho_max: parseFloat(e.target.value),
              })
            }
          />
          <label style={{ marginLeft: 10 }}>delta_hot: </label>
          <input
            type="number"
            step="0.1"
            value={parametros.delta_hot}
            onChange={(e) =>
              setParametros({
                ...parametros,
                delta_hot: parseFloat(e.target.value),
              })
            }
          />
          <label style={{ marginLeft: 10 }}>delta_cold: </label>
          <input
            type="number"
            step="0.1"
            value={parametros.delta_cold}
            onChange={(e) =>
              setParametros({
                ...parametros,
                delta_cold: parseFloat(e.target.value),
              })
            }
          />
        </div>
      )}
      <h4>Datos por galpón</h4>
      {galpones.map((g, i) => (
        <div key={g.galpon} style={{ marginBottom: 20 }}>
          <strong>{g.galpon}</strong>

          <div>
            Temperatura: {g.temperatura}°C
            <input
              type="range"
              min={20}
              max={35}
              step={0.1}
              value={g.temperatura}
              onChange={(e) => handleChange(i, "temperatura", e.target.value)}
              style={{ width: "200px", marginLeft: 10 }}
            />
          </div>

          <div>
            % Superficie habilitada:{" "}
            {Math.min(g.porcentaje_superficie * 100, 100).toFixed(0)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={g.porcentaje_superficie > 1 ? 1 : g.porcentaje_superficie}
              onChange={(e) =>
                handleChange(
                  i,
                  "porcentaje_superficie",
                  Math.min(e.target.value, 1)
                )
              }
              style={{ width: "200px", marginLeft: 10 }}
            />
          </div>

          {!camadaNueva && (
            <div>
              Aves actuales:
              <input
                type="number"
                value={g.aves_actuales}
                onChange={(e) =>
                  handleChange(i, "aves_actuales", e.target.value)
                }
                style={{ width: "100px", marginLeft: 10 }}
              />
            </div>
          )}
        </div>
      ))}
      <button
        onClick={enviar}
        style={{ padding: "8px 16px", marginTop: "10px" }}
      >
        Optimizar
      </button>
      {resultados.galpones.length > 0 && (
        <>
          <h3>Galpones</h3>
          <table
            border="1"
            style={{
              margin: "0 auto",
              borderCollapse: "collapse",
              marginBottom: 30,
            }}
          >
            <thead>
              <tr>
                <th>Galpón</th>
                <th>Superficie total (m²)</th>
                <th>Superficie habilitada (m²)</th>
                <th>% habilitada</th>
                <th>Superficie recomendada (m²)</th>
                <th>% recomendada</th>
              </tr>
            </thead>
            <tbody>
              {resultados.galpones.map((r) => (
                <tr key={r.galpon}>
                  <td>{r.galpon}</td>
                  <td>{r.sup_total}</td>
                  <td>{r.sup_efectiva}</td>
                  <td>{Math.min(Number(r.porcentaje_sup_habilitada), 100)}%</td>
                  <td>{r.sup_recomendada}</td>
                  <td>
                    {Math.min(Number(r.porcentaje_sup_recomendada), 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Redistribución</h3>
          <table
            border="1"
            style={{
              margin: "0 auto",
              borderCollapse: "collapse",
              marginBottom: 30,
            }}
          >
            <thead>
              <tr>
                <th>Galpón</th>
                <th>Aves actuales</th>
                <th>Densidad actual</th>
                <th>Aves asignadas</th>
                <th>Densidad (asignadas)</th>
                <th>Densidad óptima</th>
              </tr>
            </thead>
            <tbody>
              {resultados.galpones.map((r) => (
                <tr key={r.galpon}>
                  <td>{r.galpon}</td>
                  <td>{r.aves_actuales}</td>
                  <td>{r.densidad_actual}</td>
                  <td>{r.aves_objetivo}</td>
                  <td>{r.densidad_objetivo}</td>
                  <td>{r.rho_opt}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3>Traslado de las Aves</h3>
          <table
            border="1"
            style={{ margin: "0 auto", borderCollapse: "collapse" }}
          >
            <thead>
              <tr>
                <th>Desde</th>
                <th>Hacia</th>
                <th>Cantidad</th>
                <th>Costo unitario</th>
                <th>Costo total</th>
              </tr>
            </thead>
            <tbody>
              {resultados.movimientos.map((m, index) => (
                <tr key={index}>
                  <td>{m.de}</td>
                  <td>{m.a}</td>
                  <td>{m.cantidad}</td>
                  <td>{m.costo_unitario}</td>
                  <td>{m.costo_total}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h4 style={{ marginTop: 20 }}>
            Costo total de redistribución: {resultados.costo_total}m
          </h4>
          <div style={{ height: "80px" }} />
        </>
      )}{" "}
    </div>
  );
}

export default App;
*/