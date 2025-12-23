
'use server';

import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from 'uuid';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * Uploads a file (represented as a Data URI) to an S3 bucket.
 * The object is uploaded as private.
 * @param dataUrl The Data URI of the file to upload.
 * @param mediaType The MIME type of the file.
 * @returns An object with the public download URL or an error.
 */
export async function uploadFile(
  dataUrl: string,
  mediaType: string | undefined
): Promise<{ url?: string; error?: string }> {
  try {
    if (!dataUrl) {
      return { error: 'No se proporcionó el contenido del archivo.' };
    }
    
    if (!process.env.AWS_S3_BUCKET_NAME) {
      return { error: 'El nombre del bucket de S3 no está configurado.' };
    }

    const parts = dataUrl.split(';base64,');
    if (parts.length !== 2) {
      return { error: 'Formato de Data URI inválido.' };
    }
    
    const mimeType = parts[0].split(':')[1];
    if (!mimeType) {
        return { error: 'No se pudo determinar el tipo de contenido (MIME type) desde el Data URI.' };
    }

    const base64Data = parts[1];
    const fileBuffer = Buffer.from(base64Data, 'base64');

    const fileExtension = mimeType.split('/')[1] || 'bin';
    const fileName = `JOE/${uuidv4()}.${fileExtension}`;

    const params = {
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ContentType: mimeType,
    };

    await s3Client.send(new PutObjectCommand(params));

    const fileUrl = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileName}`;

    return { url: fileUrl };
  } catch (error: any) {
    console.error("Error al subir archivo a S3:", error);
    return { error: `Error en la subida a S3: ${error.message || error.Code}` };
  }
}

/**
 * Generates a presigned URL for a private object in S3.
 * @param fileUrl The full S3 URL of the file.
 * @returns A temporary, signed URL to access the file.
 */
export async function getPresignedUrlForFile(fileUrl: string): Promise<{ signedUrl?: string, error?: string }> {
    try {
        if (!process.env.AWS_S3_BUCKET_NAME || !process.env.AWS_REGION) {
            return { error: 'El nombre del bucket o la región de S3 no están configurados.' };
        }
        
        const url = new URL(fileUrl);
        const key = url.pathname.substring(1); // Remove leading slash

        const command = new GetObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: key,
        });

        const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 }); // Expires in 1 hour
        
        return { signedUrl };

    } catch (error: any) {
        console.error("Error al generar URL firmada:", error);
        return { error: `Error al firmar URL: ${error.message}` };
    }
}
