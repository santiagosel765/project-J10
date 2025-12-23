
"use client"; 

import type { ReactNode } from 'react';
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { Campaign, Template, MessageLog, MessageStatus, CampaignStatus } from "@/lib/mock-data";
import type { UserRecord } from "@/actions/userActions";
import type { User } from 'next-auth';
import { getAllMessageLogs } from "@/actions/messageLogActions";

import { StatCard } from "@/components/dashboard/StatCard";
import { MessageLogTable } from "@/components/dashboard/MessageLogTable";
import { CampaignCalendar } from "@/components/dashboard/CampaignCalendar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, FileText, Users, CalendarIcon, FilterIcon, ListFilter, CheckCircle, CalendarDays, Mail, Phone, Loader2, Users2, ListChecks } from "lucide-react";
import { format, parseISO, isValid, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { es } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { WhatsappIcon } from '../icons/WhatsappIcon';
import { SmsIcon } from '../icons/SmsIcon';

type CampaignStatusFilter = CampaignStatus | 'all';
type CampaignTypeFilter = Campaign['type'] | 'all';
type TemplateFilterId = string | 'all';

interface DashboardClientViewProps {
  initialCampaigns: Campaign[];
  initialTemplates: Template[];
  initialUsers: Omit<UserRecord, 'hashedPassword'>[];
  currentUser: User | null;
}

export function DashboardClientView({
  initialCampaigns,
  initialTemplates,
  initialUsers,
  currentUser,
}: DashboardClientViewProps) {
  const [rawCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [rawTemplates] = useState<Template[]>(initialTemplates);
  const [rawMessageLogs, setRawMessageLogs] = useState<MessageLog[]>([]);
  
  const isFirstLoad = useRef(true);
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date()
  });
  const [campaignTypeFilter, setCampaignTypeFilter] = useState<CampaignTypeFilter>('all');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState<CampaignStatusFilter>('all');
  const [templateFilterId, setTemplateFilterId] = useState<TemplateFilterId>('all');
  
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);
  const [hasPreviousPage, setHasPreviousPage] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [itemsPerPage] = useState<number>(10);

  const fetchFilteredMessageLogs = useCallback(async (pageToFetch: number) => {
    setIsLoading(true);
    
    const filters: any = {
      page: pageToFetch,
      limit: itemsPerPage
    };
    
    if (templateFilterId !== 'all') filters.templateId = templateFilterId;
    if (dateRange?.from) filters.dateFrom = dateRange.from.toISOString();
    if (dateRange?.to) {
      const endDate = new Date(dateRange.to);
      endDate.setHours(23, 59, 59, 999);
      filters.dateTo = endDate.toISOString();
    }

    try {
      const result = await getAllMessageLogs(filters);

      if (result.messageLogs) {
        setRawMessageLogs(result.messageLogs);
        setTotalCount(result.totalCount || 0);
        setCurrentPage(result.currentPage || 1);
        setTotalPages(result.totalPages || 0);
        setHasNextPage(result.hasNextPage || false);
        setHasPreviousPage(result.hasPreviousPage || false);
      }
    } catch(err) {
      console.error("Failed to fetch message logs:", err);
      setRawMessageLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [templateFilterId, dateRange, itemsPerPage]);
  
  useEffect(() => {
    fetchFilteredMessageLogs(currentPage);
  }, [currentPage, fetchFilteredMessageLogs]);

  useEffect(() => {
    if (!isFirstLoad.current) {
        fetchFilteredMessageLogs(1);
    } else {
        isFirstLoad.current = false;
    }
  }, [dateRange, templateFilterId, campaignStatusFilter, campaignTypeFilter]);


  const filteredMessageLogs = useMemo(() => {
    return rawMessageLogs.filter(log => {
      if (!log.sent_at) return false; 
      
      const campaignOfLog = rawCampaigns.find(c => c.id === log.campaignId);
      
      const typeMatchForLog = campaignTypeFilter === 'all' || 
                              (log.campaignId.startsWith('collections') || log.campaignId.startsWith('preventive-collections')) ||
                              (campaignOfLog && campaignOfLog.type === campaignTypeFilter);
      
      const campaignStatusForLogMatch = campaignStatusFilter === 'all' || 
                                       (log.campaignId.startsWith('collections') || log.campaignId.startsWith('preventive-collections')) ||
                                       (campaignOfLog && campaignOfLog.status === campaignStatusFilter);

      return typeMatchForLog && campaignStatusForLogMatch;
    });
  }, [rawMessageLogs, campaignTypeFilter, campaignStatusFilter, rawCampaigns]);

  const [activeMessageFiltersDescription, setActiveMessageFiltersDescription] = useState<string>('');
  
  const totalCampaigns = rawCampaigns.length;
  const totalTemplates = rawTemplates.length;
  const activeCampaignsCount = rawCampaigns.filter(c => c.status === 'Aprobada').length;
  const totalRecipients = rawCampaigns.reduce((sum, campaign) => sum + (campaign.recipientsCount || 0), 0);
  
  useEffect(() => {
    let descriptionParts: string[] = [];
    if (dateRange?.from) {
        const from = format(dateRange.from, "P", { locale: es });
        const to = dateRange.to ? format(dateRange.to, "P", { locale: es }) : 'Ahora';
        descriptionParts.push(`Fechas: ${from} - ${to}`);
    }
    if (templateFilterId !== 'all') {
      const selectedTemplateObject = rawTemplates.find(t => t.id === templateFilterId);
      const templateName = selectedTemplateObject ? selectedTemplateObject.name : `ID ${templateFilterId}`;
      descriptionParts.push(`Plantilla: ${templateName}`);
    }
     if (campaignTypeFilter !== 'all') {
      descriptionParts.push(`Tipo Camp.: ${campaignTypeFilter}`);
    }
    if (campaignStatusFilter !== 'all') {
      descriptionParts.push(`Estado Camp.: ${campaignStatusFilter}`);
    }

    if (descriptionParts.length > 0) {
      setActiveMessageFiltersDescription(`(${descriptionParts.join(', ')})`);
    } else {
      setActiveMessageFiltersDescription('(Sin filtros activos)');
    }
  }, [dateRange, templateFilterId, rawTemplates, campaignTypeFilter, campaignStatusFilter]);

  const handleNextPage = () => {
    if (hasNextPage) {
      setCurrentPage(prev => prev + 1);
    }
  };

  const handlePreviousPage = () => {
    if (hasPreviousPage) {
       setCurrentPage(prev => prev - 1);
    }
  };

  const handleGoToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };
  
  const presetDateRanges = [
    { label: "Hoy", range: { from: new Date(), to: new Date() } },
    { label: "Ayer", range: { from: subDays(new Date(), 1), to: subDays(new Date(), 1) } },
    { label: "Últimos 7 días", range: { from: subDays(new Date(), 6), to: new Date() } },
    { label: "Últimos 30 días", range: { from: subDays(new Date(), 29), to: new Date() } },
    { label: "Este mes", range: { from: startOfMonth(new Date()), to: endOfMonth(new Date()) } },
    { label: "Mes pasado", range: { from: startOfMonth(subDays(startOfMonth(new Date()), 1)), to: endOfMonth(subDays(startOfMonth(new Date()), 1))}},
    { label: "Este año", range: { from: startOfYear(new Date()), to: endOfYear(new Date()) } },
  ];

  return (
    <div className="space-y-6">
      <Card className="shadow-md">
          <CardHeader>
              <CardTitle className="flex items-center"><CalendarDays className="mr-2 h-5 w-5 text-primary"/>Calendario de Campañas</CardTitle>
              <CardDescription>Planificación visual de campañas aprobadas. Haz clic en un evento para ver los detalles.</CardDescription>
          </CardHeader>
          <CardContent className="h-[600px] w-full pt-0">
              <CampaignCalendar campaigns={rawCampaigns} />
          </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard 
              title="Campañas Totales" 
              value={totalCampaigns.toString()}
              icon={<Package className="h-10 w-10" />}
          />
          <StatCard 
              title="Plantillas Totales" 
              value={totalTemplates.toString()}
              icon={<FileText className="h-10 w-10" />}
          />
          <StatCard 
              title="Campañas Activas" 
              value={activeCampaignsCount.toString()} 
              description="Aprobadas" 
              icon={<ListChecks className="h-10 w-10" />}
          />
          <StatCard 
              title="Destinatarios" 
              value={totalRecipients.toLocaleString()} 
              description="Estimado" 
              icon={<Users2 className="h-10 w-10" />}
          />
      </div>
      
      <Card className="shadow-md">
         <CardHeader>
            <CardTitle className="flex items-center"><FilterIcon className="mr-2 h-5 w-5 text-primary" />Filtros de Logs y Campañas</CardTitle>
            <CardDescription>Aplica filtros para refinar los logs de mensajes que se muestran en la tabla de abajo.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                <div>
                  <label htmlFor="log-date-range" className="block text-sm font-medium text-muted-foreground mb-1">Rango de Fechas (Envío)</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="log-date-range"
                        variant={"outline"}
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !dateRange && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                          dateRange.to ? (
                            <>
                              {format(dateRange.from, "LLL dd, y", { locale: es })} -{" "}
                              {format(dateRange.to, "LLL dd, y", { locale: es })}
                            </>
                          ) : (
                            format(dateRange.from, "LLL dd, y", { locale: es })
                          )
                        ) : (
                          <span>Selecciona un rango</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <div className="flex flex-col sm:flex-row">
                        <div className="p-2 border-r">
                          <p className="text-sm font-medium px-2 py-1">Predefinidos</p>
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
                          <Button
                              variant="ghost"
                              className="w-full justify-start text-sm mt-2"
                              onClick={() => setDateRange(undefined)}
                            >
                              Limpiar Rango
                            </Button>
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
                <div>
                    <label htmlFor="log-template-filter" className="block text-sm font-medium text-muted-foreground mb-1">Plantilla</label>
                    <Select value={templateFilterId} onValueChange={(value: TemplateFilterId) => setTemplateFilterId(value)}>
                      <SelectTrigger id="log-template-filter">
                        <SelectValue placeholder="Todas" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las Plantillas</SelectItem>
                        {rawTemplates.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name} ({template.type.toUpperCase()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                </div>
                <div>
                    <label htmlFor="campaign-status" className="block text-sm font-medium text-muted-foreground mb-1">Estado de Campaña</label>
                    <Select value={campaignStatusFilter} onValueChange={(value: CampaignStatusFilter) => setCampaignStatusFilter(value)}>
                      <SelectTrigger id="campaign-status">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los Estados</SelectItem>
                        <SelectItem value="Aprobada">Aprobada</SelectItem>
                        <SelectItem value="Enviada">Enviada</SelectItem>
                        <SelectItem value="Borrador">Borrador</SelectItem>
                        <SelectItem value="Solicitud">Solicitud</SelectItem>
                        <SelectItem value="Error Interno">Error Interno</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
                <div>
                    <label htmlFor="campaign-type" className="block text-sm font-medium text-muted-foreground mb-1">Tipo de Campaña</label>
                    <Select value={campaignTypeFilter} onValueChange={(value: CampaignTypeFilter) => setCampaignTypeFilter(value)}>
                      <SelectTrigger id="campaign-type">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los Tipos</SelectItem>
                        <SelectItem value="whatsapp">WhatsApp</SelectItem>
                        <SelectItem value="sms">SMS</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="llamada">Llamada</SelectItem>
                      </SelectContent>
                    </Select>
                </div>
            </div>
        </CardContent>
      </Card>

      <Card className="shadow-md">
        <CardHeader>
          <CardTitle>
            Logs de Mensajes Enviados
          </CardTitle>
          <CardDescription>
             Mostrando logs de mensajes según los filtros aplicados {activeMessageFiltersDescription}.
             {filteredMessageLogs.length === 0 && !isLoading && " No hay logs que coincidan."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MessageLogTable 
            messageLogs={filteredMessageLogs} 
            templates={rawTemplates}
            currentPage={currentPage}
            totalCount={totalCount}
            totalPages={totalPages}
            hasNextPage={hasNextPage}
            hasPreviousPage={hasPreviousPage}
            isLoading={isLoading}
            itemsPerPage={itemsPerPage}
            onNextPage={handleNextPage}
            onPreviousPage={handlePreviousPage}
            onGoToPage={handleGoToPage}
          />
        </CardContent>
      </Card>

    </div>
  );
}
