"""Training and validation loops."""

from typing import Dict, Optional

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader


def train_one_epoch(
    model: nn.Module,
    dataloader: DataLoader,
    optimizer: torch.optim.Optimizer,
    criterion: nn.Module,
    device: torch.device,
    use_uncertainty: bool = True,
    max_grad_norm: float = 1.0,
) -> float:
    """
    Train model for one epoch.
    
    Returns:
        Average training loss
    """
    model.train()
    losses = []
    
    for batch in dataloader:
        x_numeric = batch["x_numeric"].to(device)
        categories = batch["categories"].to(device)
        months = batch["months"].to(device)
        y = batch["y"].to(device)
        
        optimizer.zero_grad()
        
        if use_uncertainty:
            mu, var = model(x_numeric, categories, months, return_uncertainty=True)
            var = torch.clamp(var, min=1e-6)
            loss = criterion(mu, y, var)
        else:
            mu, _ = model(x_numeric, categories, months, return_uncertainty=False)
            loss = criterion(mu, y)
        
        loss.backward()
        
        if max_grad_norm > 0:
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
        
        optimizer.step()
        losses.append(loss.item())
    
    return float(np.mean(losses))


@torch.no_grad()
def validate_one_epoch(
    model: nn.Module,
    dataloader: DataLoader,
    criterion: nn.Module,
    device: torch.device,
    use_uncertainty: bool = True,
) -> Dict[str, float]:
    """
    Validate model for one epoch.
    
    Returns:
        Dict with 'loss' and optionally other metrics
    """
    model.eval()
    losses = []
    
    all_y_true = []
    all_y_pred = []
    
    for batch in dataloader:
        x_numeric = batch["x_numeric"].to(device)
        categories = batch["categories"].to(device)
        months = batch["months"].to(device)
        y = batch["y"].to(device)
        
        if use_uncertainty:
            mu, var = model(x_numeric, categories, months, return_uncertainty=True)
            var = torch.clamp(var, min=1e-6)
            loss = criterion(mu, y, var)
        else:
            mu, _ = model(x_numeric, categories, months, return_uncertainty=False)
            loss = criterion(mu, y)
        
        losses.append(loss.item())
        all_y_true.append(y.cpu().numpy())
        all_y_pred.append(mu.cpu().numpy())
    
    y_true = np.concatenate(all_y_true, axis=0)
    y_pred = np.concatenate(all_y_pred, axis=0)
    
    # Calculate MAE in normalized space
    mae_norm = float(np.mean(np.abs(y_true - y_pred)))
    
    return {
        "loss": float(np.mean(losses)),
        "mae_norm": mae_norm,
    }

