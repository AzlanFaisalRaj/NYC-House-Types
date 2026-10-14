# NYC Airbnb Room Type Predictor

A multiclass classifier that predicts whether a New York Airbnb listing is an **entire home/apt**, a **private room**, or a **shared room**, from its price, location, reviews and availability. The full path is covered: EDA, preprocessing, model comparison, tuning, a FastAPI service, and a web frontend.

## Results

Evaluated on a held-out, stratified 33% test split that was used once, after tuning.

| Metric | Score |
|---|---|
| Accuracy | 85.6% |
| Macro F1 | 0.741 |
| Best CV macro F1 (tuning) | 0.730 |

Model comparison (3-fold stratified CV on the training set):

| Model | Accuracy | Macro F1 |
|---|---|---|
| Logistic Regression | 0.659 | 0.522 |
| Decision Tree | 0.782 | 0.647 |
| Random Forest | 0.851 | 0.715 |
| Gradient Boosting | 0.850 | 0.705 |

Random Forest was tuned with `RandomizedSearchCV` (10 iterations, scored on macro F1). Best parameters: `n_estimators=200`, `min_samples_split=10`, `max_depth=None`, with `class_weight="balanced"`.

## How it works

**Data:** [New York City Airbnb Open Data](https://www.kaggle.com/datasets/dgomonov/new-york-city-airbnb-open-data) (Kaggle, `AB_NYC_2019.csv`), 48,895 listings.

**Cleaning**
- Dropped `id`, `name`, `host_id`, `host_name`, `last_review`.
- Filled missing `reviews_per_month` with 0 (no reviews yet).
- Clipped `price` and `minimum_nights` at the 99th percentile instead of deleting rows.

**Features (10):** `latitude`, `longitude`, `price`, `minimum_nights`, `number_of_reviews`, `reviews_per_month`, `calculated_host_listings_count`, `availability_365`, `neighbourhood_group`, `neighbourhood`.

**Pipeline:** a single scikit-learn `Pipeline` saved as `Model_Pipeline.pkl`.
- Numeric: median imputation, then standard scaling.
- Categorical: most-frequent imputation, then one-hot encoding (`handle_unknown="ignore"`).
- Classifier: Random Forest.

Preprocessing lives inside the pipeline, so the API passes raw feature values and no manual transformation is needed at inference time.

## Project structure

```
.
├── nyc_airbnb_room_type_classification.ipynb   # EDA, training, tuning, evaluation
├── Model_Pipeline.pkl                           # trained pipeline (preprocessing + model)
├── main.py                                      # FastAPI service
├── requirements.txt
├── runtime.txt                                  # Python version for the host
└── frontend/
    ├── index.html
    ├── style.css
    └── script.js
```

## Run locally

Python 3.12 is recommended (see `runtime.txt`).

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

The API starts at `http://127.0.0.1:8000`. Interactive docs are at `/docs`.

For the frontend, open `frontend/index.html` in a browser. Set the API address at the top of `frontend/script.js`:

```js
const API_BASE_URL = "http://127.0.0.1:8000";
```

> `scikit-learn` is pinned to `1.6.1` because a `.pkl` file should be loaded with the same version that created it. If you retrain with a different version, update `requirements.txt` to match.

## API

### `GET /`
Health check. Returns a plain greeting string.

### `POST /predict`

Request:

```json
{
  "latitude": 40.7484,
  "longitude": -73.9857,
  "price": 220,
  "minimum_nights": 2,
  "number_of_reviews": 84,
  "reviews_per_month": 2.3,
  "calculated_host_listings_count": 1,
  "availability_365": 210,
  "neighbourhood_group": "Manhattan",
  "neighbourhood": "Midtown"
}
```

Response:

```json
{
  "Predicted_room_type": "Private room",
  "Probability": [0.18, 0.70, 0.12]
}
```

`Probability` follows the model's class order, which is alphabetical: `Entire home/apt`, `Private room`, `Shared room`.

Inputs are validated with Pydantic (for example `price > 0`, `1 <= minimum_nights <= 365`, `0 <= availability_365 <= 365`). Invalid input returns a 422 with details.

## Frontend

Plain HTML, CSS and JavaScript, with no build step. It shows the predicted class, a confidence gauge, and a probability bar per class. It flags close calls when the top two classes are within 20 points, and tells you when the API is waking up.

## Deployment

The backend runs on any Python host that can start `uvicorn main:app`. On a free Render instance, the server sleeps when idle, so the first request can take up to a minute. The frontend can be hosted on any static host (GitHub Pages, Netlify, Vercel). CORS is open to all origins in `main.py`; restrict `allow_origins` for production.

## Limitations

- **Shared rooms are rare** in the data, so the model is least reliable for that class. Accuracy alone hides this, which is why macro F1 was used for model selection.
- **The data is from 2019.** Prices, listing mix and regulations have changed since.
- **Prices and minimum nights are clipped** at the 99th percentile in training, so extreme values are treated as the cap.
- **Unseen neighbourhood names** are ignored by the encoder, so the prediction then relies on the other features.
- **Coordinates are not checked against NYC.** A latitude/longitude outside the city is accepted and will give an unreliable result.
- The model predicts room type from listing attributes. It is not a pricing tool and does not read listing text or photos.

## Tech stack

Python, pandas, scikit-learn, FastAPI, Pydantic, Uvicorn, joblib. Frontend: HTML, CSS, JavaScript.

## License

Dataset: see the Kaggle page for its license. Add a license for your own code before publishing.
