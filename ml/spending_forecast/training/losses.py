"""Loss functions for spending forecast models."""

import torch
import torch.nn as nn


class GaussianNLLWithClamp(nn.Module):
    """
    Gaussian NLL Loss with variance clamping.

    Prevents numerical instability from very small variances.
    """

    def __init__(self, min_var: float = 1e-6):
        super().__init__()
        self.min_var = min_var
        self.nll = nn.GaussianNLLLoss()

    def forward(
        self,
        mu: torch.Tensor,
        target: torch.Tensor,
        var: torch.Tensor,
    ) -> torch.Tensor:
        var = torch.clamp(var, min=self.min_var)
        return self.nll(mu, target, var)


def get_loss_fn(loss_type: str) -> nn.Module:
    """
    Get loss function by name.

    Args:
        loss_type: "gaussian_nll" or "mse"

    Returns:
        Loss module
    """
    if loss_type == "gaussian_nll":
        return GaussianNLLWithClamp()
    elif loss_type == "mse":
        return nn.MSELoss()
    else:
        raise ValueError(
            f"Unknown loss_type: {loss_type}. Use 'gaussian_nll' or 'mse'."
        )
