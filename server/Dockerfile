# syntax=docker/dockerfile:1
FROM python:3.14-slim-bookworm AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    MPLBACKEND=Agg
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libgomp1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dependencies
# uv and Python stay fixed across build and runtime; the project lock is authoritative.
RUN python -m pip install --no-cache-dir uv==0.13.5
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-managed-python

FROM base AS runtime
ENV PATH="/app/.venv/bin:${PATH}" \
    SPHEREX_DATA_DIR=/data/m101 \
    MPLCONFIGDIR=/tmp/matplotlib \
    XDG_CACHE_HOME=/tmp/cache
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --create-home app \
    && mkdir -p /data/m101 && chown -R app:app /data
COPY --from=dependencies /app/.venv /app/.venv
COPY --chown=app:app spherex ./spherex
# spherex.prepare imports scripts.validate_irsa; keep its scientific CLI dependencies.
COPY --chown=app:app scripts/validate_irsa.py ./scripts/validate_irsa.py
USER app
EXPOSE 8000
CMD ["python", "-m", "uvicorn", "spherex.api:app", "--host", "0.0.0.0", "--port", "8000"]
