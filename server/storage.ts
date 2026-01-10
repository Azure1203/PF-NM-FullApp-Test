import { db } from "./db";
import {
  projects,
  orderFiles,
  type Project,
  type InsertProject,
  type OrderFile,
  type InsertOrderFile
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Project methods
  getProjects(): Promise<Project[]>;
  getProject(id: number): Promise<Project | undefined>;
  createProject(project: InsertProject): Promise<Project>;
  updateProject(id: number, updates: Partial<InsertProject>): Promise<Project>;
  deleteProject(id: number): Promise<boolean>;
  
  // Order file methods
  getProjectFiles(projectId: number): Promise<OrderFile[]>;
  createOrderFile(file: InsertOrderFile): Promise<OrderFile>;
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

  async updateProject(id: number, updates: Partial<InsertProject>): Promise<Project> {
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
}

export const storage = new DatabaseStorage();
