import { supabase } from "@/integrations/supabase/client";

const BUCKET_NAME = "normi-archivos";
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB (Supabase default limit)

/**
 * Sanitizes a filename for safe storage:
 * - Converts to lowercase
 * - Removes accents (á→a, é→e, ñ→n, etc.)
 * - Replaces spaces and special characters with hyphens
 * - Limits to 100 characters
 */
export const sanitizeFileName = (fileName: string): string => {
  // Get the extension
  const lastDot = fileName.lastIndexOf('.');
  const name = lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
  const ext = lastDot > 0 ? fileName.substring(lastDot) : '';
  
  // Normalize and remove accents
  let sanitized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
  
  // Limit to 100 characters (including extension)
  const maxNameLength = 100 - ext.length;
  if (sanitized.length > maxNameLength) {
    sanitized = sanitized.substring(0, maxNameLength);
  }
  
  return sanitized + ext.toLowerCase();
};

/**
 * Generates a unique filename with timestamp and random code
 */
const generateUniqueFileName = (sanitizedName: string): string => {
  const timestamp = Date.now();
  const randomCode = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${randomCode}-${sanitizedName}`;
};

export interface ArchivoSubido {
  nombre: string; // Original filename (for display)
  url: string;    // Public URL from Supabase
  tipo: string;   // MIME type
  tamaño: number; // Size in bytes
}

/**
 * Uploads a file to Supabase Storage
 * Returns the original name and public URL
 */
export const subirArchivo = async (file: File): Promise<ArchivoSubido> => {
  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`El archivo "${file.name}" excede el límite de 50MB`);
  }

  // Sanitize and make unique
  const sanitizedName = sanitizeFileName(file.name);
  const uniqueName = generateUniqueFileName(sanitizedName);

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(uniqueName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Error uploading file:', error);
    throw new Error(`Error al subir "${file.name}": ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(data.path);

  return {
    nombre: file.name, // Keep original name for display
    url: urlData.publicUrl,
    tipo: file.type,
    tamaño: file.size,
  };
};

/**
 * Uploads multiple files to Supabase Storage
 * Returns array of uploaded file info
 */
export const subirArchivos = async (files: File[]): Promise<ArchivoSubido[]> => {
  const results = await Promise.all(files.map(subirArchivo));
  return results;
};
