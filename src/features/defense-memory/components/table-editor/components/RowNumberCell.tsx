import React from 'react'
import { cn } from '@/lib/utils'

interface RowNumberCellProps {
    order: number
    className?: string
}

export const RowNumberCell: React.FC<RowNumberCellProps> = ({
    order,
    className = ''
}) => {
    return (
        <div className={cn(
            "flex items-center justify-center w-12 h-12 bg-gray-100 border-r border-gray-200 font-medium text-sm text-gray-700",
            className
        )}>
            {order}
        </div>
    )
}
