"""Device selection utilities."""

import torch


def get_device(device_str: str = None) -> torch.device:
    """
    Get PyTorch device.
    
    Args:
        device_str: Optional device string ("cpu", "cuda", "cuda:0", etc.)
    
    Returns:
        torch.device
    """
    if device_str:
        return torch.device(device_str)
    
    if torch.cuda.is_available():
        return torch.device("cuda")
    
    # Check for MPS (Apple Silicon)
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return torch.device("mps")
    
    return torch.device("cpu")

