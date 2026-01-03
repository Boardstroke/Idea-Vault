"""Model checkpointing utilities."""

from pathlib import Path
from typing import Dict, Any, Optional

import torch
import torch.nn as nn


def save_checkpoint(
    model: nn.Module,
    path: Path,
    model_config: Dict[str, Any],
    extra_data: Optional[Dict[str, Any]] = None,
):
    """
    Save model checkpoint.
    
    Args:
        model: PyTorch model
        path: Path to save checkpoint
        model_config: Model configuration dict
        extra_data: Optional extra data (category_mapping, scaler_params, etc.)
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    
    checkpoint = {
        "model_state_dict": model.state_dict(),
        "model_config": model_config,
    }
    
    if extra_data:
        checkpoint.update(extra_data)
    
    torch.save(checkpoint, path)


def load_checkpoint(
    path: Path,
    model: Optional[nn.Module] = None,
    device: Optional[torch.device] = None,
) -> Dict[str, Any]:
    """
    Load model checkpoint.
    
    Args:
        path: Path to checkpoint
        model: Optional model to load weights into
        device: Device to load to
    
    Returns:
        Checkpoint dict with model_config, and optionally model with loaded weights
    """
    device = device or torch.device("cpu")
    checkpoint = torch.load(path, map_location=device)
    
    if model is not None:
        model.load_state_dict(checkpoint["model_state_dict"])
    
    return checkpoint

