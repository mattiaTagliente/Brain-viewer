"""FastAPI application entry point."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import api, ws
from .db import KGReader
from .sidecar import SidecarDB

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# Sidecar DB lives next to the backend package
_SIDECAR_PATH = Path(__file__).resolve().parent.parent.parent / "brain_viewer.db"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize KG reader and sidecar DB on startup, close on shutdown."""
    kg_path = os.environ.get("KNOWLEDGE_GLOBAL_DB")
    logger.info("Starting Brain Viewer backend")

    try:
        kg_reader = KGReader(kg_path)
        logger.info("KG database opened: %s", kg_reader.db_path)
    except FileNotFoundError as e:
        logger.error("KG database not found: %s", e)
        raise

    sidecar_db = SidecarDB(_SIDECAR_PATH)
    logger.info("Sidecar database: %s", _SIDECAR_PATH)

    # Wire into API and WS modules
    api.kg = kg_reader
    api.sidecar = sidecar_db
    ws.kg = kg_reader

    stats = kg_reader.get_stats()
    logger.info(
        "KG stats: %d entities, %d observations, %d relations",
        stats["entities_count"],
        stats["observations_count"],
        stats["relations_count"],
    )

    yield

    kg_reader.close()
    sidecar_db.close()
    logger.info("Brain Viewer backend stopped")


app = FastAPI(title="Brain Viewer", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "http://localhost:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api.router)
app.include_router(ws.router)
