from __future__ import annotations

import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.analysis_contracts import build_analysis_contract, build_empty_graph, empty_feature_map
from src.analysis_errors import WalletAnalysisError
from src.database import init_schema, table_counts
from src.predict_wallet import (
    get_feature_store_column_map,
    load_feature_columns,
    load_feature_importance,
    load_model,
)
from src.transaction_scorer import score_transaction
from src.wallet_analysis_service import analyze_wallet
from src.network_summary import build_network_summary

DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]


def _cors_origins() -> list[str]:
    configured = os.getenv("FRONTEND_ORIGINS", "")
    origins = [origin.strip().rstrip("/") for origin in configured.split(",") if origin.strip()]
    return [*DEFAULT_CORS_ORIGINS, *origins]


def _allow_all_cors() -> bool:
    return os.getenv("ALLOW_ALL_CORS", "true").strip().lower() in {"1", "true", "yes", "on"}


def _error_cors_headers() -> dict[str, str]:
    if not _allow_all_cors():
        return {}
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }


app = FastAPI(title="BTC AML Risk API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _allow_all_cors() else _cors_origins(),
    allow_origin_regex=None if _allow_all_cors() else r"https://.*\.vercel\.app",
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class WalletRequest(BaseModel):
    address: str


def _wallet_error_payload(address: str | None, exc: Exception) -> dict:
    feature_columns = load_feature_columns()
    message = str(exc)
    status_code = getattr(exc, "status_code", 500)
    code = getattr(exc, "code", "wallet_analysis_error")
    payload = build_analysis_contract(
        address or "",
        risk_score=0.0,
        risk_label="invalid" if status_code == 400 else "unknown",
        prediction=0,
        feature_source="error",
        features=empty_feature_map(feature_columns),
        feature_importance=[],
        graph=build_empty_graph(address or "", notes=[message]),
        analysis_notes=[message],
        errors=[{"code": code, "message": message}],
    )
    payload["message"] = message
    payload["code"] = code
    return payload


@app.exception_handler(WalletAnalysisError)
async def wallet_analysis_error_handler(request: Request, exc: WalletAnalysisError):
    del request
    payload = _wallet_error_payload(exc.address, exc)
    return JSONResponse(status_code=exc.status_code, content=payload, headers=_error_cors_headers())


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    path = request.url.path
    if path.startswith(("/graph/", "/risk/wallet/", "/api/wallet", "/api/graph", "/predict")):
        payload = _wallet_error_payload(None, exc)
        payload["code"] = "internal_error"
        return JSONResponse(status_code=500, content=payload, headers=_error_cors_headers())

    payload = {"message": str(exc), "code": "internal_error"}
    return JSONResponse(status_code=500, content=payload, headers=_error_cors_headers())


@app.on_event("startup")
def warm_backend_caches():
    try:
        init_schema()
    except Exception:
        pass
    try:
        load_model()
    except Exception:
        pass
    try:
        load_feature_columns()
    except Exception:
        pass
    try:
        load_feature_importance()
    except Exception:
        pass
    try:
        get_feature_store_column_map()
    except Exception:
        pass


@app.get("/health")
def health():
    return {"status": "ok", "database": table_counts()}


@app.get("/graph/{address}")
def graph(address: str):
    return analyze_wallet(address)


@app.get("/risk/wallet/{address}")
def wallet_risk(address: str):
    return analyze_wallet(address)


@app.post("/predict")
def predict(request: WalletRequest):
    return analyze_wallet(request.address)


@app.get("/api/wallet/{address}")
def api_wallet(address: str):
    return analyze_wallet(address)


@app.post("/api/wallet")
def api_wallet_post(request: WalletRequest):
    return analyze_wallet(request.address)


@app.get("/api/graph/{address}")
def api_graph(address: str):
    return analyze_wallet(address)


@app.get("/risk/transaction/{txid}")
def transaction_risk(txid: str):
    try:
        return {"status": "ok", "data": score_transaction(txid)}
    except Exception as exc:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": str(exc), "code": "transaction_risk_error"},
            headers=_error_cors_headers(),
        )


@app.get("/api/transaction/{txid}")
def api_transaction(txid: str):
    try:
        return {"status": "ok", "data": score_transaction(txid)}
    except Exception as exc:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": str(exc), "code": "transaction_risk_error"},
            headers=_error_cors_headers(),
        )


@app.get("/api/network/summary")
def api_network_summary():
    try:
        return {"status": "ok", "data": build_network_summary()}
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "message": str(exc), "code": "network_summary_error"},
            headers=_error_cors_headers(),
        )
