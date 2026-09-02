# Synthetic model validation

## Why this exists

There is currently no real labelled training data reachable in this repo or its CI:

- `backend/data/wallets_features.csv` and `backend/data/wallets_classes.csv` (the base
  training set `train_live_model.py` / `scripts/evaluate_model.py` expect) are not
  committed to git and don't exist on disk locally.
- No `DATABASE_URL` is configured locally or in the `model-training` GitHub Actions
  workflow, so the Postgres fallback (`load_training_frame_from_db`) returns nothing.
- Every run of `.github/workflows/model-training.yml` since it was added — 12/12,
  including the one manual `workflow_dispatch` run — has failed with the same
  `FileNotFoundError` on `wallets_features.csv`. No metrics from a successful run exist
  anywhere to reference instead.

`scripts/generate_synthetic_wallets_dataset.py` and
`scripts/validate_model_robustness.py` let anyone exercise the real training/evaluation
code end to end without that data, to sanity-check the pipeline and get a feel for the
model architecture's behavior. **They do not tell you how the deployed model performs
on real wallets.** Getting that number requires either the real base CSVs or working DB
credentials — see the repo's data-migration history for where that data now lives.

## What the synthetic dataset looks like

`generate_synthetic_wallets_dataset.py` builds `wallets_features.csv` /
`wallets_classes.csv` with the exact 49 columns in
`src.feature_builder.LIVE_FEATURE_COLUMNS`, for a configurable number of synthetic
wallets (default 6,000). Class balance defaults to ~18% illicit before label noise. To
avoid a meaningless, trivially-separable dataset (an earlier, more naive version of this
generator produced 100% accuracy — a sign the classes were too cleanly separated, not
that the pipeline works well), illicit vs. licit feature distributions are drawn from
overlapping log-normal/Poisson distributions with wide spread, and 12% of labels are
randomly flipped from their generating class (`--label-noise`, default `0.12`).

Run it with:

```bash
python backend/scripts/generate_synthetic_wallets_dataset.py
```

## Held-out accuracy (baseline)

Running `backend/src/train_live_model.py` against the generated dataset (6,000 rows,
80/20 stratified split, `RandomForestClassifier(n_estimators=300, class_weight="balanced")`,
seed 42):

| Metric | Value |
| --- | --- |
| Accuracy | 88.2% |
| Illicit precision | 88.5% |
| Illicit recall | 62.3% |
| Illicit F1 | 73.1% |
| ROC-AUC | 80.6% |

## Overfitting check (train vs. held-out test)

`validate_model_robustness.py` fits the same model and scores it on both its own
training split and the held-out test split:

| Split | Rows | Accuracy | Illicit F1 | ROC-AUC |
| --- | --- | --- | --- | --- |
| Train | 4,800 | 100.0% | 100.0% | 100.0% |
| Test | 1,200 | 88.2% | 73.1% | 80.6% |
| **Gap** | | **11.8 pp** | **26.9 pp** | **19.4 pp** |

The model perfectly memorizes its training set (100% on all three metrics), which is
expected for an unconstrained `RandomForestClassifier` (no `max_depth`,
no `min_samples_leaf`) — trees are grown until every training leaf is pure. The 12–27
percentage-point gap to held-out performance is the overfitting signature you'd expect
from that configuration; it isn't a synthetic-data artifact. Note the training-set
score is not directly comparable to a k-fold or nested-CV estimate — it's shown here
specifically to size the memorization gap, not as a validation metric.

If overfitting is a real concern for the production model, the usual levers apply:
`max_depth`, `min_samples_leaf`, `max_features`, or fewer/shallower trees, tuned against
a proper validation split — the synthetic dataset can't tell you the right values for
real wallet data, only that the current unconstrained configuration will memorize
whatever it's given.

## Walk-forward validation (expanding window, 10%-of-dataset test windows)

`validate_model_robustness.py --walk-forward-window-fraction 0.10` splits the 6,000
rows into 600-row (10%) windows and walks forward: fold *k* trains on every row before
window *k* (expanding train set) and tests on window *k*, for 9 folds covering rows
600–6,000 (the first 600 rows are only ever used for training).

**Caveat on interpretation:** the synthetic dataset has no real time axis — row order is
arbitrary generation order, not a timeline, and the generator has no drift over that
order. So this isn't testing "does performance degrade as wallet behavior evolves over
time" the way walk-forward validation would on real time-ordered data; it's testing
fold-to-fold stability of the pipeline under an expanding training set. Treat it as a
stability check, not a drift/recency check.

| Fold | Train rows | Test window | Accuracy | Illicit F1 | ROC-AUC |
| --- | --- | --- | --- | --- | --- |
| 1 | 600 | 600–1200 | 88.2% | 74.4% | 83.9% |
| 2 | 1200 | 1200–1800 | 85.7% | 65.0% | 75.8% |
| 3 | 1800 | 1800–2400 | 88.8% | 70.7% | 79.4% |
| 4 | 2400 | 2400–3000 | 88.7% | 75.4% | 82.2% |
| 5 | 3000 | 3000–3600 | 87.8% | 73.6% | 79.4% |
| 6 | 3600 | 3600–4200 | 89.5% | 75.7% | 82.9% |
| 7 | 4200 | 4200–4800 | 88.2% | 73.0% | 81.2% |
| 8 | 4800 | 4800–5400 | 86.5% | 69.7% | 77.8% |
| 9 | 5400 | 5400–6000 | 86.7% | 71.6% | 77.2% |
| **Mean ± std** | | | **87.8% ± 1.2pp** | **72.1% ± 3.2pp** | **80.0% ± 2.6pp** |

Results are stable across folds (accuracy std under 1.2 points, no directional trend as
the window advances), and close to the single 80/20 held-out split above (88.2%
accuracy). That's the expected outcome given the generator has no embedded drift — it's
a consistency check on the training code, not evidence the model would be stable against
real, evolving wallet behavior over time.

## Reproducing this

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

python scripts/generate_synthetic_wallets_dataset.py
python scripts/validate_model_robustness.py
```

Both scripts are deterministic (seed 42 by default) and read/write only
`backend/data/wallets_features.csv` and `backend/data/wallets_classes.csv` — they don't
touch `backend/models/` or anything committed to the repo.
