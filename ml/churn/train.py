"""
Train the churn classifier.
Logs 3 experiment runs with different hyperparameters to MLflow,
then registers the best model as 'churn-classifier' in Model Registry.

Run directly:  python train.py
Or via Airflow DAG: train_churn
"""
import os
import sys

# Allow imports from sibling packages when run from Airflow
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import mlflow
import mlflow.pytorch
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score

from churn.features import load, FEATURE_COLS
from churn.model import ChurnMLP

MLFLOW_URI = os.getenv("MLFLOW_TRACKING_URI", "http://mlflow:5000")
MODEL_NAME = "churn-classifier"

# Hyperparameter grid — 3 runs as per spec
HP_GRID = [
    {"lr": 1e-3, "epochs": 30, "hidden1": 32,  "hidden2": 16},
    {"lr": 5e-4, "epochs": 50, "hidden1": 64,  "hidden2": 32},
    {"lr": 1e-3, "epochs": 50, "hidden1": 128, "hidden2": 64},
]


def _build_tensors(df):
    X = df[FEATURE_COLS].values.astype("float32")
    y = df["churn"].values.astype("float32")

    scaler = StandardScaler()
    X = scaler.fit_transform(X)

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    return (
        torch.tensor(X_train), torch.tensor(y_train),
        torch.tensor(X_val),   torch.tensor(y_val),
        scaler,
    )


def _train_one(hp: dict, X_train, y_train, X_val, y_val) -> tuple[float, "ChurnMLP"]:
    model = ChurnMLP(
        input_dim=len(FEATURE_COLS),
        hidden1=hp["hidden1"],
        hidden2=hp["hidden2"],
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=hp["lr"])
    criterion = nn.BCELoss()

    loader = DataLoader(
        TensorDataset(X_train, y_train),
        batch_size=64, shuffle=True,
    )

    model.train()
    for _ in range(hp["epochs"]):
        for xb, yb in loader:
            optimizer.zero_grad()
            criterion(model(xb), yb).backward()
            optimizer.step()

    model.eval()
    with torch.no_grad():
        preds = model(X_val).numpy()
    auc = roc_auc_score(y_val.numpy(), preds)
    return auc, model


def run():
    mlflow.set_tracking_uri(MLFLOW_URI)
    mlflow.set_experiment("churn-classifier")

    df = load()
    X_train, y_train, X_val, y_val, scaler = _build_tensors(df)

    best_auc = -1.0
    best_run_id = None

    for hp in HP_GRID:
        with mlflow.start_run() as run:
            mlflow.log_params(hp)
            auc, model = _train_one(hp, X_train, y_train, X_val, y_val)
            mlflow.log_metric("val_auc", auc)
            mlflow.pytorch.log_model(model, artifact_path="model")
            print(f"  run {run.info.run_id[:8]}  auc={auc:.4f}  hp={hp}")

            if auc > best_auc:
                best_auc = auc
                best_run_id = run.info.run_id

    # Register best model
    model_uri = f"runs:/{best_run_id}/model"
    mv = mlflow.register_model(model_uri, MODEL_NAME)
    client = mlflow.tracking.MlflowClient()
    client.set_registered_model_alias(MODEL_NAME, "Production", mv.version)
    print(f"Registered {MODEL_NAME} v{mv.version} (AUC={best_auc:.4f}) as Production")


if __name__ == "__main__":
    run()
