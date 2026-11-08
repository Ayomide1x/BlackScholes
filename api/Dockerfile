# The calibration API and the daily calibrator job share this image.
# Built from the repository root (see docker-compose.yml), so the test stage can
# use the same Heston reference values as the frontend's tests.

FROM python:3.14-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY api/calibration ./calibration

FROM base AS test
COPY api/requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY api/tests ./tests
COPY web/src/models/heston-fixtures.json ./tests/
RUN python -m pytest -q -p no:warnings tests && touch /tested

FROM base
# Depending on the test stage makes every build run the tests; a failure stops it.
COPY --from=test /tested /tested
# The database lives on a volume at /data, owned by this unprivileged user.
RUN useradd --uid 10001 --no-create-home calibration && mkdir /data && chown calibration /data
USER calibration
ENV CALIBRATION_DB=/data/calibration.db
EXPOSE 8000
CMD ["uvicorn", "calibration.app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
