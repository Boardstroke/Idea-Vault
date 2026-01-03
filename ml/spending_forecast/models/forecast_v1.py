import math
from typing import Tuple, Optional

import torch
import torch.nn as nn
import torch.nn.functional as F


class AttentionPooling(nn.Module):
    """Pooling por atenção (retorna (B, d_model))."""

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
        # x: (B, S, D)
        scores = self.attention(x).squeeze(-1)  # (B, S)
        if mask is not None:
            scores = scores.masked_fill(mask == 0, float("-inf"))
        weights = F.softmax(scores, dim=1).unsqueeze(-1)  # (B, S, 1)
        return (x * weights).sum(dim=1)  # (B, D)


class PositionalEncoding(nn.Module):
    """Sinusoidal positional encoding (batch_first)."""

    def __init__(self, d_model: int, max_len: int = 64, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)

        position = torch.arange(max_len).unsqueeze(1)  # (max_len, 1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2) * (-math.log(10000.0) / d_model)
        )

        pe = torch.zeros(1, max_len, d_model)
        pe[0, :, 0::2] = torch.sin(position * div_term)
        pe[0, :, 1::2] = torch.cos(position * div_term)

        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x: (B, S, D)
        x = x + self.pe[:, : x.size(1), :]
        return self.dropout(x)


class SpendingTransformerV1(nn.Module):
    """
    V1: encoder-only + pooling (attention / flatten / cls).
    Retorna variância (positiva) se return_uncertainty=True.
    """

    def __init__(
        self,
        d_model: int = 64,
        nhead: int = 4,
        num_layers: int = 2,
        dim_feedforward: int = 128,
        dropout: float = 0.1,
        seq_len: int = 6,
        pred_len: int = 3,
        n_categories: int = 20,
        pooling_type: str = "attention",  # attention | flatten | cls
    ):
        super().__init__()

        if pooling_type not in {"attention", "flatten", "cls"}:
            raise ValueError(f"Invalid pooling_type: {pooling_type}")

        self.d_model = d_model
        self.seq_len = seq_len
        self.pred_len = pred_len
        self.n_categories = n_categories
        self.pooling_type = pooling_type

        # Embeddings
        self.category_embedding = nn.Embedding(n_categories, d_model // 4)
        self.month_embedding = nn.Embedding(13, d_model // 4)  # 0 padding, 1..12

        # Input projection: 2 num + cat_emb + month_emb
        input_dim = 2 + d_model // 4 + d_model // 4
        self.input_projection = nn.Linear(input_dim, d_model)

        # CLS token
        if pooling_type == "cls":
            self.cls_token = nn.Parameter(torch.zeros(1, 1, d_model))
            nn.init.normal_(self.cls_token, std=0.02)
            max_len = seq_len + 1
        else:
            self.cls_token = None
            max_len = seq_len

        self.pos_encoder = PositionalEncoding(d_model, max_len=max_len, dropout=dropout)

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
        self.layer_norm = nn.LayerNorm(d_model)

        # Pooling
        if pooling_type == "attention":
            self.pooling = AttentionPooling(d_model, dropout=dropout)
            pooled_dim = d_model
        elif pooling_type == "cls":
            self.pooling = None
            pooled_dim = d_model
        else:
            self.pooling = None
            pooled_dim = d_model * seq_len

        # Heads
        self.mean_head = nn.Sequential(
            nn.Linear(pooled_dim, d_model * 2),
            nn.GELU(),
            nn.Dropout(dropout),
            nn.Linear(d_model * 2, pred_len),
        )
        self.var_head = nn.Sequential(
            nn.Linear(pooled_dim, d_model),
            nn.GELU(),
            nn.Linear(d_model, pred_len),
            nn.Softplus(),  # > 0
        )

        self._init_weights()

    def _init_weights(self):
        for p in self.parameters():
            if p.dim() > 1:
                nn.init.xavier_uniform_(p)

    def forward(
        self,
        x: torch.Tensor,  # (B, S, 2)
        categories: torch.Tensor,  # (B, S)
        months: torch.Tensor,  # (B, S)
        return_uncertainty: bool = False,
    ) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        B = x.size(0)

        cat_emb = self.category_embedding(categories)
        month_emb = self.month_embedding(months)

        combined = torch.cat([x, cat_emb, month_emb], dim=-1)
        x_proj = self.input_projection(combined)  # (B, S, D)

        if self.pooling_type == "cls" and self.cls_token is not None:
            cls_tokens = self.cls_token.expand(B, 1, self.d_model)  # (B, 1, D)
            x_proj = torch.cat([cls_tokens, x_proj], dim=1)  # (B, 1+S, D)

        x_pos = self.pos_encoder(x_proj)
        encoded = self.transformer_encoder(x_pos)
        encoded = self.layer_norm(encoded)

        if self.pooling_type == "attention":
            pooled = self.pooling(encoded)  # (B, D)
        elif self.pooling_type == "cls":
            pooled = encoded[:, 0, :]  # (B, D)
        else:
            # flatten: se tiver CLS, remove ele antes
            if encoded.size(1) != self.seq_len:
                encoded = encoded[:, -self.seq_len :, :]
            pooled = encoded.reshape(B, -1)  # (B, S*D)

        mu = self.mean_head(pooled)

        if not return_uncertainty:
            return mu, None

        var = self.var_head(pooled)  # variância positiva
        return mu, var
