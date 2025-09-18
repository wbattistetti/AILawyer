export function preclean(raw: string) {
  let s = (raw || '').trim();
  // remove c/o or presso blocks, keep remainder
  const co = s.match(/(?:c\/o|presso)\s+([^,;]+)/i);
  if (co && typeof co.index === 'number') {
    s = (s.slice(0, co.index) + s.slice(co.index + co[0].length)).replace(/\s{2,}/g, ' ').trim();
  }
  // cut tail after first prefix occurrence anywhere
  const pref = /(ivi\s+residente\s+in|residente\s+in|domiciliat[oa]\s+in|dom\.\s*in|con\s+domicilio\s+eletto\s+presso)/i;
  const m = s.match(pref);
  if (m && typeof m.index === 'number') s = s.slice(m.index + m[0].length).replace(/^[,;\s]+/, '');
  // aliases
  s = s.replace(/\bP\.zza\b/gi, 'Piazza')
       .replace(/\bP\.za\b/gi, 'Piazza')
       .replace(/\bV\.le\b/gi, 'Viale')
       .replace(/\bV\.lo\b/gi, 'Vicolo')
       .replace(/\bC\.so\b/gi, 'Corso')
       .replace(/\bL\.go\b/gi, 'Largo')
       .replace(/\bS\.N\.C\.?\b/gi, 'SNC')
       .replace(/\bK[Mm]\b/g, 'KM');
  return s.replace(/\s+/g, ' ').trim();
}




