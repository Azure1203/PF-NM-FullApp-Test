import { z } from 'zod';
import { insertProjectSchema, projects, type Project, type OrderFile } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// Project with files for detailed views
export type ProjectWithFiles = Project & { files: OrderFile[] };

// Sync preview data type
export interface SyncPreview {
  totals: {
    parts: number;
    dovetails: number;
    assembledDrawers: number;
    fivePieceDoors: number;
    weightLbs: number;
    maxLength: number;
    fileCount: number;
  };
  palletSize: string;
  customParts: string[];
  flags: {
    hasGlassParts: boolean;
    hasMJDoors: boolean;
    hasRichelieuDoors: boolean;
    hasDoubleThick: boolean;
    hasShakerDoors: boolean;
  };
  fileBreakdowns: Array<{
    name: string;
    coreParts: number;
    dovetails: number;
    assembledDrawers: number;
    fivePieceDoors: number;
    weightLbs: number;
    maxLength: number;
    hasGlassParts: boolean;
    hasMJDoors: boolean;
    hasRichelieuDoors: boolean;
    hasDoubleThick: boolean;
  }>;
}

export const api = {
  orders: {
    list: {
      method: 'GET' as const,
      path: '/api/orders',
      responses: {
        200: z.array(z.custom<Project>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/orders/:id',
      responses: {
        200: z.custom<ProjectWithFiles>(),
        404: errorSchemas.notFound,
      },
    },
    // Upload endpoint accepts multipart/form-data
    upload: {
      method: 'POST' as const,
      path: '/api/orders/upload',
      input: z.any(), // FormData
      responses: {
        201: z.custom<Project>(),
        400: errorSchemas.validation,
      },
    },
    // Update extracted data before sync
    update: {
      method: 'PUT' as const,
      path: '/api/orders/:id',
      input: insertProjectSchema.partial(),
      responses: {
        200: z.custom<Project>(),
        404: errorSchemas.notFound,
      },
    },
    sync: {
      method: 'POST' as const,
      path: '/api/orders/:id/sync',
      responses: {
        200: z.custom<Project>(),
        400: z.object({ message: z.string() }),
        404: errorSchemas.notFound,
      },
    },
    preview: {
      method: 'GET' as const,
      path: '/api/orders/:id/preview',
      responses: {
        200: z.custom<SyncPreview>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/orders/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    }
  }
};

// Backward compatibility exports
export type Order = Project;
export type InsertOrder = z.infer<typeof insertProjectSchema>;

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
