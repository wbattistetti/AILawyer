from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os, time, re

# Ensure libpostal env
os.environ.setdefault("LD_LIBRARY_PATH", "/usr/local/lib")
os.environ.setdefault("LIBPOSTAL_DATA_DIR", "/usr/local/share/libpostal")

try:
    from postal.parser import parse_address  # type: ignore
    _POSTAL = True
except Exception:  # pragma: no cover
    _POSTAL = False

app = FastAPI(title="Address Normalizer (IT)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class NormalizeReq(BaseModel):
    type: str
    text: str
    context: Optional[Dict[str, Any]] = None


ALIAS = {
    r"\bP\.zza\b": "Piazza",
    r"\bP\.za\b": "Piazza",
    r"\bV\.le\b": "Viale",
    r"\bV\.lo\b": "Vicolo",
    r"\bC\.so\b": "Corso",
    r"\bL\.go\b": "Largo",
    r"\bS\.N\.C\.?\b": "SNC",
}
PREFIX_RE = re.compile(
    r"(ivi\s+residente\s+in|residente\s+in|domiciliat[oa]\s+in|dom\.\s*in|con\s+domicilio\s+eletto\s+presso)",
    re.IGNORECASE,
)


def preclean(s: str) -> str:
    s = s.strip()
    m = re.search(r"(?:c/o|presso)\s+([^,;]+)", s, re.IGNORECASE)
    if m:
        s = (s[: m.start()] + s[m.end() :]).replace("  ", " ")
    m2 = PREFIX_RE.search(s)
    if m2:
        s = s[m2.end() :].lstrip(",; ")
    for rx, rep in ALIAS.items():
        s = re.sub(rx, rep, s, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", s).strip()


def _mk_norm(comps: dict) -> str:
    parts = []
    if comps.get("road"):
        parts.append(str(comps["road"]).title())
    if comps.get("house_number"):
        parts[-1] = f"{parts[-1]} {comps['house_number']}" if parts else comps['house_number']
    tail = []
    if comps.get("postcode"):
        tail.append(comps["postcode"])
    if comps.get("city"):
        tail.append(str(comps["city"]).title())
    if comps.get("province") and tail:
        tail[-1] = f"{tail[-1]} ({str(comps['province']).upper()})"
    if tail:
        parts.append(" ".join(tail))
    return ", ".join(parts) if parts else ""


@app.post("/normalize")
def normalize(req: NormalizeReq):
    t0 = time.perf_counter()
    cleaned = preclean(req.text)
    comps = {}
    engine = "regex"
    if _POSTAL:
        try:
            comps = {k: v for v, k in parse_address(cleaned)}
            engine = "libpostal"
        except Exception:
            comps = {}
            engine = "regex"
    if not comps:
        # very small regex fallback: extract road + number, cap, city, province sigla
        mroad = re.search(
            r"(Via|Viale|Vicolo|Vico|Piazza|Corso|Strada|Largo|Piazzale)\s+([^,;]+)",
            cleaned,
            re.IGNORECASE,
        )
        if mroad:
            comps["road"] = f"{mroad.group(1).title()} {mroad.group(2).strip()}"
        mnum = re.search(r",\s*(\d+\w?)\b", cleaned)
        if mnum:
            comps["house_number"] = mnum.group(1)
        mcap = re.search(r"\b(\d{2})\.(\d{3})\b|\b(\d{5})\b", cleaned)
        if mcap:
            comps["postcode"] = (mcap.group(1) or "") + (mcap.group(2) or mcap.group(3) or "")
        mprov = re.search(r"\(([A-Z]{2})\)", cleaned)
        if mprov:
            comps["province"] = mprov.group(1)
        else:
            mprov2 = re.search(r"\b([A-Z]{2})\b$", cleaned)
            if mprov2:
                comps["province"] = mprov2.group(1)
        if "city" not in comps:
            tail = cleaned.split(",")[-1].strip()
            if tail and not re.search(r"\d{5}", tail):
                comps["city"] = re.sub(r"\([A-Z]{2}\)$", "", tail).strip()

    # context fallback from last_place (e.g., "ivi residente")
    if not comps.get("city") and req.context and req.context.get("last_place"):
        comps["city"] = str(req.context["last_place"]) 

    norm = _mk_norm(comps) or cleaned
    conf = 0.5 + (0.2 if comps.get("postcode") else 0) + (0.2 if comps.get("road") else 0)
    conf = max(0.3, min(1.0, conf))
    addr = {
        "type": req.type,
        "raw": req.text,
        "cleaned": cleaned,
        "components": {
            "recipient": comps.get("house"),
            "road": comps.get("road"),
            "house_number": comps.get("house_number"),
            "municipality": comps.get("city"),
            "province": comps.get("state") or comps.get("province"),
            "postcode": comps.get("postcode"),
            "country": comps.get("country") or "Italia",
        },
        "norm": norm,
        "confidence": conf,
        "engine": engine,
        "notes": [],
        "version": "addr-normalizer@1.0"
    }
    return {"ok": True, "address": addr, "latency_ms": int((time.perf_counter() - t0) * 1000)}


