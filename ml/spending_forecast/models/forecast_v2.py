import math
from typing import Tuple, Optional

import torch
import torch.nn as nn


class PositionalEncoding(nn.Module):
    """Sinusoidal positional encoding com offset."""

    def __init__(self, d_model: int, max_len: int = 64, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)

        position = torch.arange(max_len).unsqueeze(1)
        div_term = torch.exp(
            torch.arange(0, d_model, 2) * (-math.log(10000.0) / d_model)
        )

        pe = torch.zeros(1, max_len, d_model)
        pe[0, :, 0::2] = torch.sin(position * div_term)
        pe[0, :, 1::2] = torch.cos(position * div_term)

        self.register_buffer("pe", pe)

    def forward(self, x: torch.Tensor, offset: int = 0) -> torch.Tensor:
        S = x.size(1)
        x = x + self.pe[:, offset : offset + S, :]
        return self.dropout(x)


class LearnablePositionalEncoding(nn.Module):
    """Learnable positional embeddings (melhor adaptação)."""

    def __init__(self, d_model: int, max_len: int = 64, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)
        self.pe = nn.Parameter(torch.zeros(1, max_len, d_model))
        nn.init.normal_(self.pe, std=0.02)

    def forward(self, x: torch.Tensor, offset: int = 0) -> torch.Tensor:
        S = x.size(1)
        x = x + self.pe[:, offset : offset + S, :]
        return self.dropout(x)


class ForecastTransformerV2(nn.Module):
    """
    V2: Forecast query tokens (um token por passo futuro).
    Layout: [history_tokens | forecast_tokens]
    Saída: cada forecast token gera 1 previsão (mu) e 1 variância (var).
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
        use_learnable_pe: bool = True,
        use_causal_history: bool = False,  # opcional/experimental
    ):
        super().__init__()

        self.d_model = d_model
        self.seq_len = seq_len
        self.pred_len = pred_len
        self.n_categories = n_categories
        self.use_causal_history = use_causal_history

        # Embeddings
        self.category_embedding = nn.Embedding(n_categories, d_model // 4)
        self.month_embedding = nn.Embedding(13, d_model // 4)

        input_dim = 2 + d_model // 4 + d_model // 4
        self.input_projection = nn.Linear(input_dim, d_model)

        # Forecast tokens (learnable)
        self.forecast_tokens = nn.Parameter(torch.zeros(1, pred_len, d_model))
        nn.init.normal_(self.forecast_tokens, std=0.02)

        max_len = seq_len + pred_len
        self.pos_encoder = (
            LearnablePositionalEncoding(d_model, max_len=max_len, dropout=dropout)
            if use_learnable_pe
            else PositionalEncoding(d_model, max_len=max_len, dropout=dropout)
        )

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

        self.prediction_head = nn.Linear(d_model, 1)
        self.variance_head = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Linear(d_model // 2, 1),
            nn.Softplus(),
        )

        self._init_weights()

    def _init_weights(self):
        for p in self.parameters():
            if p.dim() > 1 and p is not self.forecast_tokens:
                nn.init.xavier_uniform_(p)

    def _create_attention_mask(self, device: torch.device) -> Optional[torch.Tensor]:
        """
        Máscara (S_total, S_total) com -inf onde não pode atender.
        - Se use_causal_history=True:
          * history: causal dentro do history
          * history não atende forecast
          * forecast atende tudo
        """
        if not self.use_causal_history:
            return None

        total_len = self.seq_len + self.pred_len
        mask = torch.zeros(total_len, total_len, device=device)

        # causal dentro do history
        for i in range(self.seq_len):
            mask[i, i + 1 : self.seq_len] = float("-inf")

        # history não atende forecast
        mask[: self.seq_len, self.seq_len :] = float("-inf")

        return mask

    def forward(
        self,
        x: torch.Tensor,  # (B, S, 2)
        categories: torch.Tensor,  # (B, S)
        months: torch.Tensor,  # (B, S)
        return_uncertainty: bool = False,
    ) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        B = x.size(0)
        device = x.device

        cat_emb = self.category_embedding(categories)
        month_emb = self.month_embedding(months)
        combined = torch.cat([x, cat_emb, month_emb], dim=-1)
        history = self.input_projection(combined)  # (B, S, D)

        history = self.pos_encoder(history, offset=0)

        forecast = self.forecast_tokens.expand(B, -1, -1)  # (B, P, D)
        forecast = self.pos_encoder(forecast, offset=self.seq_len)

        full = torch.cat([history, forecast], dim=1)  # (B, S+P, D)

        attn_mask = self._create_attention_mask(device=device)
        encoded = self.transformer_encoder(full, mask=attn_mask)
        encoded = self.layer_norm(encoded)

        forecast_out = encoded[:, self.seq_len :, :]  # (B, P, D)

        mu = self.prediction_head(forecast_out).squeeze(-1)  # (B, P)

        if not return_uncertainty:
            return mu, None

        var = self.variance_head(forecast_out).squeeze(-1)  # (B, P) > 0
        return mu, var
