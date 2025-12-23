

"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getCampaignMessageStats } from "@/actions/reportingActions";
import type { CampaignMessageStats } from "@/actions/reportingActions";
import { Loader2, AlertTriangle, CalendarIcon, CheckCircle, XCircle } from "lucide-react";
import { format, subDays, startOfMonth } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";

export function CampaignReportTable() {
    const [stats, setStats] = useState<CampaignMessageStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: startOfMonth(new Date()),
        to: new Date(),
    });

    const fetchStats = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const filters: any = {};
            if (dateRange?.from) filters.dateFrom = dateRange.from.toISOString();
            if (dateRange?.to) {
                const endDate = new Date(dateRange.to);
                endDate.setHours(23, 59, 59, 999);
                filters.dateTo = endDate.toISOString();
            }

            const result = await getCampaignMessageStats(filters);
            if (result.error) {
                setError(result.error);
            } else {
                setStats(result.stats || []);
            }
        } catch (e: any) {
            setError(e.message || "Un error inesperado ocurrió.");
        } finally {
            setIsLoading(false);
        }
    }, [dateRange]);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);
    
    const presetDateRanges = [
      { label: "Hoy", range: { from: new Date(), to: new Date() } },
      { label: "Últimos 7 días", range: { from: subDays(new Date(), 6), to: new Date() } },
      { label: "Este mes", range: { from: startOfMonth(new Date()), to: new Date() } },
    ];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
                <h3 className="text-lg font-medium">Filtros del Reporte</h3>
                 <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="date"
                        variant={"outline"}
                        className={cn(
                          "w-[240px] justify-start text-left font-normal",
                          !dateRange && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                          dateRange.to ? (
                            <>
                              {format(dateRange.from, "LLL dd, y")} -{" "}
                              {format(dateRange.to, "LLL dd, y")}
                            </>
                          ) : (
                            format(dateRange.from, "LLL dd, y")
                          )
                        ) : (
                          <span>Elige una fecha</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                       <div className="flex flex-col sm:flex-row">
                        <div className="p-2 border-r">
                           {presetDateRanges.map(preset => (
                            <Button
                              key={preset.label}
                              variant="ghost"
                              className="w-full justify-start text-sm"
                              onClick={() => setDateRange(preset.range)}
                            >
                              {preset.label}
                            </Button>
                          ))}
                        </div>
                        <Calendar
                            initialFocus
                            mode="range"
                            defaultMonth={dateRange?.from}
                            selected={dateRange}
                            onSelect={setDateRange}
                            numberOfMonths={1}
                            locale={es}
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
            </div>
             {isLoading ? (
                <div className="flex justify-center items-center py-10">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : error ? (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Error al Cargar Reporte</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            ) : (
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[40%]">Campaña</TableHead>
                                <TableHead className="text-center">Total Enviados</TableHead>
                                <TableHead className="text-center">Exitosos</TableHead>
                                <TableHead className="text-center">Fallidos</TableHead>
                                <TableHead className="w-[20%] text-center">Tasa de Éxito</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {stats.length > 0 ? (
                                stats.map((stat) => {
                                    const successRate = stat.totalSent > 0 ? (stat.successful / stat.totalSent) * 100 : 0;
                                    return (
                                        <TableRow key={stat.campaignId}>
                                            <TableCell className="font-medium">{stat.campaignName}</TableCell>
                                            <TableCell className="text-center font-mono">{stat.totalSent}</TableCell>
                                            <TableCell className="text-center font-mono text-green-600">
                                                <div className="flex items-center justify-center gap-1">
                                                    <CheckCircle className="h-4 w-4"/>
                                                    {stat.successful}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center font-mono text-red-600">
                                                <div className="flex items-center justify-center gap-1">
                                                    <XCircle className="h-4 w-4"/>
                                                    {stat.failed}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-center">
                                                <div className="flex items-center gap-2 justify-center">
                                                    <Progress value={successRate} className="w-2/3 h-2" />
                                                    <span className="text-xs font-mono">{successRate.toFixed(1)}%</span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        No se encontraron datos de envío para el período seleccionado.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}

