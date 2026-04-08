"""
Train the product recommender.
Logs 3 experiment runs to MLflow, registers best as 'product-recommender'.

Run directly:  python train.py
Or via Airflow DAG: train_recommend
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import mlflow
import mlflow.pytorch
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from recommend.features import load
from recommend.model import MatrixFactorization

MLFLOW_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")
MODEL_NAME = "product-recommender"

HP_GRID = [
    {"lr": 1e-2, "epochs": 20, "embedding_dim": 16},
    {"lr": 5e-3, "epochs": 30, "embedding_dim": 32},
    {"lr": 1e-3, "epochs": 50, "embedding_dim": 64},
]


def _rmse(model, loader) -> float:
    model.eval()
    total_loss = 0.0
    n = 0
    with torch.no_grad():
        for c_idx, p_idx, ratings in loader:
            preds = model(c_idx, p_idx)
            total_loss += ((preds - ratings) ** 2).sum().item()
            n += len(ratings)
    return (total_loss / max(n, 1)) ** 0.5


def _train_one(hp, df, n_customers, n_products):
    model = MatrixFactorization(
        n_customers=n_customers,
        n_products=n_products,
        embedding_dim=hp["embedding_dim"],
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=hp["lr"])
    criterion = nn.MSELoss()

    c = torch.tensor(df["customer_idx"].values, dtype=torch.long)
    p = torch.tensor(df["product_idx"].values, dtype=torch.long)
    r = torch.tensor(df["rating"].values, dtype=torch.float32)

    loader = DataLoader(TensorDataset(c, p, r), batch_size=256, shuffle=True)

    model.train()
    for _ in range(hp["epochs"]):
        for c_b, p_b, r_b in loader:
            optimizer.zero_grad()
            criterion(model(c_b, p_b), r_b).backward()
            optimizer.step()

    rmse = _rmse(model, loader)
    return rmse, model


def run():
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment("product-recommender")

    df, customer_map, product_map = load()
    n_customers = len(customer_map)
    n_products = len(product_map)

    best_rmse = float("inf")
    best_run_id = None

    for hp in HP_GRID:
        with mlflow.start_run() as run:
            mlflow.log_params(hp)
            mlflow.log_param("n_customers", n_customers)
            mlflow.log_param("n_products", n_products)

            rmse, model = _train_one(hp, df, n_customers, n_products)
            mlflow.log_metric("train_rmse", rmse)

            # Save index maps as artifacts so serving can decode them
            import json, tempfile, pathlib
            with tempfile.TemporaryDirectory() as tmp:
                maps_path = pathlib.Path(tmp) / "index_maps.json"
                maps_path.write_text(json.dumps({
                    "customer_map": {str(k): v for k, v in customer_map.items()},
                    "product_map": {str(k): v for k, v in product_map.items()},
                }))
                mlflow.log_artifact(str(maps_path))

            mlflow.pytorch.log_model(model, artifact_path="model")
            print(f"  run {run.info.run_id[:8]}  rmse={rmse:.4f}  hp={hp}")

            if rmse < best_rmse:
                best_rmse = rmse
                best_run_id = run.info.run_id

    model_uri = f"runs:/{best_run_id}/model"
    mv = mlflow.register_model(model_uri, MODEL_NAME)
    client = mlflow.tracking.MlflowClient()
    client.set_registered_model_alias(MODEL_NAME, "Production", mv.version)
    print(f"Registered {MODEL_NAME} v{mv.version} (RMSE={best_rmse:.4f}) as Production")


if __name__ == "__main__":
    run()
