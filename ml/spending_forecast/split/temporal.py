from typing import List, Dict, Tuple


def temporal_split_by_target_time(
    sequences: List[Dict],
    cutoff: int,  # exemplo: 202409 (ano_mes)
    val_until: int,  # exemplo: 202412
) -> Tuple[List[Dict], List[Dict]]:
    train_seqs = []
    val_seqs = []
    for s in sequences:
        t = int(s["target_ano_mes"])
        if t <= cutoff:
            train_seqs.append(s)
        elif cutoff < t <= val_until:
            val_seqs.append(s)
    return train_seqs, val_seqs


def make_backtest_folds(
    sequences: List[Dict],
    fold_ranges: List[Tuple[int, int]],  # [(cutoff, val_until), ...]
):
    folds = []
    for cutoff, val_until in fold_ranges:
        tr, va = temporal_split_by_target_time(sequences, cutoff, val_until)
        folds.append({"cutoff": cutoff, "val_until": val_until, "train": tr, "val": va})
    return folds
