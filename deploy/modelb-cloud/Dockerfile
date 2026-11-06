FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libglib2.0-0 libgl1 ca-certificates && rm -rf /var/lib/apt/lists/*
# CPU-only packages pinned to match the Windows Model B inference environment.
RUN python -m pip install --upgrade pip && \
    python -m pip install torch==2.15.0 torchvision==0.29.2 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt /app/requirements.txt
RUN python -m pip install -r requirements.txt
COPY server.py cloud_app.py /app/
COPY static/ /app/static/
COPY model/ /app/model/
RUN python -m compileall -q server.py cloud_app.py
ENV PORT=8080 HF_HUB_OFFLINE=1 OMP_NUM_THREADS=2 MKL_NUM_THREADS=2
EXPOSE 8080
CMD ["sh","-c","exec uvicorn cloud_app:app --host 0.0.0.0 --port $PORT --workers 1"]
