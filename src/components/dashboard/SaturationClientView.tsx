

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useDebounce } from 'use-debounce';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, ChevronLeft, ChevronRight, AlertCircle, Tag, Filter, X, Calendar } from 'lucide-react';
import { getContactInCampaignsFrequency, excludeContactFromCampaign } from '@/actions/saturationActions';
import type { ContactFrequencyInCampaigns } from '@/actions/saturationActions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { CampaignCategory } from '@/lib/mock-data';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const campaignCategories: CampaignCategory[] = ["Ventas", "Marketing", "Cobranza", "Prevencion", "Comunicado"];

export function SaturationClientView() {
  const [stats, setStats] = useState<ContactFrequencyInCampaigns[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [frequencyFilter, setFrequencyFilter] = useState<number | undefined>(2);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  const [debouncedSearchTerm] = useDebounce(searchTerm, 500);
  const [debouncedFrequencyFilter] = useDebounce(frequencyFilter, 500);

  const itemsPerPage = 25;
  const totalPages = Math.ceil(totalCount / itemsPerPage);
  const { toast } = useToast();

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });


  const fetchStats = useCallback(async (page: number) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getContactInCampaignsFrequency({
        page,
        limit: itemsPerPage,
        contactSearch: debouncedSearchTerm,
        frequency: debouncedFrequencyFilter,
        category: categoryFilter === 'all' ? undefined : categoryFilter,
      });
      if (result.error) {
        setError(result.error);
        setStats([]);
        setTotalCount(0);
      } else {
        setStats(result.stats);
        setTotalCount(result.totalCount);
      }
    } catch (e: any) {
      setError(e.message || 'Ocurrió un error inesperado');
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearchTerm, debouncedFrequencyFilter, categoryFilter]);

  useEffect(() => {
    fetchStats(currentPage);
  }, [currentPage, fetchStats]);
  
  // Refetch on filter change
  useEffect(() => {
    setCurrentPage(1); // Reset to first page on new filter
    fetchStats(1);
  }, [debouncedSearchTerm, debouncedFrequencyFilter, categoryFilter, fetchStats]);


  const getCountBadge = (count: number) => {
    if (count > 5) {
      return <Badge variant="destructive">Muy Alta ({count})</Badge>;
    }
    if (count > 2) {
      return <Badge className="bg-amber-500 text-white">Alta ({count})</Badge>;
    }
    return <Badge variant="secondary">Media ({count})</Badge>;
  };
  
  const handleExcludeClick = async (campaignId: string, contact: string) => {
    const result = await excludeContactFromCampaign(campaignId, contact);
    if(result.success) {
      toast({
        title: "Contacto Excluido",
        description: `El contacto ${contact} ha sido excluido de la campaña y no recibirá más mensajes de ella.`,
      });
      // Refresh the data locally to reflect the change
      setStats(currentStats => {
        return currentStats.map(stat => {
          if (stat.contact === contact) {
            return {
              ...stat,
              campaigns: stat.campaigns.filter(c => c.id !== campaignId),
              count: stat.count - 1,
            };
          }
          return stat;
        }).filter(stat => stat.count >= (frequencyFilter || 1));
      });

    } else {
      toast({
        title: "Error",
        description: result.error || "No se pudo excluir al contacto.",
        variant: "destructive"
      });
    }
  };


  return (
    <>
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Frecuencia de Contactos para esta Semana</CardTitle>
         <CardDescription className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
             Mostrando campañas programadas entre el {format(weekStart, "d 'de' LLLL", { locale: es })} y el {format(weekEnd, "d 'de' LLLL", { locale: es })}.
        </CardDescription>
        <div className="flex flex-col md:flex-row gap-4 pt-4 border-t mt-4">
           <div className="relative w-full md:w-1/3">
             <Label htmlFor="search-contact">Buscar Contacto</Label>
             <Search className="absolute left-2.5 top-[2.3rem] h-4 w-4 text-muted-foreground" />
             <Input 
                id="search-contact"
                placeholder="Buscar por número..." 
                className="pl-8" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
             />
           </div>
           <div className="w-full md:w-1/4">
             <Label htmlFor="frequency-filter">Frecuencia Mínima</Label>
             <Input 
                id="frequency-filter"
                type="number"
                placeholder="Ej: 2"
                min="1"
                value={frequencyFilter || ''}
                onChange={(e) => setFrequencyFilter(parseInt(e.target.value, 10) || undefined)}
             />
           </div>
           <div className="w-full md:w-1/3">
             <Label htmlFor="category-filter">Categoría</Label>
             <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger id="category-filter">
                    <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">Todas las categorías</SelectItem>
                    {campaignCategories.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                </SelectContent>
             </Select>
           </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && stats.length === 0 ? (
          <div className="flex justify-center items-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
           <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error al Cargar Datos</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
            </Alert>
        ) : stats.length > 0 ? (
            <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contacto</TableHead>
                    <TableHead className="text-center">Frecuencia</TableHead>
                    <TableHead>Aparece en Campañas</TableHead>
                    <TableHead>Categorías</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.map((stat) => (
                    <TableRow key={stat.contact}>
                      <TableCell className="font-medium">{stat.contact}</TableCell>
                      <TableCell className="text-center">{getCountBadge(stat.count)}</TableCell>
                       <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {stat.campaigns.map(c => (
                            <AlertDialog key={c.id}>
                              <Badge 
                                variant={c.hasBeenSent ? "secondary" : "outline"}
                                className={cn(
                                    "flex items-center gap-1.5 pr-1",
                                    c.hasBeenSent && "bg-muted text-muted-foreground hover:bg-muted/80 border-transparent"
                                )}
                              >
                                <span>{c.name}</span>
                                {!c.hasBeenSent && (
                                    <AlertDialogTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 rounded-full hover:bg-destructive/20"
                                        title={`Excluir contacto de ${c.name}`}
                                    >
                                        <X className="h-3 w-3 text-destructive" />
                                    </Button>
                                    </AlertDialogTrigger>
                                )}
                              </Badge>
                               <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>¿Confirmar exclusión?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Esto evitará que el contacto <strong>{stat.contact}</strong> reciba mensajes de la campaña <strong>"{c.name}"</strong> en el futuro.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => handleExcludeClick(c.id, stat.contact)}>
                                        Sí, excluir contacto
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                            </AlertDialog>
                          ))}
                        </div>
                      </TableCell>
                       <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {stat.categories.map(cat => (
                            <Badge key={cat} variant="secondary" className="flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                {cat}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
             <div className="flex items-center justify-between mt-4">
                <span className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}. Total: {totalCount} contactos con filtros aplicados.
                </span>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => p - 1)}
                        disabled={currentPage === 1 || isLoading}
                    >
                        <ChevronLeft className="mr-2 h-4 w-4" />
                        Anterior
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => p + 1)}
                        disabled={currentPage >= totalPages || isLoading}
                    >
                        Siguiente
                        <ChevronRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            </div>
          </>
        ) : (
           <div className="text-center py-10 text-muted-foreground">
             No se encontraron contactos que cumplan con los criterios de filtrado para esta semana.
           </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}
