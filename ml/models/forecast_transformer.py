"""
Transformer Model for Spending Forecast

A simplified encoder-only Transformer for predicting future monthly spending
based on historical patterns per category.

Input: Sequence of 6 months of spending data
Output: Prediction for next 3 months

Supports multiple pooling strategies:
- flatten: Original approach (seq_len * d_model)
- attention: Learnable attention pooling (more stable, fewer params)
- cls: CLS token approach (similar to BERT)
"""

import math
from typing import Tuple, Optional

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


class AttentionPooling(nn.Module):
    """
    Attention-based pooling layer.

    Learns to weight different timesteps based on their importance,
    producing a fixed-size representation regardless of sequence length.
    More stable and has fewer parameters than flattening.
    """

    def __init__(self, d_model: int, dropout: float = 0.1):
        super().__init__()
        self.attention = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.Tanh(),
            nn.Linear(d_model // 2, 1),
            nn.Dropout(dropout),
        )

    def forward(
        self, x: torch.Tensor, mask: Optional[torch.Tensor] = None
    ) -> torch.Tensor:
        """
        Args:
            x: Input tensor of shape (batch_size, seq_len, d_model)
            mask: Optional mask for padding (batch_size, seq_len)

        Returns:
            Pooled tensor of shape (batch_size, d_model)
        """
        # Compute attention scores
        scores = self.attention(x).squeeze(-1)  # (batch, seq_len)

        if mask is not None:
            scores = scores.masked_fill(mask == 0, float("-inf"))

        weights = F.softmax(scores, dim=1).unsqueeze(-1)  # (batch, seq_len, 1)

        # Weighted sum
        pooled = (x * weights).sum(dim=1)  # (batch, d_model)

        return pooled


