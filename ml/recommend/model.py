"""
PyTorch matrix factorisation model for product recommendations.
"""
import torch
import torch.nn as nn


class MatrixFactorization(nn.Module):
    """Embedding-based MF: learns latent vectors for customers and products.

    forward() returns predicted rating (scalar per pair).
    """

    def __init__(self, n_customers: int, n_products: int, embedding_dim: int = 32):
        super().__init__()
        self.customer_emb = nn.Embedding(n_customers, embedding_dim)
        self.product_emb = nn.Embedding(n_products, embedding_dim)
        self.customer_bias = nn.Embedding(n_customers, 1)
        self.product_bias = nn.Embedding(n_products, 1)

        nn.init.normal_(self.customer_emb.weight, std=0.01)
        nn.init.normal_(self.product_emb.weight, std=0.01)
        nn.init.zeros_(self.customer_bias.weight)
        nn.init.zeros_(self.product_bias.weight)

    def forward(self, customer_idx: torch.Tensor, product_idx: torch.Tensor) -> torch.Tensor:
        c = self.customer_emb(customer_idx)
        p = self.product_emb(product_idx)
        dot = (c * p).sum(dim=1)
        bias = self.customer_bias(customer_idx).squeeze(1) + self.product_bias(product_idx).squeeze(1)
        return dot + bias

    def top_n(self, customer_idx: int, n: int = 5) -> list[int]:
        """Return top-N product indices by predicted rating."""
        n_products = self.product_emb.weight.shape[0]
        c_idx = torch.tensor([customer_idx] * n_products)
        p_idx = torch.arange(n_products)
        with torch.no_grad():
            scores = self.forward(c_idx, p_idx)
        return scores.topk(n).indices.tolist()
