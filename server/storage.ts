import { db } from "./db";
import {
  projects,
  orderFiles,
  ctsParts,
  ctsPartConfigs,
  type Project,
  type InsertProject,
  type OrderFile,
  type InsertOrderFile,
  type CtsPart,
  type InsertCtsPart,
  type CtsPartConfig,
  type InsertCtsPartConfig
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Project methods
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, updates: Partial<Project>): Promise<Project>;
  deleteProject(id: number): Promise<boolean>;
  
  // Order file methods
  getProjectFiles(projectId: number): Promise<OrderFile[]>;
  createOrderFile(file: InsertOrderFile): Promise<OrderFile>;
  updateOrderFile(id: number, updates: Partial<OrderFile>): Promise<OrderFile | undefined>;
  
  // CTS parts methods
  getCtsPartsForFile(fileId: number): Promise<CtsPart[]>;
  getCtsPartsCountForFile(fileId: number): Promise<number>;
  createCtsPart(part: InsertCtsPart): Promise<CtsPart>;
  
  // CTS part config methods
  getCtsPartConfig(partNumber: string): Promise<CtsPartConfig | undefined>;
  getAllCtsPartConfigs(): Promise<CtsPartConfig[]>;
  upsertCtsPartConfig(config: InsertCtsPartConfig): Promise<CtsPartConfig>;
}

export class DatabaseStorage implements IStorage {
  // Project methods
  async getProjects(): Promise<Project[]> {
    return await db.select().from(projects).orderBy(desc(projects.createdAt));
  }

  async getProject(id: number): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db.insert(projects).values(insertProject).returning();
    return project;
  }

  async updateProject(id: number, updates: Partial<Project>): Promise<Project> {
    const [updated] = await db.update(projects)
      .set(updates)
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }

  async deleteProject(id: number): Promise<boolean> {
    // Delete associated files first
    await db.delete(orderFiles).where(eq(orderFiles.projectId, id));
    const [deleted] = await db.delete(projects).where(eq(projects.id, id)).returning();
    return !!deleted;
  }

  // Order file methods
  async getProjectFiles(projectId: number): Promise<OrderFile[]> {
    return await db.select().from(orderFiles).where(eq(orderFiles.projectId, projectId));
  }

  async createOrderFile(file: InsertOrderFile): Promise<OrderFile> {
    const [created] = await db.insert(orderFiles).values(file).returning();
    return created;
  }

  async updateOrderFile(id: number, updates: Partial<OrderFile>): Promise<OrderFile | undefined> {
    const [updated] = await db.update(orderFiles)
      .set(updates)
      .where(eq(orderFiles.id, id))
      .returning();
    return updated;
  }

  // CTS parts methods
  async getCtsPartsForFile(fileId: number): Promise<CtsPart[]> {
    return await db.select().from(ctsParts).where(eq(ctsParts.fileId, fileId));
  }

  async getCtsPartsCountForFile(fileId: number): Promise<number> {
    const parts = await db.select().from(ctsParts).where(eq(ctsParts.fileId, fileId));
    return parts.reduce((sum, part) => sum + part.quantity, 0);
  }

  async createCtsPart(part: InsertCtsPart): Promise<CtsPart> {
    const [created] = await db.insert(ctsParts).values(part).returning();
    return created;
  }

  // CTS part config methods
  async getCtsPartConfig(partNumber: string): Promise<CtsPartConfig | undefined> {
    const [config] = await db.select().from(ctsPartConfigs).where(eq(ctsPartConfigs.partNumber, partNumber));
    return config;
  }

  async getAllCtsPartConfigs(): Promise<CtsPartConfig[]> {
    return await db.select().from(ctsPartConfigs);
  }

  async upsertCtsPartConfig(config: InsertCtsPartConfig): Promise<CtsPartConfig> {
    const existing = await this.getCtsPartConfig(config.partNumber);
    if (existing) {
      const [updated] = await db.update(ctsPartConfigs)
        .set({ ...config, updatedAt: new Date() })
        .where(eq(ctsPartConfigs.partNumber, config.partNumber))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(ctsPartConfigs).values(config).returning();
      return created;
    }
  }
}

export const storage = new DatabaseStorage();
