from __future__ import annotations

import argparse
from pathlib import Path
import sys

import numpy as np
import pandas as pd

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.feature_builder import LIVE_FEATURE_COLUMNS  # noqa: E402

DATA_DIR = BACKEND_DIR / "data"


def generate(n_rows: int, illicit_share: float, label_noise: float, seed: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Generate a synthetic wallet feature/label dataset shaped like LIVE_FEATURE_COLUMNS.

    Classes are deliberately overlapping (illicit wallets skew toward higher tx volume,
    larger amounts, and shorter block gaps, but with wide, noisy distributions and a
    label-noise flip rate) so a model trained on it reports a believable accuracy
    instead of a trivial 100%. This is NOT a substitute for real labelled wallet data
    (see backend/docs/synthetic-model-validation.md for why it exists and its limits).
    """
    rng = np.random.default_rng(seed)
    n_illicit = int(n_rows * illicit_share)
    n_licit = n_rows - n_illicit

    true_labels = np.array([1] * n_illicit + [2] * n_licit)
    rng.shuffle(true_labels)

    is_illicit = true_labels == 1
    flip_mask = rng.random(n_rows) < label_noise
    labels = np.where(flip_mask, np.where(true_labels == 1, 2, 1), true_labels)

    def lognormal_col(mean_illicit: float, mean_licit: float, sigma: float = 1.3) -> np.ndarray:
        mu = np.where(is_illicit, np.log(mean_illicit), np.log(mean_licit))
        return rng.lognormal(mean=mu, sigma=sigma)

    def poisson_col(lam_illicit: float, lam_licit: float) -> np.ndarray:
        lam = np.where(is_illicit, lam_illicit, lam_licit)
        lam = lam * rng.uniform(0.5, 1.8, n_rows)
        return rng.poisson(lam=np.maximum(lam, 0.1)).astype(float)

    data: dict[str, np.ndarray] = {}
    data["num_txs_as_sender"] = poisson_col(25, 11)
    data["num_txs_as_receiver"] = poisson_col(28, 12)
    data["total_txs"] = data["num_txs_as_sender"] + data["num_txs_as_receiver"] + poisson_col(20, 4)

    data["btc_transacted_total"] = lognormal_col(18, 6)
    data["btc_transacted_mean"] = data["btc_transacted_total"] / np.maximum(data["total_txs"], 1)
    data["btc_transacted_median"] = data["btc_transacted_mean"] * rng.uniform(0.6, 1.0, n_rows)
    data["btc_transacted_min"] = data["btc_transacted_mean"] * rng.uniform(0.01, 0.3, n_rows)
    data["btc_transacted_max"] = data["btc_transacted_mean"] * rng.uniform(2.0, 8.0, n_rows)

    for prefix, total in [("btc_sent", lognormal_col(9, 3)), ("btc_received", lognormal_col(9, 3))]:
        data[f"{prefix}_total"] = total
        denom = np.maximum(
            data["num_txs_as_sender"] if prefix == "btc_sent" else data["num_txs_as_receiver"], 1
        )
        mean = total / denom
        data[f"{prefix}_mean"] = mean
        data[f"{prefix}_median"] = mean * rng.uniform(0.6, 1.0, n_rows)
        data[f"{prefix}_min"] = mean * rng.uniform(0.01, 0.3, n_rows)
        data[f"{prefix}_max"] = mean * rng.uniform(2.0, 8.0, n_rows)

    data["fees_total"] = lognormal_col(0.012, 0.005, sigma=0.9)
    fee_mean = data["fees_total"] / np.maximum(data["total_txs"], 1)
    data["fees_mean"] = fee_mean
    data["fees_median"] = fee_mean * rng.uniform(0.6, 1.0, n_rows)
    data["fees_min"] = fee_mean * rng.uniform(0.01, 0.3, n_rows)
    data["fees_max"] = fee_mean * rng.uniform(2.0, 5.0, n_rows)

    share = np.clip(data["fees_total"] / np.maximum(data["btc_transacted_total"], 1e-6), 0, 1)
    data["fees_as_share_total"] = share
    data["fees_as_share_mean"] = share * rng.uniform(0.8, 1.0, n_rows)
    data["fees_as_share_median"] = share * rng.uniform(0.6, 1.0, n_rows)
    data["fees_as_share_min"] = share * rng.uniform(0.01, 0.3, n_rows)
    data["fees_as_share_max"] = share * rng.uniform(1.0, 3.0, n_rows)

    for prefix in ["blocks_btwn_txs", "blocks_btwn_input_txs", "blocks_btwn_output_txs"]:
        mean_blocks = np.where(is_illicit, rng.uniform(5, 60, n_rows), rng.uniform(20, 250, n_rows))
        data[f"{prefix}_mean"] = mean_blocks
        data[f"{prefix}_median"] = mean_blocks * rng.uniform(0.6, 1.0, n_rows)
        data[f"{prefix}_min"] = mean_blocks * rng.uniform(0.0, 0.2, n_rows)
        data[f"{prefix}_max"] = mean_blocks * rng.uniform(2.0, 6.0, n_rows)
        data[f"{prefix}_total"] = mean_blocks * data["total_txs"]

    data["num_addr_transacted_multiple"] = poisson_col(10, 5)
    cp_mean = poisson_col(35, 16).astype(float)
    data["transacted_w_address_mean"] = cp_mean
    data["transacted_w_address_median"] = cp_mean * rng.uniform(0.6, 1.0, n_rows)
    data["transacted_w_address_min"] = cp_mean * rng.uniform(0.0, 0.3, n_rows)
    data["transacted_w_address_max"] = cp_mean * rng.uniform(2.0, 5.0, n_rows)
    data["transacted_w_address_total"] = cp_mean * data["total_txs"]

    features_df = pd.DataFrame(data)[LIVE_FEATURE_COLUMNS].abs().round(8)
    addresses = [f"synthetic_wallet_{i:06d}" for i in range(n_rows)]
    features_df.insert(0, "address", addresses)
    classes_df = pd.DataFrame({"address": addresses, "class": labels})
    return features_df, classes_df


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a synthetic wallets_features.csv/wallets_classes.csv pair "
        "shaped like the real training data, for exercising the training/validation "
        "pipeline when no real labelled data is available."
    )
    parser.add_argument("--rows", type=int, default=6000)
    parser.add_argument("--illicit-share", type=float, default=0.18)
    parser.add_argument("--label-noise", type=float, default=0.12)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out-dir", type=Path, default=DATA_DIR)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    features_df, classes_df = generate(args.rows, args.illicit_share, args.label_noise, args.seed)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    features_path = args.out_dir / "wallets_features.csv"
    classes_path = args.out_dir / "wallets_classes.csv"
    features_df.to_csv(features_path, index=False)
    classes_df.to_csv(classes_path, index=False)
    print(f"Wrote {len(features_df)} rows to {features_path} and {classes_path}")
    counts = classes_df["class"].value_counts().to_dict()
    print(f"Class balance: {counts}")


if __name__ == "__main__":
    main()
