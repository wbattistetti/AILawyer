from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Literal, Tuple
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


class NerReviewItem(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    snippet: str = Field(min_length=1, max_length=500)
    expectedType: Literal["institution", "company", "venue"]
    candidateSpan: Tuple[int, int]
    candidateLabel: str = Field(min_length=1, max_length=300)


class NerReviewBatchReq(BaseModel):
    items: List[NerReviewItem] = Field(min_items=1, max_items=500)


class NerReviewResult(BaseModel):
    id: str
    decision: Literal["confirmed", "corrected", "rejected", "uncertain"]
    correctedSpan: Optional[Tuple[int, int]] = None
    detectedLabel: Optional[str] = None
    modelId: str

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

def _load_italian_ner():
    """Preferisce lg; se assente usa md. Fallisce subito se nessun modello è installato."""
    import spacy
    last_error: Optional[Exception] = None
    for model_id in ("it_core_news_lg", "it_core_news_md"):
        try:
            return spacy.load(model_id)
        except OSError as error:
            last_error = error
    raise RuntimeError(
        "Modello spaCy italiano mancante. Installa uno tra: "
        "python -m spacy download it_core_news_md "
        "oppure python -m spacy download it_core_news_lg"
    ) from last_error


def _ensure_nlp():
    """Carica solo il modello NER; indipendente dai matcher eventi."""
    global _NLP
    if _NLP is None:
        _NLP = _load_italian_ner()
    return _NLP


def _lazy_init():
    """Inizializza modello + matcher usati dall’estrattore eventi."""
    global _MATCHER, _DEPMATCH
    nlp = _ensure_nlp()
    if _MATCHER is not None and _DEPMATCH is not None:
        return
    from spacy.matcher import Matcher, DependencyMatcher
    _MATCHER = Matcher(nlp.vocab)
    _DEPMATCH = DependencyMatcher(nlp.vocab)

    _MATCHER.add("TRG_INCONTRO", [[{"LEMMA":{"IN":["incontrare","vedere"]}}],
                                   [{"LOWER":"in"},{"LOWER":"compagnia"},{"LOWER":"di"}],
                                   [{"LEMMA":{"IN":["riunire","appuntare"]}}]])
    _MATCHER.add("TRG_TELEFONATA", [[{"LEMMA":{"IN":["telefonare","chiamare","contattare","conversare"]}}],
                                     [{"LOWER":"colloquio"},{"LOWER":"telefonico"}]])
    _MATCHER.add("TRG_CONSEGNA", [[{"LEMMA":{"IN":["consegnare","cedere","passare","ricevere","ritirare"]}}]])

    pattern_incontro = [
        {
            "RIGHT_ID": "V",
            "RIGHT_ATTRS": {"POS": "VERB", "LEMMA": {"IN": ["incontrare", "vedere", "riunire"]}},
        },
        {
            "LEFT_ID": "V",
            "REL_OP": ">",
            "RIGHT_ID": "A",
            "RIGHT_ATTRS": {"DEP": "nsubj"},
        },
    ]
    _DEPMATCH.add("DEP_INCONTRO", [pattern_incontro])

    pattern_tel = [
        {
            "RIGHT_ID": "V",
            "RIGHT_ATTRS": {"POS": "VERB", "LEMMA": {"IN": ["telefonare", "chiamare", "contattare"]}},
        },
        {
            "LEFT_ID": "V",
            "REL_OP": ">",
            "RIGHT_ID": "CALLER",
            "RIGHT_ATTRS": {"DEP": "nsubj"},
        },
    ]
    _DEPMATCH.add("DEP_TELEFONATA", [pattern_tel])

    pattern_cons = [
        {
            "RIGHT_ID": "V",
            "RIGHT_ATTRS": {"POS": "VERB", "LEMMA": {"IN": ["consegnare", "cedere", "passare", "ricevere", "ritirare"]}},
        },
        {
            "LEFT_ID": "V",
            "REL_OP": ">",
            "RIGHT_ID": "GIVER",
            "RIGHT_ATTRS": {"DEP": "nsubj"},
        },
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


def _review_ner_item(item: NerReviewItem) -> NerReviewResult:
    """Conferma/corregge confini conservativamente; l'assenza NER resta uncertain."""
    assert _NLP is not None
    start, end = item.candidateSpan
    if start < 0 or end <= start or end > len(item.snippet):
        raise ValueError(f"{item.id}: candidateSpan fuori dallo snippet")
    if item.snippet[start:end] != item.candidateLabel:
        raise ValueError(f"{item.id}: candidateLabel non coincide con candidateSpan")

    doc = _NLP(item.snippet)
    compatible = (
        {"ORG"}
        if item.expectedType in {"institution", "company"}
        else {"ORG", "LOC", "MISC", "FAC"}
    )
    candidates = [
        ent for ent in doc.ents
        if ent.label_ in compatible and ent.end_char > start and ent.start_char < end
    ]
    if not candidates:
        return NerReviewResult(
            id=item.id,
            decision="uncertain",
            correctedSpan=None,
            detectedLabel=None,
            modelId=_NLP.meta.get("name", "it_core_news_lg"),
        )

    best = max(
        candidates,
        key=lambda ent: min(end, ent.end_char) - max(start, ent.start_char),
    )
    corrected = (best.start_char, best.end_char)
    decision = "confirmed" if corrected == (start, end) else "corrected"
    return NerReviewResult(
        id=item.id,
        decision=decision,
        correctedSpan=corrected,
        detectedLabel=best.label_,
        modelId=_NLP.meta.get("name", "it_core_news_lg"),
    )

@app.get("/health")
def health():
    try:
        nlp = _ensure_nlp()
        _ = nlp("Ping di prova.")
        return {"ok": True, "model": nlp.meta.get("name", "unknown")}
    except Exception as e:
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}

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


@app.post("/ner/review-snippets")
def review_ner_snippets(req: NerReviewBatchReq):
    """Rivede in batch candidati canonici; non scarta su semplice assenza di match."""
    nlp = _ensure_nlp()
    t0 = time.perf_counter()
    try:
        results = [_review_ner_item(item) for item in req.items]
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {
        "ok": True,
        "results": [result.dict() for result in results],
        "latency_ms": int((time.perf_counter() - t0) * 1000),
        "model": nlp.meta.get("name", "unknown"),
    }
