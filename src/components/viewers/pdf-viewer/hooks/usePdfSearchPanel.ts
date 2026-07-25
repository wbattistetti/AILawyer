/**
 * Compatibilità temporanea: lo stato del pannello ora è condiviso tra i viewer.
 */

export {
  useDocumentSearchPanel as usePdfSearchPanel,
  type DocumentSearchPanelState as UsePdfSearchPanelReturn
} from '../../../search/useDocumentSearchPanel'
