
"use client";

import { useEffect, useState } from 'react';
import { Building2, Bot } from 'lucide-react';
import { getGerenciaUsageStats } from '@/actions/gerenciaActions';
import type { GerenciaUsageStats as GerenciaUsageStatsType } from '@/actions/gerenciaActions';
import { Skeleton } from '@/components/ui/skeleton';
import { WhatsappIcon } from '@/components/icons/WhatsappIcon';
import { SmsIcon } from '@/components/icons/SmsIcon';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';


export function GerenciaUsageStats() {
    const [stats, setStats] = useState<GerenciaUsageStatsType | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchStats() {
            try {
                const result = await getGerenciaUsageStats();
                if (result.error) {
                    setError(result.error);
                } else if (result.stats) {
                    setStats(result.stats);
                }
            } catch (err: any) {
                setError(err.message || "Error inesperado");
            } finally {
                setIsLoading(false);
            }
        }
        fetchStats();
    }, []);

    const getPercentageColor = (percentage: number) => {
        if (percentage > 75) return 'text-destructive';
        if (percentage > 25) return 'text-orange-500';
        return 'text-green-500';
    };

    if (isLoading) {
        return <Skeleton className="h-8 w-64" />;
    }

    if (error || !stats) {
        // Don't render anything on error or if no stats, to keep header clean
        return null;
    }

    return (
        <TooltipProvider>
            <div className="hidden md:flex items-center gap-4 bg-muted/50 border border-border rounded-lg px-3 py-1.5 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Building2 className="h-5 w-5" />
                    <span className="font-semibold text-foreground">{stats.gerenciaName}</span>
                </div>
                <div className="h-6 w-px bg-border"></div>
                <div className="flex items-center gap-4">
                     <Tooltip>
                        <TooltipTrigger asChild>
                           <div className="flex items-center gap-2 cursor-default">
                                <WhatsappIcon className="h-5 w-5 text-green-500" />
                                <div className='flex items-baseline gap-1.5'>
                                    <span className={cn("font-bold tabular-nums", getPercentageColor(stats.whatsapp.percentage))}>
                                        {stats.whatsapp.percentage}%
                                    </span>
                                    <span className='text-xs text-muted-foreground tabular-nums'>
                                        ({stats.whatsapp.sent.toLocaleString()}/{stats.whatsapp.max.toLocaleString()})
                                    </span>
                                </div>
                           </div>
                        </TooltipTrigger>
                        <TooltipContent>
                           <p>WhatsApp: {stats.whatsapp.sent.toLocaleString()} / {stats.whatsapp.max.toLocaleString()} enviados este mes</p>
                        </TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 cursor-default">
                                <SmsIcon className="h-5 w-5 text-blue-500" />
                                <div className='flex items-baseline gap-1.5'>
                                    <span className={cn("font-bold tabular-nums", getPercentageColor(stats.sms.percentage))}>
                                        {stats.sms.percentage}%
                                    </span>
                                    <span className='text-xs text-muted-foreground tabular-nums'>
                                        ({stats.sms.sent.toLocaleString()}/{stats.sms.max.toLocaleString()})
                                    </span>
                                </div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>SMS: {stats.sms.sent.toLocaleString()} / {stats.sms.max.toLocaleString()} enviados este mes</p>
                        </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 cursor-default">
                                <Bot className="h-5 w-5 text-cyan-500" />
                                <div className='flex items-baseline gap-1.5'>
                                    <span className={cn("font-bold tabular-nums", getPercentageColor(stats.aiCalls.percentage))}>
                                        {stats.aiCalls.percentage}%
                                    </span>
                                    <span className='text-xs text-muted-foreground tabular-nums'>
                                        ({stats.aiCalls.sent.toLocaleString()}/{stats.aiCalls.max.toLocaleString()})
                                    </span>
                                </div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Llamadas IA: {stats.aiCalls.sent.toLocaleString()} / {stats.aiCalls.max.toLocaleString()} realizadas este mes</p>
                        </TooltipContent>
                    </Tooltip>
                </div>
            </div>
        </TooltipProvider>
    );
}
