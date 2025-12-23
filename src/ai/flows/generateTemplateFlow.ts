
'use server';
/**
 * @fileOverview An AI flow to generate marketing template content.
 *
 * - generateTemplate - A function that generates template content based on an objective.
 * - GenerateTemplateInput - The input type for the generateTemplate function.
 * - GenerateTemplateOutput - The return type for the generateTemplate function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const GenerateTemplateInputSchema = z.object({
  objective: z
    .string()
    .min(10)
    .describe('A clear and concise objective for the message template.'),
  type: z.enum(["whatsapp", "sms", "email", "llamada"]).describe('The channel type for the template.')
});
export type GenerateTemplateInput = z.infer<typeof GenerateTemplateInputSchema>;

const GenerateTemplateOutputSchema = z.object({
  generatedContent: z
    .string()
    .describe('The generated template content, ready to be used.'),
});
export type GenerateTemplateOutput = z.infer<typeof GenerateTemplateOutputSchema>;


const prompt = ai.definePrompt({
  name: 'generateTemplatePrompt',
  input: {schema: GenerateTemplateInputSchema},
  output: {schema: GenerateTemplateOutputSchema},
  prompt: `Eres un experto en marketing y comunicación digital para una institución financiera. Tu tarea es crear un texto (template) para una campaña de {{type}}.

Objetivo de la campaña: {{{objective}}}

Instrucciones:
1.  El tono debe ser profesional, amigable y confiable.
2.  El mensaje debe ser claro y conciso.
3.  Incluye emojis relevantes y apropiados para el contexto financiero y el objetivo del mensaje. No abuses de ellos.
4.  Si el objetivo implica datos variables (como nombres, montos, fechas), utiliza placeholders con el formato {{nombre_del_parametro}}. Por ejemplo: {{nombre_cliente}}, {{monto_pendiente}}, {{fecha_vencimiento}}.
5.  NO incluyas el placeholder {{contacto}}, ya que es implícito.
6.  Responde únicamente con el contenido del mensaje generado.`,
});

const generateTemplateFlow = ai.defineFlow(
  {
    name: 'generateTemplateFlow',
    inputSchema: GenerateTemplateInputSchema,
    outputSchema: GenerateTemplateOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    return output!;
  }
);

export async function generateTemplate(
  input: GenerateTemplateInput
): Promise<GenerateTemplateOutput> {
  return generateTemplateFlow(input);
}
