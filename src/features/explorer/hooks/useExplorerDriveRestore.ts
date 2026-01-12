import { useState, useCallback } from 'react'
import { DriveInfo } from '../types'
import { FileSystemAdapter } from '../services/FileSystemAdapter'
import { ExplorerStateData } from '../services/ExplorerStateService'

export interface DriveRestoreStatus {
  status: 'idle' | 'restoring' | 'success' | 'error'
  error?: string
  unavailableDrive?: {
    path: string
    driveLetter: string
    driveLabel?: string
    driveType?: 'fixed' | 'removable' | 'optical'
    savedDriveLabel?: string
  }
}

/**
 * Hook per gestire il ripristino dello stato dell'Explorer quando si riapre una pratica.
 * Gestisce la logica complessa di ricerca del drive salvato (per path, serial number, volume label).
 */
export function useExplorerDriveRestore(
  initialState: ExplorerStateData | null,
  drives: DriveInfo[],
  adapter: FileSystemAdapter
) {
  const [restoreStatus, setRestoreStatus] = useState<DriveRestoreStatus>({ status: 'idle' })

  const restoreState = useCallback(async (
    onSuccess: (path: string) => void,
    onError: (error: string, unavailableDrive?: DriveRestoreStatus['unavailableDrive']) => void
  ) => {
    if (!initialState?.selectedPath) {
      setRestoreStatus({ status: 'idle' })
      return
    }

    setRestoreStatus({ status: 'restoring' })

    const { selectedPath, driveLetter, driveLabel, driveType, serialNumber } = initialState

    // ✅ 1. Cerca per path esatto
    let drive = drives.find(d => selectedPath.startsWith(d.path))

    if (drive) {
      // Verifica se la directory esiste ancora
      try {
        await adapter.listDir(selectedPath)
        setRestoreStatus({ status: 'success' })
        onSuccess(selectedPath)
        return
      } catch (err) {
        // Path non disponibile - drive trovato ma directory non esiste
        setRestoreStatus({
          status: 'error',
          error: `Il percorso salvato non è più disponibile: ${selectedPath}`,
          unavailableDrive: {
            path: selectedPath,
            driveLetter: drive.id,
            driveLabel: drive.label,
            driveType: drive.type,
            savedDriveLabel: driveLabel
          }
        })
        onError(`Il percorso salvato non è più disponibile: ${selectedPath}`, {
          path: selectedPath,
          driveLetter: drive.id,
          driveLabel: drive.label,
          driveType: drive.type,
          savedDriveLabel: driveLabel
        })
        return
      }
    }

    // ✅ 2. Cerca per serial number (più affidabile per USB/CD)
    if (serialNumber && (driveType === 'removable' || driveType === 'optical')) {
      const foundBySerial = drives.find(d =>
        (d.type === 'removable' || d.type === 'optical') &&
        d.serialNumber === serialNumber
      )

      if (foundBySerial) {
        const deviceType = driveType === 'removable' ? 'chiavetta USB' : 'DVD/CD'
        const errorMsg = `La ${deviceType} "${driveLabel || foundBySerial.label}" è stata trovata ma su un drive diverso (${foundBySerial.id} invece di ${driveLetter}). Seleziona la directory corretta.`

        setRestoreStatus({
          status: 'error',
          error: errorMsg,
          unavailableDrive: {
            path: selectedPath,
            driveLetter: foundBySerial.id,
            driveLabel: foundBySerial.label,
            driveType: foundBySerial.type,
            savedDriveLabel: driveLabel
          }
        })
        onError(errorMsg, {
          path: selectedPath,
          driveLetter: foundBySerial.id,
          driveLabel: foundBySerial.label,
          driveType: foundBySerial.type,
          savedDriveLabel: driveLabel
        })
        return
      }
    }

    // ✅ 3. Cerca per volume label (fallback se serial number non disponibile)
    if (driveLabel && (driveType === 'removable' || driveType === 'optical')) {
      const foundByLabel = drives.find(d =>
        (d.type === 'removable' || d.type === 'optical') &&
        d.label === driveLabel &&
        d.label !== d.id // Assicurati che sia un volume label reale, non solo la lettera
      )

      if (foundByLabel) {
        const deviceType = driveType === 'removable' ? 'chiavetta USB' : 'DVD/CD'
        const errorMsg = `La ${deviceType} "${driveLabel}" è stata trovata ma su un drive diverso (${foundByLabel.id} invece di ${driveLetter}). Seleziona la directory corretta.`

        setRestoreStatus({
          status: 'error',
          error: errorMsg,
          unavailableDrive: {
            path: selectedPath,
            driveLetter: foundByLabel.id,
            driveLabel: foundByLabel.label,
            driveType: foundByLabel.type,
            savedDriveLabel: driveLabel
          }
        })
        onError(errorMsg, {
          path: selectedPath,
          driveLetter: foundByLabel.id,
          driveLabel: foundByLabel.label,
          driveType: foundByLabel.type,
          savedDriveLabel: driveLabel
        })
        return
      }
    }

    // ✅ 4. Drive non trovato
    const deviceType = driveType === 'removable' ? 'chiavetta USB' : driveType === 'optical' ? 'DVD/CD' : 'drive'
    const errorMsg = `Il ${deviceType} "${driveLetter}"${driveLabel ? ` (${driveLabel})` : ''} non è più disponibile. Verifica che sia collegato.`

    setRestoreStatus({
      status: 'error',
      error: errorMsg,
      unavailableDrive: {
        path: selectedPath,
        driveLetter: driveLetter || '',
        driveType: driveType || 'removable',
        savedDriveLabel: driveLabel
      }
    })
    onError(errorMsg, {
      path: selectedPath,
      driveLetter: driveLetter || '',
      driveType: driveType || 'removable',
      savedDriveLabel: driveLabel
    })
  }, [initialState, drives, adapter])

  return { restoreStatus, restoreState }
}
