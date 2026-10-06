import io
import os
import time

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel

MODELO = os.environ.get("WHISPER_MODEL", "small")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")

app = FastAPI(title="Transcricao Avila Ops", version="1.0")

_model: WhisperModel | None = None


def modelo() -> WhisperModel:
    global _model
    if _model is None:
        _model = WhisperModel(MODELO, device=DEVICE, compute_type=COMPUTE_TYPE)
    return _model


@app.get("/saude")
def saude():
    return {"status": "ok", "modelo": MODELO}


@app.post("/transcrever")
async def transcrever(arquivo: UploadFile = File(...)):
    if not arquivo.content_type or not arquivo.content_type.startswith("audio/"):
        raise HTTPException(400, f"Esperado um arquivo de audio, recebido {arquivo.content_type}")

    dados = await arquivo.read()
    if not dados:
        raise HTTPException(400, "Arquivo de audio vazio")

    t0 = time.time()
    segmentos, info = modelo().transcribe(io.BytesIO(dados), language="pt", beam_size=5)
    trechos = [
        {"inicio": round(s.start, 2), "fim": round(s.end, 2), "texto": s.text.strip()}
        for s in segmentos
    ]
    texto = " ".join(t["texto"] for t in trechos).strip()

    return JSONResponse({
        "texto": texto,
        "idioma": info.language,
        "confianca_idioma": round(info.language_probability, 4),
        "duracao_processamento_segundos": round(time.time() - t0, 2),
        "trechos": trechos,
    })
