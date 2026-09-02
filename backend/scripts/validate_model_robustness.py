from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.feature_builder import LIVE_FEATURE_COLUMNS  # noqa: E402

DATA_DIR = BACKEND_DIR / "data"
FEATURES_PATH = DATA_DIR / "wallets_features.csv"
CLASSES_PATH = DATA_DIR / "wallets_classes.csv"


def make_model() -> RandomForestClassifier:
    return RandomForestClassifier(n_estimators=300, random_state=42, class_weight="balanced", n_jobs=-1)


def positive_scores(model: RandomForestClassifier, X_eval: pd.DataFrame) -> np.ndarray:
    proba = model.predict_proba(X_eval)
    classes_ = list(model.classes_)
    idx = classes_.index(1) if 1 in classes_ else min(1, proba.shape[1] - 1)
    return proba[:, idx]


def score_split(model: RandomForestClassifier, X_split: pd.DataFrame, y_split: pd.Series) -> dict:
    preds = model.predict(X_split)
    scores = positive_scores(model, X_split)
    return {
        "rows": int(len(X_split)),
        "accuracy": float(accuracy_score(y_split, preds)),
        "illicit_precision": float(precision_score(y_split, preds, pos_label=1, zero_division=0)),
        "illicit_recall": float(recall_score(y_split, preds, pos_label=1, zero_division=0)),
        "illicit_f1": float(f1_score(y_split, preds, pos_label=1, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_split, scores)) if len(set(y_split)) > 1 else None,
    }


def overfit_check(X: pd.DataFrame, y: pd.Series) -> dict:
    """Compare train-set vs held-out test-set performance to size the overfitting gap."""
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    model = make_model()
    model.fit(X_train, y_train)
    train_metrics = score_split(model, X_train, y_train)
    test_metrics = score_split(model, X_test, y_test)
    return {
        "train_metrics": train_metrics,
        "test_metrics": test_metrics,
        "overfit_gap": {
            "accuracy_gap": train_metrics["accuracy"] - test_metrics["accuracy"],
            "roc_auc_gap": (train_metrics["roc_auc"] or 0) - (test_metrics["roc_auc"] or 0),
            "illicit_f1_gap": train_metrics["illicit_f1"] - test_metrics["illicit_f1"],
        },
    }


def walk_forward_check(X: pd.DataFrame, y: pd.Series, window_fraction: float) -> dict:
    """Expanding-window walk-forward validation using row order as a pseudo-timeline.

    Each fold trains on every row before the current window and tests on the next
    window_fraction-sized window, then advances. Row order here has no real temporal
    meaning for synthetic data (see the report) - this measures fold-to-fold stability,
    not concept drift.
    """
    n_rows = len(X)
    window_size = max(1, int(round(n_rows * window_fraction)))

    folds = []
    start = window_size
    fold_idx = 0
    while start + window_size <= n_rows:
        fold_idx += 1
        X_tr, y_tr = X.iloc[:start], y.iloc[:start]
        X_te, y_te = X.iloc[start : start + window_size], y.iloc[start : start + window_size]

        model = make_model()
        model.fit(X_tr, y_tr)
        metrics = score_split(model, X_te, y_te)
        metrics.update({"fold": fold_idx, "train_rows": int(len(X_tr)), "test_window": [start, start + window_size]})
        folds.append(metrics)
        start += window_size

    accuracy = [f["accuracy"] for f in folds]
    roc_auc = [f["roc_auc"] for f in folds if f["roc_auc"] is not None]
    illicit_f1 = [f["illicit_f1"] for f in folds]

    return {
        "summary": {
            "window_size": window_size,
            "num_folds": len(folds),
            "accuracy_mean": float(np.mean(accuracy)) if accuracy else None,
            "accuracy_std": float(np.std(accuracy)) if accuracy else None,
            "roc_auc_mean": float(np.mean(roc_auc)) if roc_auc else None,
            "roc_auc_std": float(np.std(roc_auc)) if roc_auc else None,
            "illicit_f1_mean": float(np.mean(illicit_f1)) if illicit_f1 else None,
            "illicit_f1_std": float(np.std(illicit_f1)) if illicit_f1 else None,
        },
        "folds": folds,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run an overfitting check (train vs held-out test) and an expanding-window "
        "walk-forward validation against backend/data/wallets_features.csv + wallets_classes.csv."
    )
    parser.add_argument("--walk-forward-window-fraction", type=float, default=0.10)
    parser.add_argument("--out-json", type=Path, default=None)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if not FEATURES_PATH.exists() or not CLASSES_PATH.exists():
        print(
            f"Missing {FEATURES_PATH} or {CLASSES_PATH}. Run "
            "scripts/generate_synthetic_wallets_dataset.py first if you don't have real labelled data.",
            file=sys.stderr,
        )
        raise SystemExit(1)

    features = pd.read_csv(FEATURES_PATH)
    classes = pd.read_csv(CLASSES_PATH)
    df = features.merge(classes, on="address", how="inner")
    df["target"] = df["class"].map({1: 1, 2: 0})

    X = df[LIVE_FEATURE_COLUMNS].copy()
    y = df["target"].copy()

    results = {
        "dataset_rows": int(len(df)),
        "held_out_split": overfit_check(X, y),
        "walk_forward": walk_forward_check(X, y, args.walk_forward_window_fraction),
    }

    print(json.dumps(results, indent=2))
    if args.out_json:
        args.out_json.write_text(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
