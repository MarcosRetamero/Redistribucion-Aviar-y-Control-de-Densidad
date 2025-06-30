# prender con: python -m uvicorn backend:app --reload
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Optional
import pulp
import pandas as pd
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Parámetros constantes ----------
SUPERFICIES = {
    "G1": 1400,
    "G2": 1000,
    "G3": 1400,
    "G4": 1800
}

MATRIZ_COSTOS = pd.DataFrame([
    [0,   50, 100, 145],
    [50,   0,  50,  95],
    [100, 50,   0,  45],
    [145, 95,  45,   0]
], index=["G1", "G2", "G3", "G4"], columns=["G1", "G2", "G3", "G4"])

# ---------- Funciones auxiliares ----------
def T_opt(a):
    if 0 <= a <= 3: return 33
    elif 4 <= a <= 6: return 31
    elif 7 <= a <= 9: return 29
    elif 10 <= a <= 13: return 27
    elif 14 <= a <= 17: return 26
    elif 18 <= a <= 21: return 25
    elif 22 <= a <= 27: return 23
    elif 28 <= a <= 33: return 22
    elif 34 <= a <= 50: return 21
    return 21

def rho_base(a):
    if 0 <= a <= 3: return 40
    elif 4 <= a <= 6: return 35
    elif 7 <= a <= 9: return 30
    elif 10 <= a <= 13: return 25
    elif 14 <= a <= 17: return 22
    elif 18 <= a <= 21: return 20
    elif 22 <= a <= 27: return 18
    elif 28 <= a <= 33: return 16
    elif 34 <= a <= 50: return 12
    return 12


class GalponInput(BaseModel):
    galpon: str
    temperatura: float
    porcentaje_superficie: float
    superficie_total: Optional[float] = None  
    aves_actuales: Optional[int] = 0


class OptimizacionRequest(BaseModel):
    edad_actual: int
    delta_hot: float
    delta_cold: float
    rho_min: float
    rho_max: float
    cantidad_aves: Optional[int] = None
    galpones: List[GalponInput]




@app.post("/optimizar")
def optimizar(data: OptimizacionRequest):
    print("Recibida solicitud:", data)
    edad = data.edad_actual
    T_ideal = T_opt(edad)
    rho_b = rho_base(edad)

    claves = [g.galpon for g in data.galpones]
    galpones = {}
    pobl_actual = {}

    for g in data.galpones:
        if g.galpon not in SUPERFICIES:
            continue
        S_total = SUPERFICIES[g.galpon]
        S_eff = g.porcentaje_superficie * S_total
        penal_frio = data.delta_cold * max(0, T_ideal - g.temperatura)
        penal_calor = data.delta_hot * max(0, g.temperatura - T_ideal)
        rho_opt = min(data.rho_max, max(data.rho_min, rho_b - penal_calor + penal_frio))

        galpones[g.galpon] = {
            "S": S_total,
            "alpha": g.porcentaje_superficie,
            "T": g.temperatura,
            "S_eff": S_eff,
            "rho_opt": rho_opt,
            "penal_frio": penal_frio,
            "penal_calor": penal_calor
        }
        pobl_actual[g.galpon] = g.aves_actuales or 0

    es_camada_nueva = all(v == 0 for v in pobl_actual.values())
    N_total = data.cantidad_aves if es_camada_nueva else sum(pobl_actual.values())

    # ---------- ETAPA 1 
    model1 = pulp.LpProblem("Distribucion_Aves", pulp.LpMinimize)
    x, Delta = {}, {}
    Z = pulp.LpVariable("Z", lowBound=0)
    model1 += Z

    for g, datos in galpones.items():
        if datos['S_eff'] == 0: continue
        x[g] = pulp.LpVariable(f"x_{g}", lowBound=0)
        Delta[g] = pulp.LpVariable(f"Delta_{g}", lowBound=0)
        model1 += Delta[g] >= (x[g] / datos['S_eff']) - datos['rho_opt']
        model1 += Delta[g] >= datos['rho_opt'] - (x[g] / datos['S_eff'])
        model1 += x[g] <= datos['S_eff'] * data.rho_max
        model1 += Delta[g] <= Z

    model1 += pulp.lpSum(x[g] for g in x) == N_total
    model1.solve(pulp.PULP_CBC_CMD(msg=0))

    for g in galpones:
        galpones[g]['objetivo'] = round(x[g].varValue) if g in x else 0
        galpones[g]['actual'] = pobl_actual[g]

    # ---------- ETAPA 2 
    movimientos = []
    costo_total = 0
    if not es_camada_nueva:
        costos_df = MATRIZ_COSTOS.loc[claves, claves]
        model2 = pulp.LpProblem("Redistribucion_Aves", pulp.LpMinimize)
        y = pulp.LpVariable.dicts("y", ((i, j) for i in claves for j in claves), lowBound=0, cat='Integer')

        oferta = {g: max(0, galpones[g]['actual'] - galpones[g]['objetivo']) for g in claves}
        demanda = {g: max(0, galpones[g]['objetivo'] - galpones[g]['actual']) for g in claves}

        model2 += pulp.lpSum(costos_df.loc[i, j] * y[i, j] for i in claves for j in claves)
        for i in claves:
            model2 += pulp.lpSum(y[i, j] for j in claves) == oferta[i]
        for j in claves:
            model2 += pulp.lpSum(y[i, j] for i in claves) == demanda[j]

        model2.solve(pulp.PULP_CBC_CMD(msg=0))
        costo_total = pulp.value(model2.objective)

        for (i, j) in y:
            val = y[i, j].varValue
            if val and val > 0:
                costo_unit = float(costos_df.loc[i, j])
                movimientos.append({
                    "de": i,
                    "a": j,
                    "cantidad": int(val),
                    "costo_unitario": costo_unit,
                    "costo_total": float(int(val) * costo_unit)
                })

    # ---------- RESULTADOS ----------
    resultado_galpones = []
    for g in claves:
        d = galpones[g]
        sup_total = d["S"]
        sup_habilitada = d["S_eff"]
        rho_opt = d["rho_opt"]
        aves_actuales = d["actual"]
        aves_objetivo = d["objetivo"]
        dens_actual = aves_actuales / sup_habilitada if sup_habilitada > 0 else None
        dens_objetivo = aves_objetivo / sup_habilitada if sup_habilitada > 0 else None
        sup_recomendada = aves_objetivo / rho_opt if rho_opt > 0 else None
        porcentaje_hab = 100 * sup_habilitada / sup_total
        porcentaje_recomendada = 100 * sup_recomendada / sup_total if sup_recomendada else None

        resultado_galpones.append({
            "galpon": g,
            "sup_total": sup_total,
            "sup_efectiva": round(sup_habilitada, 1),
            "porcentaje_sup_habilitada": round(porcentaje_hab, 1),
            "sup_recomendada": round(sup_recomendada, 1) if sup_recomendada else None,
            "porcentaje_sup_recomendada": round(porcentaje_recomendada, 1) if porcentaje_recomendada else None,
            "rho_opt": round(rho_opt, 2),
            "aves_actuales": aves_actuales,
            "aves_objetivo": aves_objetivo,
            "densidad_actual": round(dens_actual, 2) if dens_actual else None,
            "densidad_objetivo": round(dens_objetivo, 2) if dens_objetivo else None,
            "penal_frio": round(d["penal_frio"], 2),
            "penal_calor": round(d["penal_calor"], 2)
        })

    return {
        "galpones": resultado_galpones,
        "movimientos": movimientos,
        "costo_total": costo_total
    }
