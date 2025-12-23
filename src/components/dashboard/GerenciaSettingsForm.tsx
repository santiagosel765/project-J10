
"use client";

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Gerencia } from "@/actions/gerenciaActions";
import { updateGerenciaLimits } from "@/actions/gerenciaActions";
import { useToast } from '@/hooks/use-toast';
import { Check, Edit, Loader2, Save, MessageSquare, List, Bot } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface GerenciaSettingsFormProps {
  gerencia: Gerencia;
}

export function GerenciaSettingsForm({ gerencia }: GerenciaSettingsFormProps) {
  const [maxWhatsapp, setMaxWhatsapp] = useState(gerencia.max_whatsapp_messages);
  const [maxSms, setMaxSms] = useState(gerencia.max_sms_messages);
  const [maxAiCalls, setMaxAiCalls] = useState(gerencia.max_ai_calls);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const router = useRouter();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    
    const formData = new FormData(event.currentTarget);
    const result = await updateGerenciaLimits(gerencia.id, formData);

    if (result.success) {
      toast({ title: 'Éxito', description: 'Límites de la gerencia actualizados.' });
      router.refresh();
    } else {
      toast({ title: 'Error', description: result.error || 'No se pudieron actualizar los límites.', variant: 'destructive' });
    }
    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-lg">
        <div className="space-y-2">
            <Label htmlFor="max_whatsapp_messages" className="flex items-center">
                <MessageSquare className="mr-2 h-4 w-4 text-muted-foreground" />
                Límite de Mensajes de WhatsApp / Mes
            </Label>
            <Input
                id="max_whatsapp_messages"
                name="max_whatsapp_messages"
                type="number"
                value={maxWhatsapp}
                onChange={(e) => setMaxWhatsapp(Number(e.target.value))}
                min="0"
                required
            />
        </div>
        <div className="space-y-2">
            <Label htmlFor="max_sms_messages" className="flex items-center">
                <List className="mr-2 h-4 w-4 text-muted-foreground" />
                Límite de Mensajes SMS / Mes
            </Label>
            <Input
                id="max_sms_messages"
                name="max_sms_messages"
                type="number"
                value={maxSms}
                onChange={(e) => setMaxSms(Number(e.target.value))}
                min="0"
                required
            />
        </div>
        <div className="space-y-2">
            <Label htmlFor="max_ai_calls" className="flex items-center">
                <Bot className="mr-2 h-4 w-4 text-muted-foreground" />
                Límite de Llamadas IA / Mes
            </Label>
            <Input
                id="max_ai_calls"
                name="max_ai_calls"
                type="number"
                value={maxAiCalls}
                onChange={(e) => setMaxAiCalls(Number(e.target.value))}
                min="0"
                required
            />
        </div>
        <div className="flex justify-end">
            <Button type="submit" disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isLoading ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
        </div>
    </form>
  );
}
