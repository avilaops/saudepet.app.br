FROM python:3.12-slim

WORKDIR /app

# ffmpeg é dependência do faster-whisper para decodificar os formatos que o
# MediaRecorder do navegador produz (webm/opus); sem ele a transcrição falha
# em runtime com um erro que não menciona ffmpeg em lugar nenhum.
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

RUN groupadd -r transcricao && useradd -r -g transcricao transcricao
# O cache dos modelos do faster-whisper (~/.cache) precisa ser gravável pelo
# usuário não-root, ou o primeiro download falha silenciosamente em runtime.
RUN mkdir -p /home/transcricao/.cache && chown -R transcricao:transcricao /home/transcricao /app
USER transcricao
ENV HOME=/home/transcricao

# `small` é o ponto de equilíbrio entre precisão em PT-BR e RAM: o servidor é
# o mesmo Hetzner 2 vCPU / 3,8 GB que já roda o resto do saudepet-backend,
# `medium` para cima estoura a memória disponível.
ENV WHISPER_MODEL=small
ENV WHISPER_DEVICE=cpu
ENV WHISPER_COMPUTE_TYPE=int8

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8100/saude', timeout=3)" || exit 1

EXPOSE 8100
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8100"]
