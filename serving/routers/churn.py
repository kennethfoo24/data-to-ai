"""
POST /predict/churn
Loads the Production churn-classifier from MLflow and returns churn probability.
"""
import os
import functools

import mlflow.pytorch
import torch
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

MLFLOW_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")
MODEL_NAME = "churn-classifier"
MODEL_ALIAS = "Production"

# Feature order must match ml/churn/features.py FEATURE_COLS
FEATURE_COLS = [
    "order_count",
    "total_spend",
    "days_since_last_order",
    "return_rate",
    "avg_session_seconds",
]


@functools.lru_cache(maxsize=1)
def _load_model():
    mlflow.set_tracking_uri(MLFLOW_URI)
    model_uri = f"models:/{MODEL_NAME}@{MODEL_ALIAS}"
    model = mlflow.pytorch.load_model(model_uri)
    model.eval()
    return model


class ChurnRequest(BaseModel):
    customer_id: int
    order_count: float = 0.0
    total_spend: float = 0.0
    days_since_last_order: float = 0.0
    return_rate: float = 0.0
    avg_session_seconds: float = 0.0


class ChurnResponse(BaseModel):
    customer_id: int
    churn_probability: float


@router.post("/predict/churn", response_model=ChurnResponse)
def predict_churn(req: ChurnRequest):
    try:
        model = _load_model()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model not available: {e}")

    features = torch.tensor(
        [[getattr(req, col) for col in FEATURE_COLS]],
        dtype=torch.float32,
    )
    with torch.no_grad():
        prob = model(features).item()

    return ChurnResponse(customer_id=req.customer_id, churn_probability=round(prob, 4))
