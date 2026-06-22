from pathlib import Path
import json
import os
import sys

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from src.database import load_labelled_live_frame_from_db, load_training_frame_from_db  # noqa: E402
from src.feature_builder import LIVE_FEATURE_COLUMNS  # noqa: E402

DATA_DIR = BASE_DIR / "data"
MODELS_DIR = BASE_DIR / "models"

FEATURES_PATH = DATA_DIR / "wallets_features.csv"
CLASSES_PATH = DATA_DIR / "wallets_classes.csv"
LIVE_OBSERVATIONS_PATH = DATA_DIR / "live_wallet_feature_observations.csv"
LIVE_LABELS_PATH = DATA_DIR / "live_wallet_labels.csv"

MODEL_PATH = MODELS_DIR / "btc_live_random_forest.joblib"
FEATURE_LIST_PATH = MODELS_DIR / "btc_live_feature_columns.json"
IMPORTANCE_PATH = MODELS_DIR / "btc_live_feature_importance.csv"
SHAP_IMPORTANCE_PATH = MODELS_DIR / "btc_live_shap_feature_importance.csv"
METRICS_PATH = MODELS_DIR / "btc_live_model_metrics.json"
DEFAULT_MPLCONFIGDIR = BASE_DIR / ".cache" / "matplotlib"


def _clean_columns(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = df.columns.str.strip().str.replace(" ", "_")
    return df


def _load_base_training_frame() -> pd.DataFrame:
    db_frame = load_training_frame_from_db()
    if not db_frame.empty:
        return _clean_columns(db_frame)

    features = _clean_columns(pd.read_csv(FEATURES_PATH))
    classes = _clean_columns(pd.read_csv(CLASSES_PATH))
    return features.merge(classes, on="address", how="inner")


def _load_labelled_live_frame() -> pd.DataFrame:
    db_frame = load_labelled_live_frame_from_db()
    if not db_frame.empty:
        return _clean_columns(db_frame)

    if not LIVE_OBSERVATIONS_PATH.exists() or not LIVE_LABELS_PATH.exists():
        return pd.DataFrame()

    observations = _clean_columns(pd.read_csv(LIVE_OBSERVATIONS_PATH))
    labels = _clean_columns(pd.read_csv(LIVE_LABELS_PATH))
    if "address" not in observations.columns or "address" not in labels.columns or "class" not in labels.columns:
        return pd.DataFrame()

    observations = observations.drop_duplicates(subset=["address"], keep="last")
    labels = labels.drop_duplicates(subset=["address"], keep="last")
    return observations.merge(labels[["address", "class"]], on="address", how="inner")


def _positive_class_scores(model: RandomForestClassifier, X: pd.DataFrame) -> list[float]:
    probabilities = model.predict_proba(X)
    classes = list(getattr(model, "classes_", []))
    positive_index = classes.index(1) if 1 in classes else min(1, probabilities.shape[1] - 1)
    return [float(row[positive_index]) for row in probabilities]


def _write_shap_importance(model: RandomForestClassifier, X_train: pd.DataFrame) -> None:
    os.environ.setdefault("MPLCONFIGDIR", str(DEFAULT_MPLCONFIGDIR))
    DEFAULT_MPLCONFIGDIR.mkdir(parents=True, exist_ok=True)

    import shap

    sample_size = min(len(X_train), int(os.getenv("SHAP_SAMPLE_SIZE", "5000")))
    background = X_train.sample(n=sample_size, random_state=42) if len(X_train) > sample_size else X_train
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(background)

    if isinstance(shap_values, list):
        positive_values = shap_values[1] if len(shap_values) > 1 else shap_values[0]
    elif getattr(shap_values, "ndim", 0) == 3:
        positive_values = shap_values[:, :, 1]
    else:
        positive_values = shap_values

    shap_df = pd.DataFrame(
        {
            "feature": list(background.columns),
            "mean_abs_shap": abs(positive_values).mean(axis=0),
        }
    ).sort_values("mean_abs_shap", ascending=False)
    shap_df.to_csv(SHAP_IMPORTANCE_PATH, index=False)


def main() -> None:
    os.makedirs(MODELS_DIR, exist_ok=True)

    base_df = _load_base_training_frame()
    live_df = _load_labelled_live_frame()
    df = pd.concat([base_df, live_df], ignore_index=True)
    df = _clean_columns(df)

    df = df[df["class"].isin([1, 2])].copy()
    df["class"] = df["class"].map({1: 1, 2: 0})
    df = df.drop_duplicates(subset=["address"], keep="last")

    missing = [c for c in LIVE_FEATURE_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing expected live columns in training data: {missing}")

    X = df[LIVE_FEATURE_COLUMNS].copy()
    y = df["class"].copy()

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = RandomForestClassifier(
        n_estimators=int(os.getenv("MODEL_N_ESTIMATORS", "300")),
        random_state=42,
        class_weight="balanced",
        n_jobs=int(os.getenv("MODEL_N_JOBS", "-1")),
    )
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    y_scores = _positive_class_scores(model, X_test)

    metrics = {
        "training_rows": int(len(X_train)),
        "eval_rows": int(len(X_test)),
        "live_labelled_rows": int(len(live_df)),
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "illicit_precision": float(precision_score(y_test, y_pred, pos_label=1, zero_division=0)),
        "illicit_recall": float(recall_score(y_test, y_pred, pos_label=1, zero_division=0)),
        "illicit_f1": float(f1_score(y_test, y_pred, pos_label=1, zero_division=0)),
        "roc_auc": float(roc_auc_score(y_test, y_scores)) if len(set(y_test)) > 1 else 0.0,
    }

    print("\nConfusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))

    print("\nModel Metrics:")
    print(json.dumps(metrics, indent=2, sort_keys=True))

    joblib.dump(model, MODEL_PATH)

    with open(FEATURE_LIST_PATH, "w", encoding="utf-8") as f:
        json.dump(LIVE_FEATURE_COLUMNS, f, indent=2)

    fi = pd.DataFrame(
        {"feature": LIVE_FEATURE_COLUMNS, "importance": model.feature_importances_}
    ).sort_values("importance", ascending=False)
    fi.to_csv(IMPORTANCE_PATH, index=False)

    _write_shap_importance(model, X_train)
    with open(METRICS_PATH, "w", encoding="utf-8") as f:
        json.dump(metrics, f, indent=2, sort_keys=True)

    print(f"\nSaved model to: {MODEL_PATH}")
    print(f"Saved feature list to: {FEATURE_LIST_PATH}")
    print(f"Saved feature importances to: {IMPORTANCE_PATH}")
    print(f"Saved SHAP importances to: {SHAP_IMPORTANCE_PATH}")
    print(f"Saved model metrics to: {METRICS_PATH}")


if __name__ == "__main__":
    main()