class PositionalEncoding(nn.Module):
    """
    Positional encoding for capturing temporal patterns in time series.
    Adds sinusoidal position information to the input embeddings.
    """

    def __init__(self, d_model: int, max_len: int = 24, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)

        # Create positional encoding matrix
        position = torch.arange(max_len).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2) * (-math.log(10000.0) / d_model)
        )

        pe = torch.zeros(1, max_len, d_model)
        pe[0, :, 0::2] = torch.sin(position * div_term)
        pe[0, :, 1::2] = torch.cos(position * div_term)

        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: Tensor of shape (batch_size, seq_len, d_model)
        Returns:
            Tensor with positional encoding added
        """
        x = x + self.pe[:, : x.size(1), :]
        return self.dropout(x)


class SpendingTransformer(nn.Module):
    """
    Transformer model for spending prediction.

    Architecture:
    - Input projection to d_model dimensions
    - Positional encoding for temporal information
    - Encoder-only transformer layers
    - Configurable pooling (attention/flatten/cls)
    - Output projection for multi-step prediction

    The model predicts spending for multiple future months given
    a historical sequence of monthly spending data.

    Pooling Types:
    - flatten: Concatenate all timesteps (original, most parameters)
    - attention: Learnable attention pooling (recommended, stable)
    - cls: CLS token prepended to sequence (BERT-style)
    """

    def __init__(
        self,
        n_features: int = 4,  # [valor_total, categoria_id, mes, tendencia]
        d_model: int = 64,  # Model dimension
        nhead: int = 4,  # Number of attention heads
        num_layers: int = 2,  # Number of transformer layers
        dim_feedforward: int = 128,  # Feedforward network dimension
        dropout: float = 0.1,  # Dropout rate
        seq_len: int = 6,  # Input sequence length (months)
        pred_len: int = 3,  # Prediction length (months)
        n_categories: int = 20,  # Number of spending categories
        pooling_type: str = "attention",  # "attention", "flatten", "cls"
    ):
        super().__init__()

        self.n_features = n_features
        self.d_model = d_model
        self.seq_len = seq_len
        self.pred_len = pred_len
        self.n_categories = n_categories
        self.pooling_type = pooling_type

        # Category embedding
        self.category_embedding = nn.Embedding(n_categories, d_model // 4)

        # Month embedding (1-12)
        self.month_embedding = nn.Embedding(13, d_model // 4)  # 0 for padding

        # Input projection (valor + tendencia + embeddings)
        # 2 numeric features + d_model//4 (category) + d_model//4 (month)
        input_dim = 2 + d_model // 4 + d_model // 4
        self.input_projection = nn.Linear(input_dim, d_model)

        # CLS token for cls pooling
        if pooling_type == "cls":
            self.cls_token = nn.Parameter(torch.zeros(1, 1, d_model))
            nn.init.normal_(self.cls_token, std=0.02)
            max_len = seq_len + pred_len + 1  # +1 for CLS
        else:
            self.cls_token = None
            max_len = seq_len + pred_len

        # Positional encoding
        self.pos_encoder = PositionalEncoding(d_model, max_len=max_len, dropout=dropout)

        # Transformer encoder layers
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            batch_first=True,
            activation="gelu",
        )
        self.transformer_encoder = nn.TransformerEncoder(
            encoder_layer, num_layers=num_layers
        )

        # Layer normalization
        self.layer_norm = nn.LayerNorm(d_model)

        # Pooling layer
        if pooling_type == "attention":
            self.pooling = AttentionPooling(d_model, dropout=dropout)
            pooled_dim = d_model
        elif pooling_type == "cls":
            self.pooling = None  # Use CLS token directly
            pooled_dim = d_model
        else:  # flatten
            self.pooling = None
            pooled_dim = d_model * seq_len

        # Output projection for multi-step prediction
        self.output_projection = nn.Sequential(
            nn.Linear(pooled_dim, d_model * 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model * 2, pred_len),
        )

        # Uncertainty estimation (for confidence intervals)
        self.uncertainty_head = nn.Sequential(
            nn.Linear(pooled_dim, d_model),
            nn.GELU(),
            nn.Linear(d_model, pred_len),
            nn.Softplus(),  # Ensures positive variance
        )

        self._init_weights()

    def _init_weights(self):
        """Initialize weights with Xavier uniform."""
        for p in self.parameters():
            if p.dim() > 1:
                nn.init.xavier_uniform_(p)

    def forward(
        self,
        x: torch.Tensor,
        categories: torch.Tensor,
        months: torch.Tensor,
        return_uncertainty: bool = False,
    ) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        """
        Forward pass for spending prediction.

        Args:
            x: Numeric features (batch_size, seq_len, 2) - [valor_total, tendencia]
            categories: Category indices (batch_size, seq_len)
            months: Month indices (batch_size, seq_len)
            return_uncertainty: Whether to return uncertainty estimates

        Returns:
            predictions: (batch_size, pred_len) - predicted spending
            uncertainty: (batch_size, pred_len) - uncertainty (variance) if requested
        """
        batch_size = x.size(0)

        # Get embeddings
        cat_emb = self.category_embedding(categories)  # (batch, seq_len, d_model//4)
        month_emb = self.month_embedding(months)  # (batch, seq_len, d_model//4)

        # Concatenate features
        combined = torch.cat(
            [x, cat_emb, month_emb], dim=-1
        )  # (batch, seq_len, input_dim)

        # Project to model dimension
        x_proj = self.input_projection(combined)  # (batch, seq_len, d_model)

        # Prepend CLS token if using cls pooling
        if self.pooling_type == "cls" and self.cls_token is not None:
            cls_tokens = self.cls_token.expand(batch_size, -1, -1)
            x_proj = torch.cat(
                [cls_tokens, x_proj], dim=1
            )  # (batch, 1 + seq_len, d_model)

        # Add positional encoding
        x_pos = self.pos_encoder(x_proj)

        # Transform through encoder
        encoded = self.transformer_encoder(x_pos)  # (batch, seq_len, d_model)

        # Apply layer norm
        encoded = self.layer_norm(encoded)

        # Apply pooling strategy
        if self.pooling_type == "attention":
            pooled = self.pooling(encoded)  # (batch, d_model)
        elif self.pooling_type == "cls":
            pooled = encoded[:, 0, :]  # Take CLS token output (batch, d_model)
        else:  # flatten
            pooled = encoded.view(batch_size, -1)  # (batch, seq_len * d_model)

        # Predict future values
        predictions = self.output_projection(pooled)  # (batch, pred_len)

        uncertainty = None
        if return_uncertainty:
            uncertainty = self.uncertainty_head(pooled)  # (batch, pred_len)

        return predictions, uncertainty


class ForecastDataset(torch.utils.data.Dataset):
    """
    Dataset for spending forecast training.

    Expects data in format:
    - valor_total: Monthly total spending
    - categoria_id: Category index
    - mes: Month (1-12)
    - tendencia: Trend value (e.g., moving average diff)
    """

    def __init__(
        self,
        data,  # pd.DataFrame - type hint omitted to avoid import
        seq_len: int = 6,
        pred_len: int = 3,
        value_col: str = "valor_total",
        category_col: str = "categoria_id",
        month_col: str = "mes",
        trend_col: str = "tendencia",
    ):
        self.seq_len = seq_len
        self.pred_len = pred_len

        # Group by category and create sequences
        self.sequences = []

        for cat_id, group in data.groupby(category_col):
            group = group.sort_values(month_col)

            values = group[value_col].values
            months = group[month_col].values
            trends = (
                group[trend_col].values
                if trend_col in group.columns
                else np.zeros_like(values)
            )

            # Create sliding windows
            for i in range(len(values) - seq_len - pred_len + 1):
                x_values = values[i : i + seq_len]
                x_months = months[i : i + seq_len]
                x_trends = trends[i : i + seq_len]

                y_values = values[i + seq_len : i + seq_len + pred_len]

                self.sequences.append(
                    {
                        "x_numeric": np.stack([x_values, x_trends], axis=-1).astype(
                            np.float32
                        ),
                        "categories": np.full(seq_len, cat_id, dtype=np.int64),
                        "months": x_months.astype(np.int64),
                        "y": y_values.astype(np.float32),
                    }
                )

    def __len__(self) -> int:
        return len(self.sequences)

    def __getitem__(self, idx: int) -> dict:
        seq = self.sequences[idx]
        return {
            "x_numeric": torch.tensor(seq["x_numeric"]),
            "categories": torch.tensor(seq["categories"]),
            "months": torch.tensor(seq["months"]),
            "y": torch.tensor(seq["y"]),
        }


def create_model(
    n_categories: int = 20,
    seq_len: int = 6,
    pred_len: int = 3,
    d_model: int = 64,
    pooling_type: str = "attention",
    **kwargs,
) -> SpendingTransformer:
    """Factory function to create a SpendingTransformer model.

    Args:
        n_categories: Number of spending categories
        seq_len: Input sequence length (months of history)
        pred_len: Prediction length (months to forecast)
        d_model: Model dimension
        pooling_type: Pooling strategy ("attention", "flatten", "cls")
        **kwargs: Additional arguments passed to SpendingTransformer

    Returns:
        Configured SpendingTransformer model
    """
    return SpendingTransformer(
        n_categories=n_categories,
        seq_len=seq_len,
        pred_len=pred_len,
        d_model=d_model,
        pooling_type=pooling_type,
        **kwargs,
    )


if __name__ == "__main__":
    # Quick test of all pooling types
    import numpy as np

    batch_size = 4
    x = torch.randn(batch_size, 6, 2)  # 6 months, 2 numeric features
    categories = torch.randint(0, 10, (batch_size, 6))
    months = torch.randint(1, 13, (batch_size, 6))

    for pooling in ["attention", "flatten", "cls"]:
        print(f"\n{'=' * 50}")
        print(f"Testing pooling_type='{pooling}'")
        print(f"{'=' * 50}")

        model = SpendingTransformer(
            n_categories=10, seq_len=6, pred_len=3, pooling_type=pooling
        )
        params = sum(p.numel() for p in model.parameters())
        print(f"Model parameters: {params:,}")

        predictions, uncertainty = model(x, categories, months, return_uncertainty=True)

        print(f"Input shape: {x.shape}")
        print(f"Predictions shape: {predictions.shape}")
        print(f"Uncertainty shape: {uncertainty.shape}")
        print(f"Sample predictions: {predictions[0].detach().numpy()}")
        print(f"Sample uncertainty: {uncertainty[0].detach().numpy()}")
