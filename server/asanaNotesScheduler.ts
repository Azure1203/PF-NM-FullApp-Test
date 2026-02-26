import { storage } from "./storage";
import { syncAsanaTaskNotes } from "./asanaNotes";
import { log } from "./index";

const NOTES_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FIRST_RUN_DELAY_MS = 5 * 60 * 1000;

let isRunning = false;
let intervalId: NodeJS.Timeout | null = null;

async function syncAllProjectsAsanaNotes(): Promise<{ synced: number; failed: number; total: number }> {
  if (isRunning) {
    log('Asana notes sync already in progress, skipping', 'asana-notes');
    return { synced: 0, failed: 0, total: 0 };
  }

  isRunning = true;
  log('Starting Asana task notes sync for all projects...', 'asana-notes');

  let synced = 0;
  let failed = 0;

  try {
    const allProjects = await storage.getProjects();
    const projectsWithAsana = allProjects.filter(p => !!p.asanaTaskId);
    const total = projectsWithAsana.length;

    log(`Found ${total} projects with Asana task IDs to sync`, 'asana-notes');

    for (const project of projectsWithAsana) {
      try {
        await syncAsanaTaskNotes(project.id, 'daily scheduled notes sync');
        synced++;
      } catch (err: any) {
        log(`Failed to sync notes for project ${project.id} (${project.name}): ${err.message}`, 'asana-notes');
        failed++;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    log(`Asana notes sync complete: ${synced} synced, ${failed} failed of ${total} total`, 'asana-notes');
    return { synced, failed, total };
  } catch (err: any) {
    log(`Asana notes sync error: ${err.message}`, 'asana-notes');
    return { synced, failed, total: 0 };
  } finally {
    isRunning = false;
  }
}

export function startAsanaNotesScheduler(): void {
  if (intervalId) {
    log('Asana notes scheduler already running', 'asana-notes');
    return;
  }

  log(`Asana notes scheduler started (first run in ${FIRST_RUN_DELAY_MS / 60000} minutes, then every ${NOTES_SYNC_INTERVAL_MS / 3600000} hours)`, 'asana-notes');

  setTimeout(() => {
    syncAllProjectsAsanaNotes().catch(err => {
      log(`Asana notes initial sync error: ${err.message}`, 'asana-notes');
    });
  }, FIRST_RUN_DELAY_MS);

  intervalId = setInterval(() => {
    syncAllProjectsAsanaNotes().catch(err => {
      log(`Asana notes scheduled sync error: ${err.message}`, 'asana-notes');
    });
  }, NOTES_SYNC_INTERVAL_MS);
}

export function stopAsanaNotesScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  log('Asana notes scheduler stopped', 'asana-notes');
}

export async function triggerManualAsanaNoteSync(): Promise<{ synced: number; failed: number; total: number }> {
  log('Asana notes manual sync triggered', 'asana-notes');
  return syncAllProjectsAsanaNotes();
}
