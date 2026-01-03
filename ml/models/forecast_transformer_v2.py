"""
Spending Forecast Transformer V2 - PatchTST-inspired Architecture

An improved encoder-only Transformer that uses learnable forecast query tokens
to predict future spending. Similar to PatchTST/Informer concepts but simplified
for our use case.

Key Innovation:
- Instead of flattening or pooling the encoder output, we use learnable
  "forecast tokens" that attend to the historical sequence and directly
  output predictions for each future timestep.

Architecture:
1. Historical tokens: Encoded spending history (6 months)
2. Forecast tokens: 3 learnable query tokens (one per prediction month)
3. Self-attention: All tokens attend to each other
4. Output: Each forecast token produces one prediction

Benefits:
- More interpretable: each forecast token "queries" relevant history
- Better for variable prediction lengths
- Fewer parameters than flatten approach
- Natural uncertainty estimation per timestep
"""

import math
from typing import Tuple, Optional, Dict, Any

import torch
import torch.nn as nn
import torch.nn.functional as F


class PositionalEncoding(nn.Module):
    """Sinusoidal positional encoding."""
    
    def __init__(self, d_model: int, max_len: int = 24, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)
        
        position = torch.arange(max_len).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2) * (-math.log(10000.0) / d_model))
        
        pe = torch.zeros(1, max_len, d_model)
        pe[0, :, 0::2] = torch.sin(position * div_term)
        pe[0, :, 1::2] = torch.cos(position * div_term)
        
        self.register_buffer('pe', pe)
    
    def forward(self, x: torch.Tensor, offset: int = 0) -> torch.Tensor:
        """Add positional encoding with optional offset for forecast tokens."""
        seq_len = x.size(1)
        x = x + self.pe[:, offset:offset + seq_len, :]
        return self.dropout(x)


class LearnablePositionalEncoding(nn.Module):
    """Learnable positional embeddings for better adaptation."""
    
    def __init__(self, d_model: int, max_len: int = 24, dropout: float = 0.1):
        super().__init__()
        self.dropout = nn.Dropout(p=dropout)
        self.pe = nn.Parameter(torch.zeros(1, max_len, d_model))
        nn.init.normal_(self.pe, std=0.02)
    
    def forward(self, x: torch.Tensor, offset: int = 0) -> torch.Tensor:
        seq_len = x.size(1)
        x = x + self.pe[:, offset:offset + seq_len, :]
        return self.dropout(x)


