from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import sys
from typing import Any, Dict, List

import joblib
import pandas as pd
from sklearn.metrics import accuracy_score, classification_report, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from src.database import load_training_frame_from_db  # noqa: E402

DATA_DIR = BACKEND_DIR / "data"
MODELS_DIR = BACKEND_DIR / "models"

FEATURES_PATH = DATA_DIR / "wallets_features.csv"
CLASSES_PATH = DATA_DIR / "wallets_classes.csv"
MODEL_PATH = MODELS_DIR / "btc_live_random_forest.joblib"
FEATURE_COLUMNS_PATH = MODELS_DIR / "btc_live_feature_columns.json"


def _fail(message: str) -> None:
    print(f"MODEL QUALITY CHECK FAILED: {message}", file=sys.stderr)
    raise SystemExit(1)


def _load_feature_columns() -> List[str]:
    if not FEATURE_COLUMNS_PATH.exists():
        _fail(f"Missing feature column contract: {FEATURE_COLUMNS_PATH}")
    with open(FEATURE_COLUMNS_PATH, "r", encoding="utf-8") as file:
        columns = json.load(file)
    if not isinstance(columns, list) or not columns:
        _fail("Feature column contract must be a non-empty JSON list.")
    return [str(column).strip().replace(" ", "_") for column in columns if str(column).strip()]


def _clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = df.columns.str.strip().str.replace(" ", "_")
    return df


def _load_labelled_dataset(feature_columns: List[str]) -> pd.DataFrame:
    db_frame = load_training_frame_from_db()
    if not db_frame.empty:
        df = _clean_columns(db_frame)
        df = df[df["class"].isin([1, 2])].copy()
        missing = [column for column in feature_columns if column not in df.columns]
        if missing:
            _fail(f"Database training data is missing model feature columns: {missing}")
        df["target"] = df["class"].map({1: 1, 2: 0})
        for column in feature_columns:
            df[column] = pd.to_numeric(df[column], errors="coerce").fillna(0.0)
        return df

    if not FEATURES_PATH.exists():
        _fail(f"Missing model feature data: {FEATURES_PATH}")
    if not CLASSES_PATH.exists():
        _fail(f"Missing model class labels: {CLASSES_PATH}")

    features = _clean_columns(pd.read_csv(FEATURES_PATH))
    classes = _clean_columns(pd.read_csv(CLASSES_PATH))
    df = features.merge(classes, on="address", how="inner")
    df = df[df["class"].isin([1, 2])].copy()
    if df.empty:
        _fail("No labelled class 1/2 wallet rows were found.")

    missing = [column for column in feature_columns if column not in df.columns]
    if missing:
        _fail(f"Dataset is missing model feature columns: {missing}")

    df["target"] = df["class"].map({1: 1, 2: 0})
    for column in feature_columns:
        df[column] = pd.to_numeric(df[column], errors="coerce").fillna(0.0)
    return df


def _positive_class_scores(model: Any, X: pd.DataFrame) -> List[float]:
    if not hasattr(model, "predict_proba"):
        return [float(value) for value in model.predict(X)]

    probabilities = model.predict_proba(X)
    classes = list(getattr(model, "classes_", []))
    first_row = probabilities[0] if len(probabilities) else []
    positive_index = classes.index(1) if 1 in classes else min(1, len(first_row) - 1)
    return [float(row[positive_index]) for row in probabilities]


def evaluate_model(args: argparse.Namespace) -> Dict[str, Any]:
    feature_columns = _load_feature_columns()
    df = _load_labelled_dataset(feature_columns)
    if not MODEL_PATH.exists():
        _fail(f"Missing trained classifier artifact: {MODEL_PATH}")

    model = joblib.load(MODEL_PATH)
    X = df[feature_columns]
    y = df["target"]

    _, X_eval, _, y_eval = train_test_split(
        X,
        y,
        test_size=args.test_size,
        random_state=args.random_state,
        stratify=y,
    )

    predictions = model.predict(X_eval)
    scores = _positive_class_scores(model, X_eval)

    metrics = {
        "eval_rows": int(len(X_eval)),
        "accuracy": float(accuracy_score(y_eval, predictions)),
        "illicit_precision": float(precision_score(y_eval, predictions, pos_label=1, zero_division=0)),
        "illicit_recall": float(recall_score(y_eval, predictions, pos_label=1, zero_division=0)),
        "illicit_f1": float(f1_score(y_eval, predictions, pos_label=1, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_eval, scores)) if len(set(y_eval)) > 1 else 0.0,
    }

    print(json.dumps(metrics, indent=2, sort_keys=True))
    print(classification_report(y_eval, predictions, target_names=["licit", "illicit"], zero_division=0))

    if metrics["illicit_f1"] < args.min_illicit_f1:
        _fail(f"Illicit F1 {metrics['illicit_f1']:.4f} is below threshold {args.min_illicit_f1:.4f}.")
    if metrics["illicit_recall"] < args.min_illicit_recall:
        _fail(f"Illicit recall {metrics['illicit_recall']:.4f} is below threshold {args.min_illicit_recall:.4f}.")
    if metrics["roc_auc"] < args.min_roc_auc:
        _fail(f"ROC AUC {metrics['roc_auc']:.4f} is below threshold {args.min_roc_auc:.4f}.")
    return metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate the saved BTC wallet classifier against labelled data.")
    parser.add_argument("--min-illicit-f1", type=float, default=float(os.getenv("MODEL_MIN_ILLICIT_F1", "0.75")))
    parser.add_argument("--min-illicit-recall", type=float, default=float(os.getenv("MODEL_MIN_ILLICIT_RECALL", "0.70")))
    parser.add_argument("--min-roc-auc", type=float, default=float(os.getenv("MODEL_MIN_ROC_AUC", "0.80")))
    parser.add_argument("--test-size", type=float, default=float(os.getenv("MODEL_EVAL_TEST_SIZE", "0.20")))
    parser.add_argument("--random-state", type=int, default=int(os.getenv("MODEL_EVAL_RANDOM_STATE", "42")))
    return parser.parse_args()


if __name__ == "__main__":
    evaluate_model(parse_args())
