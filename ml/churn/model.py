"""
PyTorch binary classifier (MLP) for churn prediction.
"""
import torch
import torch.nn as nn


class ChurnMLP(nn.Module):
    """3-layer MLP: 5 features → 32 → 16 → 1 (sigmoid output)."""

    def __init__(self, input_dim: int = 5, hidden1: int = 32, hidden2: int = 16):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(input_dim, hidden1),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(hidden1, hidden2),
            nn.ReLU(),
            nn.Linear(hidden2, 1),
            nn.Sigmoid(),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x).squeeze(1)
