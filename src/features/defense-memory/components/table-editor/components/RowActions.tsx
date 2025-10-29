import React from 'react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RowActionsProps {
    onDelete: () => void
    onMoveUp?: () => void
    onMoveDown?: () => void
    canMoveUp?: boolean
    canMoveDown?: boolean
    readOnly?: boolean
    className?: string
}

export const RowActions: React.FC<RowActionsProps> = ({
    onDelete,
    onMoveUp,
    onMoveDown,
    canMoveUp = false,
    canMoveDown = false,
    readOnly = false,
    className = ''
}) => {
    return (
        <div className={cn(
            "flex items-center justify-center w-12 h-12",
            className
        )}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                    >
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    {onMoveUp && (
                        <DropdownMenuItem
                            onClick={onMoveUp}
                            disabled={!canMoveUp || readOnly}
                        >
                            <ChevronUp className="mr-2 h-4 w-4" />
                            Sposta su
                        </DropdownMenuItem>
                    )}

                    {onMoveDown && (
                        <DropdownMenuItem
                            onClick={onMoveDown}
                            disabled={!canMoveDown || readOnly}
                        >
                            <ChevronDown className="mr-2 h-4 w-4" />
                            Sposta giù
                        </DropdownMenuItem>
                    )}

                    <DropdownMenuItem
                        onClick={onDelete}
                        disabled={readOnly}
                        className="text-red-600 focus:text-red-600"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Elimina
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
