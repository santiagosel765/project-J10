
"use client";

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { Campaign } from '@/lib/mock-data';
import { addDays, addMonths, addWeeks, parseISO } from 'date-fns';
import { Bot, Mail, MessageSquare, Phone } from 'lucide-react';
import { WhatsappIcon } from '../icons/WhatsappIcon';
import { SmsIcon } from '../icons/SmsIcon';
import { cn } from '@/lib/utils';

interface CampaignCalendarProps {
  campaigns: Campaign[];
}

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  allDay: boolean;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  extendedProps: {
    campaignId: string;
    type: Campaign['type'];
  };
}

const campaignTypeStyles: Record<Campaign['type'], { icon: React.FC<any>, colors: { bg: string, border: string, text: string } }> = {
    whatsapp: { icon: WhatsappIcon, colors: { bg: '#25D366', border: '#128C7E', text: 'white' } },
    sms: { icon: SmsIcon, colors: { bg: '#2196F3', border: '#1976D2', text: 'white' } },
    'llamada-ia': { icon: Bot, colors: { bg: '#00BCD4', border: '#0097A7', text: 'white' } },
    email: { icon: Mail, colors: { bg: '#78909C', border: '#546E7A', text: 'white' } },
    llamada: { icon: Phone, colors: { bg: '#9C27B0', border: '#7B1FA2', text: 'white' } },
};

export function CampaignCalendar({ campaigns }: CampaignCalendarProps) {
  const router = useRouter();

  const calendarEvents = useMemo(() => {
    const events: CalendarEvent[] = [];
    const approvedCampaigns = campaigns.filter(c => c.status === 'Aprobada' && c.schedule.nextRun && c.schedule.time);

    approvedCampaigns.forEach(campaign => {
      const styles = campaignTypeStyles[campaign.type] || campaignTypeStyles.email;
      const startDateTime = `${campaign.schedule.nextRun}T${campaign.schedule.time}`;
      
      const baseEvent = {
        id: campaign.id,
        title: campaign.name,
        start: startDateTime,
        allDay: false,
        backgroundColor: styles.colors.bg,
        borderColor: styles.colors.border,
        textColor: styles.colors.text,
        extendedProps: { 
            campaignId: campaign.id,
            type: campaign.type 
        },
      };

      events.push(baseEvent);

      const nextRunDate = parseISO(startDateTime);
      const calendarEndDate = addMonths(new Date(), 6);

      if (campaign.schedule.frequency === 'daily') {
        let currentDate = addDays(nextRunDate, 1);
        while (currentDate <= calendarEndDate) {
          events.push({ ...baseEvent, id: `${campaign.id}-${currentDate.toISOString()}`, start: currentDate.toISOString() });
          currentDate = addDays(currentDate, 1);
        }
      } else if (campaign.schedule.frequency === 'weekdays') {
        let currentDate = addDays(nextRunDate, 1);
        while (currentDate <= calendarEndDate) {
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) { // 0=Sun, 6=Sat
                events.push({ ...baseEvent, id: `${campaign.id}-${currentDate.toISOString()}`, start: currentDate.toISOString() });
            }
            currentDate = addDays(currentDate, 1);
        }
      } else if (campaign.schedule.frequency === 'weekly') {
        let currentDate = addWeeks(nextRunDate, 1);
        while (currentDate <= calendarEndDate) {
           events.push({ ...baseEvent, id: `${campaign.id}-${currentDate.toISOString()}`, start: currentDate.toISOString() });
          currentDate = addWeeks(currentDate, 1);
        }
      } else if (campaign.schedule.frequency === 'monthly') {
        let currentDate = addMonths(nextRunDate, 1);
         while (currentDate <= calendarEndDate) {
           events.push({ ...baseEvent, id: `${campaign.id}-${currentDate.toISOString()}`, start: currentDate.toISOString() });
          currentDate = addMonths(currentDate, 1);
        }
      }
    });

    return events;
  }, [campaigns]);

  const handleEventClick = (clickInfo: any) => {
    const campaignId = clickInfo.event.extendedProps.campaignId;
    if (campaignId) {
      router.push(`/dashboard/campaign/${campaignId}`);
    }
  };

  const renderEventContent = (eventInfo: any) => {
    const { type } = eventInfo.event.extendedProps;
    const styles = campaignTypeStyles[type] || campaignTypeStyles.email;
    const Icon = styles.icon || MessageSquare;
    return (
      <div 
        className="flex items-center gap-1.5 overflow-hidden text-xs w-full h-full p-1 rounded-sm border"
        style={{ 
            backgroundColor: styles.colors.bg, 
            borderColor: styles.colors.border,
            color: styles.colors.text
        }}
      >
        <Icon className="h-3 w-3 shrink-0" />
        <b className="truncate font-medium">{eventInfo.timeText}</b>
        <span className="truncate font-normal">{eventInfo.event.title}</span>
      </div>
    );
  };


  return (
    <div className="h-full w-full">
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,timeGridDay'
        }}
        buttonText={{
          today: 'Hoy',
          month: 'Mes',
          week: 'Semana',
          day: 'Día',
        }}
        events={calendarEvents}
        locale="es"
        height="100%"
        eventClick={handleEventClick}
        eventContent={renderEventContent}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        displayEventTime={true} 
      />
    </div>
  );
}
