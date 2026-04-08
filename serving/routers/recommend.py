"""
POST /predict/recommend
Loads the Production product-recommender from MLflow and returns top-5 product IDs.
"""
import os
import json
import functools

import mlflow
import mlflow.pytorch
import torch
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

MLFLOW_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")
MODEL_NAME = "product-recommender"
MODEL_ALIAS = "Production"
TOP_N = 5


@functools.lru_cache(maxsize=1)
def _load_model_and_maps():
    mlflow.set_tracking_uri(MLFLOW_URI)
    client = mlflow.tracking.MlflowClient()

    mv = client.get_model_version_by_alias(MODEL_NAME, MODEL_ALIAS)
    run_id = mv.run_id

    # Download index_maps.json artifact
    local_dir = mlflow.artifacts.download_artifacts(
        run_id=run_id, artifact_path="index_maps.json"
    )
    with open(local_dir) as f:
        maps = json.load(f)

    customer_map = {int(k): v for k, v in maps["customer_map"].items()}
    product_map = {int(k): v for k, v in maps["product_map"].items()}
    # Reverse product map: index → original product_id
    idx_to_product = {v: k for k, v in product_map.items()}

    model_uri = f"models:/{MODEL_NAME}@{MODEL_ALIAS}"
    model = mlflow.pytorch.load_model(model_uri)
    model.eval()

    return model, customer_map, idx_to_product


class RecommendRequest(BaseModel):
    customer_id: int


class RecommendResponse(BaseModel):
    customer_id: int
    product_ids: list[int]


@router.post("/predict/recommend", response_model=RecommendResponse)
def predict_recommend(req: RecommendRequest):
    try:
        model, customer_map, idx_to_product = _load_model_and_maps()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Model not available: {e}")

    customer_idx = customer_map.get(req.customer_id)
    if customer_idx is None:
        raise HTTPException(
            status_code=404,
            detail=f"customer_id {req.customer_id} not found in training data",
        )

    top_indices = model.top_n(customer_idx, n=TOP_N)
    product_ids = [idx_to_product[i] for i in top_indices if i in idx_to_product]

    return RecommendResponse(customer_id=req.customer_id, product_ids=product_ids)
