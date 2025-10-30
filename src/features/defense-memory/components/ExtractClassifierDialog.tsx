import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ExtractClassifier } from './ExtractClassifier'
import { Estratto } from '@/types'

interface ExtractClassifierDialogProps {
    open: boolean
    praticaId: string
    extractContent: string
    sourceDoc: {
        id: string
        title: string
        page: number
        bbox?: { x: number; y: number; width: number; height: number }
    }
    onSuccess: (estratto: Estratto) => void
    onCancel: () => void
}

export const ExtractClassifierDialog: React.FC<ExtractClassifierDialogProps> = ({
    open,
    praticaId,
    extractContent,
    sourceDoc,
    onSuccess,
    onCancel
}) => {
    console.log('🎬🎬🎬 [ExtractClassifierDialog] DIALOG MONTATO! 🎬🎬🎬')
    console.log('🎬 [ExtractClassifierDialog] open:', open)
    console.log('🎬 [ExtractClassifierDialog] praticaId:', praticaId)
    console.log('🎬 [ExtractClassifierDialog] extractContent length:', extractContent?.length)

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Classifica Estratto - Analisi atti</DialogTitle>
                </DialogHeader>
                <ExtractClassifier
                    praticaId={praticaId}
                    extractContent={extractContent}
                    sourceDoc={sourceDoc}
                    onSuccess={onSuccess}
                    onCancel={onCancel}
                />
            </DialogContent>
        </Dialog>
    )
}

