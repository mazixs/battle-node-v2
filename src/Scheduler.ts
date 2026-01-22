import { EventEmitter } from 'events';
import { parseDuration } from './utils/time.js';

export type TaskId = string;
export type TimeString = string | number;

export interface TaskConfig {
    /**
     * Interval in milliseconds or string format (e.g., "10s", "5m").
     */
    interval: TimeString;
    /**
     * Whether to run the task immediately upon scheduling.
     * Default: false
     */
    runImmediately?: boolean;
}

interface ActiveTask {
    id: TaskId;
    intervalMs: number;
    callback: () => Promise<void> | void;
    timer: NodeJS.Timeout | null;
    isExecuting: boolean;
}

/**
 * Lightweight, zero-dependency scheduler.
 * Uses recursive setTimeout to prevent task overlap (drifting is acceptable for RCON context).
 */
export class Scheduler extends EventEmitter {
    private readonly tasks = new Map<TaskId, ActiveTask>();
    private isRunning = false;

    /**
     * Add a repeating task to the scheduler.
     * @param id Unique identifier for the task
     * @param interval Interval (ms number or "10s", "1m" string)
     * @param callback Async function to execute
     * @param options Configuration options
     */
    public addTask(
        id: TaskId, 
        interval: TimeString, 
        callback: () => Promise<void> | void, 
        options: { runImmediately?: boolean } = {}
    ): void {
        if (this.tasks.has(id)) {
            throw new Error(`Task with ID "${id}" already exists.`);
        }

        const intervalMs = parseDuration(interval);
        if (intervalMs < 100) {
            throw new Error('Interval must be at least 100ms to prevent flooding.');
        }

        const task: ActiveTask = {
            id,
            intervalMs,
            callback,
            timer: null,
            isExecuting: false
        };

        this.tasks.set(id, task);

        if (this.isRunning) {
            if (options.runImmediately) {
                this.executeTask(task);
            } else {
                this.scheduleNextRun(task);
            }
        }
    }

    /**
     * Remove a task by ID.
     */
    public removeTask(id: TaskId): boolean {
        const task = this.tasks.get(id);
        if (task) {
            if (task.timer) clearTimeout(task.timer);
            this.tasks.delete(id);
            return true;
        }
        return false;
    }

    /**
     * Start all scheduled tasks.
     */
    public start(): void {
        if (this.isRunning) return;
        this.isRunning = true;

        for (const task of this.tasks.values()) {
            this.scheduleNextRun(task);
        }
    }

    /**
     * Stop all tasks.
     */
    public stop(): void {
        this.isRunning = false;
        for (const task of this.tasks.values()) {
            if (task.timer) {
                clearTimeout(task.timer);
                task.timer = null;
            }
        }
    }

    private scheduleNextRun(task: ActiveTask): void {
        if (!this.isRunning) return;

        task.timer = setTimeout(() => {
            this.executeTask(task);
        }, task.intervalMs);
    }

    private async executeTask(task: ActiveTask): Promise<void> {
        if (!this.isRunning) return;
        
        // Prevent overlapping executions if task takes longer than interval
        if (task.isExecuting) return; 

        task.isExecuting = true;
        
        try {
            await task.callback();
            this.emit('taskSuccess', task.id);
        } catch (error) {
            this.emit('taskError', task.id, error);
            // We do NOT stop the task on error, we just log/emit and reschedule
        } finally {
            task.isExecuting = false;
            // Schedule next run only after completion
            this.scheduleNextRun(task);
        }
    }

    public getTaskIds(): string[] {
        return Array.from(this.tasks.keys());
    }
}
