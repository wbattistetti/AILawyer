from pathlib import Path

path = Path(r"src/components/pages/PraticaCanvasPage.tsx")
text = path.read_text(encoding="utf-8")

old_state = """  const [, setPersonDraftVersion] = useState(0)
  const [, setEntityDraftVersion] = useState(0)
"""
new_state = """  const [personDraftVersion, setPersonDraftVersion] = useState(0)
  const [entityDraftVersion, setEntityDraftVersion] = useState(0)
"""
if old_state in text:
    text = text.replace(old_state, new_state, 1)
    print("state vars fixed")
elif "const [personDraftVersion, setPersonDraftVersion]" in text:
    print("state vars already ok")
else:
    raise SystemExit("state marker not found")

needle = "Niente tab Anagrafiche/Entità finché non c'è stata almeno un'estrazione"
if needle in text:
    print("effect already present")
else:
    # Place after workspace manager / dock ref is available.
    marker = """  const {
    viewMode,
    setViewMode,
    dockV2Ref,
    persistViewMode
  } = useWorkspaceManager(id)
"""
    if marker not in text:
        # try without trailing spaces differences - find a shorter unique marker
        idx = text.find("= useWorkspaceManager(id)")
        if idx < 0:
            raise SystemExit("workspace manager not found")
        end = text.find("\n", idx)
        insert_at = end + 1
        effect = """
  // Niente tab Anagrafiche/Entità finché non c'è stata almeno un'estrazione.
  useEffect(() => {
    if (!id || !documentsLoaded) return
    const personDraftState = getPersonDraft(id)
    if (personDraftState && !personDraftState.hasExtracted && !personDraftState.extracting) {
      dockV2Ref.current?.closePersons()
    }
    const entityDraftState = getEntityDraft(id)
    if (entityDraftState && !entityDraftState.hasExtracted && !entityDraftState.extracting) {
      dockV2Ref.current?.closeEntities()
    }
  }, [id, documentsLoaded, personDraftVersion, entityDraftVersion, dockV2Ref])
"""
        text = text[:insert_at] + effect + text[insert_at:]
        print("effect inserted after workspace manager (fallback)")
    else:
        effect = marker + """
  // Niente tab Anagrafiche/Entità finché non c'è stata almeno un'estrazione.
  useEffect(() => {
    if (!id || !documentsLoaded) return
    const personDraftState = getPersonDraft(id)
    if (personDraftState && !personDraftState.hasExtracted && !personDraftState.extracting) {
      dockV2Ref.current?.closePersons()
    }
    const entityDraftState = getEntityDraft(id)
    if (entityDraftState && !entityDraftState.hasExtracted && !entityDraftState.extracting) {
      dockV2Ref.current?.closeEntities()
    }
  }, [id, documentsLoaded, personDraftVersion, entityDraftVersion, dockV2Ref])
"""
        text = text.replace(marker, effect, 1)
        print("effect inserted after workspace manager")

path.write_text(text, encoding="utf-8")