class ForecastTransformerV2(nn.Module):
    """
    Transformer V2 with Forecast Query Tokens.
    
    This architecture uses learnable tokens that "query" the historical
    sequence to make predictions. Each forecast token specializes in
    predicting a specific future timestep.
    
    The model can optionally use a causal mask to prevent history tokens
    from attending to forecast tokens during encoding (experimental).
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
        use_causal_history: bool = False,  # Experimental: causal attention within history
    ):
        super().__init__()
        
        self.d_model = d_model
        self.seq_len = seq_len
        self.pred_len = pred_len
        self.n_categories = n_categories
        self.use_causal_history = use_causal_history
        
        # Embeddings
        self.category_embedding = nn.Embedding(n_categories, d_model // 4)
        self.month_embedding = nn.Embedding(13, d_model // 4)  # 1-12 + padding
        
        # Input projection
        input_dim = 2 + d_model // 4 + d_model // 4  # valor + tendencia + cat_emb + month_emb
        self.input_projection = nn.Linear(input_dim, d_model)
        
        # Learnable forecast query tokens - one per prediction timestep
        self.forecast_tokens = nn.Parameter(torch.zeros(1, pred_len, d_model))
        nn.init.normal_(self.forecast_tokens, std=0.02)
        
        # Positional encoding
        max_len = seq_len + pred_len
        if use_learnable_pe:
            self.pos_encoder = LearnablePositionalEncoding(d_model, max_len=max_len, dropout=dropout)
        else:
            self.pos_encoder = PositionalEncoding(d_model, max_len=max_len, dropout=dropout)
        
        # Transformer encoder
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            batch_first=True,
            activation='gelu'
        )
        self.transformer_encoder = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
        
        # Layer norm
        self.layer_norm = nn.LayerNorm(d_model)
        
        # Output heads - one projection per forecast token
        # Each forecast token produces: (prediction, variance)
        self.prediction_head = nn.Linear(d_model, 1)
        self.variance_head = nn.Sequential(
            nn.Linear(d_model, d_model // 2),
            nn.GELU(),
            nn.Linear(d_model // 2, 1),
            nn.Softplus()
        )
        
        self._init_weights()
    
    def _init_weights(self):
        """Initialize weights."""
        for p in self.parameters():
            if p.dim() > 1 and p is not self.forecast_tokens:
                nn.init.xavier_uniform_(p)
    
    def _create_attention_mask(self, batch_size: int, device: torch.device) -> Optional[torch.Tensor]:
        """
        Create attention mask if using causal history.
        
        Layout: [history_tokens | forecast_tokens]
        - History tokens can attend to all history (or causally)
        - Forecast tokens can attend to all history and all forecast tokens
        """
        if not self.use_causal_history:
            return None
        
        total_len = self.seq_len + self.pred_len
        mask = torch.zeros(total_len, total_len, device=device)
        
        # Causal mask for history tokens
        for i in range(self.seq_len):
            mask[i, i+1:self.seq_len] = float('-inf')
        
        # History tokens cannot attend to forecast tokens
        mask[:self.seq_len, self.seq_len:] = float('-inf')
        
        return mask
    
    def forward(
        self,
        x: torch.Tensor,
        categories: torch.Tensor,
        months: torch.Tensor,
        return_uncertainty: bool = False
    ) -> Tuple[torch.Tensor, Optional[torch.Tensor]]:
        """
        Forward pass with forecast query tokens.
        
        Args:
            x: Numeric features (batch_size, seq_len, 2)
            categories: Category indices (batch_size, seq_len)
            months: Month indices (batch_size, seq_len)
            return_uncertainty: Whether to return variance estimates
        
        Returns:
            predictions: (batch_size, pred_len)
            variance: (batch_size, pred_len) if return_uncertainty else None
        """
        batch_size = x.size(0)
        device = x.device
        
        # Encode history
        cat_emb = self.category_embedding(categories)
        month_emb = self.month_embedding(months)
        combined = torch.cat([x, cat_emb, month_emb], dim=-1)
        history = self.input_projection(combined)  # (batch, seq_len, d_model)
        
        # Add positional encoding to history
        history = self.pos_encoder(history, offset=0)
        
        # Expand forecast tokens for batch
        forecast = self.forecast_tokens.expand(batch_size, -1, -1)  # (batch, pred_len, d_model)
        
        # Add positional encoding to forecast tokens (continuing from history)
        forecast = self.pos_encoder(forecast, offset=self.seq_len)
        
        # Concatenate: [history | forecast_queries]
        full_sequence = torch.cat([history, forecast], dim=1)  # (batch, seq_len + pred_len, d_model)
        
        # Create attention mask if needed
        attn_mask = self._create_attention_mask(batch_size, device)
        
        # Transform
        encoded = self.transformer_encoder(full_sequence, mask=attn_mask)
        encoded = self.layer_norm(encoded)
        
        # Extract forecast token outputs
        forecast_outputs = encoded[:, self.seq_len:, :]  # (batch, pred_len, d_model)
        
        # Generate predictions from each forecast token
        predictions = self.prediction_head(forecast_outputs).squeeze(-1)  # (batch, pred_len)
        
        variance = None
        if return_uncertainty:
            variance = self.variance_head(forecast_outputs).squeeze(-1)  # (batch, pred_len)
        
        return predictions, variance
    
    def get_attention_weights(
        self,
        x: torch.Tensor,
        categories: torch.Tensor,
        months: torch.Tensor
    ) -> Dict[str, torch.Tensor]:
        """
        Get attention weights for interpretability.
        
        Returns attention from forecast tokens to history tokens,
        showing which historical months influenced each prediction.
        """
        # This would require modifying the transformer to return attention weights
        # For now, this is a placeholder for future implementation
        raise NotImplementedError(
            "Attention weight extraction requires custom transformer implementation. "
            "Consider using a hook-based approach or manual attention computation."
        )


def create_model_v2(
    n_categories: int = 20,
    seq_len: int = 6,
    pred_len: int = 3,
    d_model: int = 64,
    **kwargs
) -> ForecastTransformerV2:
    """Factory function to create a ForecastTransformerV2 model."""
    return ForecastTransformerV2(
        n_categories=n_categories,
        seq_len=seq_len,
        pred_len=pred_len,
        d_model=d_model,
        **kwargs
    )


if __name__ == "__main__":
    import numpy as np
    
    print("=" * 60)
    print("Testing ForecastTransformerV2 with Forecast Query Tokens")
    print("=" * 60)
    
    # Create model
    model = ForecastTransformerV2(
        n_categories=10,
        seq_len=6,
        pred_len=3,
        d_model=64,
        num_layers=2
    )
    
    params = sum(p.numel() for p in model.parameters())
    print(f"\nModel parameters: {params:,}")
    print(f"Forecast tokens shape: {model.forecast_tokens.shape}")
    
    # Test forward pass
    batch_size = 4
    x = torch.randn(batch_size, 6, 2)
    categories = torch.randint(0, 10, (batch_size, 6))
    months = torch.randint(1, 13, (batch_size, 6))
    
    predictions, variance = model(x, categories, months, return_uncertainty=True)
    
    print(f"\nInput shape: {x.shape}")
    print(f"Predictions shape: {predictions.shape}")
    print(f"Variance shape: {variance.shape}")
    print(f"\nSample predictions: {predictions[0].detach().numpy()}")
    print(f"Sample variance: {variance[0].detach().numpy()}")
    
    # Compare with V1
    print("\n" + "=" * 60)
    print("Comparison with V1 (attention pooling)")
    print("=" * 60)
    
    from forecast_transformer import create_model
    
    model_v1 = create_model(
        n_categories=10,
        seq_len=6,
        pred_len=3,
        d_model=64,
        pooling_type="attention"
    )
    
    params_v1 = sum(p.numel() for p in model_v1.parameters())
    print(f"V1 parameters: {params_v1:,}")
    print(f"V2 parameters: {params:,}")
    print(f"Difference: {params - params_v1:+,} ({(params/params_v1 - 1)*100:+.1f}%)")

