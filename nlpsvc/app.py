from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import os, time, re, hashlib

os.environ.setdefault("PYTHONDONTWRITEBYTECODE", "1")

app = FastAPI(title="NLP Event Extractor (IT)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

class Event(BaseModel):
    type: str
    text: str
    participants: List[str]
    time: Optional[str] = None
    place_raw: Optional[str] = None
    artefacts: List[str] = Field(default_factory=list)
    amount: Optional[str] = None
    source: Dict[str, Any] = Field(default_factory=dict)
    confidence: float = 0.5
    id: Optional[str] = None

class EventsReq(BaseModel):
    text: str
    meta: Optional[Dict[str, Any]] = None

class EventsBatchReq(BaseModel):
    items: List[EventsReq]

_NLP = None
_MATCHER = None
_DEPMATCH = None

# time hints
TIME_CLUES = re.compile(r"\b(ore|alle|h\.?)\s*\d{1,2}[:\.]?\d{0,2}\b", re.IGNORECASE)
DATE_CLUES = re.compile(r"\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[12]\d{3})\b")

def parse_time_iso(text: str) -> Optional[str]:
    try:
        import dateparser
    except Exception:
        return None
    m = TIME_CLUES.search(text) or DATE_CLUES.search(text)
    sub = text if not m else text[max(0, m.start()-20): m.end()+20]
    dt = dateparser.parse(sub, languages=["it"]) if sub else None
    return dt.isoformat() if dt else None

def make_event_id(kind: str, participants: List[str], time_iso: Optional[str], place_raw: Optional[str], source: Dict[str,Any]) -> str:
    key = "|".join([
        kind,
        ",".join(sorted([p.strip().lower() for p in participants])),
        (time_iso or "").strip(),
        (place_raw or "").strip().lower(),
        str(source.get("doc_id","")) + ":" + str(source.get("page",""))
    ])
    return "evt_" + hashlib.sha1(key.encode("utf-8")).hexdigest()[:16]

def _lazy_init():
    global _NLP, _MATCHER, _DEPMATCH
    if _NLP is not None:
        return
    import spacy
    from spacy.matcher import Matcher, DependencyMatcher
    _NLP = spacy.load("it_core_news_lg")
    _MATCHER = Matcher(_NLP.vocab)
    _DEPMATCH = DependencyMatcher(_NLP.vocab)

    _MATCHER.add("TRG_INCONTRO", [[{"LEMMA":{"IN":["incontrare","vedere"]}}],
                                   [{"LOWER":"in"},{"LOWER":"compagnia"},{"LOWER":"di"}],
                                   [{"LEMMA":{"IN":["riunire","appuntare"]}}]])
    _MATCHER.add("TRG_TELEFONATA", [[{"LEMMA":{"IN":["telefonare","chiamare","contattare","conversare"]}}],
                                     [{"LOWER":"colloquio"},{"LOWER":"telefonico"}]])
    _MATCHER.add("TRG_CONSEGNA", [[{"LEMMA":{"IN":["consegnare","cedere","passare","ricevere","ritirare"]}}]])

    pattern_incontro = [
        {"SPEC": {"NODE_NAME": "V"}, "PATTERN": {"POS": "VERB", "LEMMA": {"IN": ["incontrare", "vedere", "riunire"]}}},
        {"SPEC": {"NODE_NAME": "A", "NBOR_NAME": "V"}, "PATTERN": {"DEP": "nsubj"}},
    ]
    _DEPMATCH.add("DEP_INCONTRO", [pattern_incontro])

    pattern_tel = [
        {"SPEC": {"NODE_NAME": "V"}, "PATTERN": {"POS": "VERB", "LEMMA": {"IN": ["telefonare", "chiamare", "contattare"]}}},
        {"SPEC": {"NODE_NAME": "CALLER", "NBOR_NAME": "V"}, "PATTERN": {"DEP": "nsubj"}},
    ]
    _DEPMATCH.add("DEP_TELEFONATA", [pattern_tel])

    pattern_cons = [
        {"SPEC": {"NODE_NAME": "V"}, "PATTERN": {"POS": "VERB", "LEMMA": {"IN": ["consegnare", "cedere", "passare", "ricevere", "ritirare"]}}},
        {"SPEC": {"NODE_NAME": "GIVER", "NBOR_NAME": "V"}, "PATTERN": {"DEP": "nsubj"}},
    ]
    _DEPMATCH.add("DEP_CONSEGNA", [pattern_cons])

# helpers to get label sets

def _lex_labels(span) -> set:
    return { span.doc.vocab.strings[m_id] for (m_id, _s, _e) in _MATCHER(span) }

def _dep_labels(span) -> set:
    return { span.doc.vocab.strings[m_id] for (m_id, _) in _DEPMATCH(span) }

def _extract(text: str) -> List[Event]:
    assert _NLP is not None
    doc = _NLP(text)

    PHONE_RE = re.compile(r'(?:\+?\d{2,3}\s?)?(?:\(?0?\d+\)?[ \-]?\d+([ \-]?\d+){1,4})')
    MONEY_RE = re.compile(r'(?:€|eur|euro)\s?[\d\.,]+', re.IGNORECASE)

    def persons(span):
        names = [e.text for e in span.ents if e.label_ == "PER"] or [t.text for t in span if t.pos_ == "PROPN"]
        out, seen = [], set()
        for n in names:
            if n not in seen: out.append(n); seen.add(n)
        return out

    def places(span):
        locs = [e.text for e in span.ents if e.label_ in ("LOC","GPE","FAC")]
        out, seen = [], set()
        for n in locs:
            if n not in seen: out.append(n); seen.add(n)
        return out

    evs: List[Event] = []
    for sent in doc.sents:
        stext = sent.text.strip()
        lex_set = _lex_labels(sent)
        if not lex_set:
            continue
        dep_set = _dep_labels(doc[sent.start:sent.end])

        participants = persons(sent)
        locs = places(sent)
        time_iso = parse_time_iso(stext)
        money = MONEY_RE.search(stext)
        phones = PHONE_RE.findall(stext)
        artefacts = (['denaro'] if money else []) + (['telefono'] if phones else [])

        def push(kind: str):
            conf = 0.6 + 0.1*bool(len(participants)>=2) + 0.1*bool(time_iso) + 0.1*bool(locs)
            e = Event(
                type=kind, text=stext, participants=participants[:4], time=time_iso,
                place_raw=locs[0] if locs else None, artefacts=artefacts,
                amount=(money.group(0) if money else None),
                source={"sent_start": sent.start_char, "sent_end": sent.end_char},
                confidence=min(1.0, conf),
            )
            e.id = make_event_id(e.type, e.participants, e.time, e.place_raw, e.source)
            evs.append(e)

        if ("TRG_INCONTRO" in lex_set) or ("DEP_INCONTRO" in dep_set):
            push("incontro")
        if ("TRG_TELEFONATA" in lex_set) or ("DEP_TELEFONATA" in dep_set):
            push("telefonata")
        if ("TRG_CONSEGNA" in lex_set) or ("DEP_CONSEGNA" in dep_set):
            push("consegna")

    def date_only(s: Optional[str]) -> str: return (s or "").split("T")[0]
    uniq = {}
    for e in evs:
        key = (e.type, date_only(e.time), (e.place_raw or "").split(",")[0].lower(), frozenset(map(str.lower, e.participants)))
        if key not in uniq or uniq[key].confidence < e.confidence:
            uniq[key] = e
    return list(uniq.values())

@app.get("/health")
def health():
    try:
        _lazy_init()
        _ = _NLP("Ping di prova.")
        return {"ok": True, "model": "it_core_news_lg"}
    except Exception as e:
        return {"ok": False, "error": type(e).__name__}

@app.post("/events")
def events(req: EventsReq):
    t0 = time.perf_counter()
    _lazy_init()
    evs = _extract(req.text)
    for e in evs:
        if req.meta:
            e.source.update(req.meta)
            e.id = make_event_id(e.type, e.participants, e.time, e.place_raw, e.source)
    return {"ok": True, "events": [e.dict() for e in evs], "latency_ms": int((time.perf_counter()-t0)*1000)}

@app.post("/events/batch")
def events_batch(req: EventsBatchReq):
    _lazy_init()
    t0 = time.perf_counter()
    out = []
    for it in req.items:
        evs = _extract(it.text)
        for e in evs:
            if it.meta:
                e.source.update(it.meta)
                e.id = make_event_id(e.type, e.participants, e.time, e.place_raw, e.source)
        out.append({"ok": True, "events": [e.dict() for e in evs], "meta": it.meta or {}})
    return {"ok": True, "results": out, "latency_ms": int((time.perf_counter()-t0)*1000)}
