"""PyTorch datasets and data loaders."""

from typing import Dict, List, Tuple

import torch
from torch.utils.data import Dataset, DataLoader, random_split

from spending_forecast.config import BATCH_SIZE


class SequenceDataset(Dataset):
    """PyTorch Dataset for spending forecast sequences."""

    def __init__(self, sequences: List[Dict]):
        self.sequences = sequences

    def __len__(self) -> int:
        return len(self.sequences)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        seq = self.sequences[idx]
        return {
            "x_numeric": torch.tensor(seq["x_numeric"], dtype=torch.float32),
            "categories": torch.tensor(seq["categories"], dtype=torch.long),
            "months": torch.tensor(seq["months"], dtype=torch.long),
            "y": torch.tensor(seq["y"], dtype=torch.float32),
        }


def create_dataloaders(
    sequences: List[Dict],
    batch_size: int = BATCH_SIZE,
    train_ratio: float = 0.8,
    shuffle_train: bool = True,
) -> Tuple[DataLoader, DataLoader, List[Dict], List[Dict]]:
    """
    Create train and validation DataLoaders.

    Returns:
    - train_loader: DataLoader for training
    - val_loader: DataLoader for validation
    - train_sequences: List of train sequences (for baseline evaluation)
    - val_sequences: List of validation sequences (for baseline evaluation)
    """
    dataset = SequenceDataset(sequences)

    train_size = int(train_ratio * len(dataset))
    val_size = len(dataset) - train_size

    train_dataset, val_dataset = random_split(dataset, [train_size, val_size])

    # Extract sequences for baseline evaluation
    train_indices = train_dataset.indices
    val_indices = val_dataset.indices

    train_sequences = [sequences[i] for i in train_indices]
    val_sequences = [sequences[i] for i in val_indices]

    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=shuffle_train,
        drop_last=False,
    )

    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        drop_last=False,
    )

    return train_loader, val_loader, train_sequences, val_sequences
