import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

interface Task {
    label: string;
    status: 'pending' | 'completed';
    createdAt: string;
    updatedAt: string;
}

interface TaskList {
    id: string;
    sessionId: string;
    tasks: Record<string, Task>; // Keyed by label
    createdAt: string;
}

// In-memory store: taskListId -> TaskList
const taskLists: Record<string, TaskList> = {};

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

interface Context {
    sessionId: string;
}

// Helper to extract wrapped args if present, or return body directly 
// (Backwards compatibility not strictly needed since we are breaking change, 
// but good practice to handle the specific structure expected by Forge).
// Forge sends: { context: {...}, args: {...} }
// We can just type the body as { context: ..., args: ... } as before.

interface PluginRequest<T> {
    context: Context;
    args: T;
}

// --- CREATE TASK LIST ---
app.post('/create_task_list', (req, res) => {
    try {
        const { context } = req.body as PluginRequest<{}>;

        if (!context?.sessionId) {
            return res.status(400).json({ error: 'Missing context.sessionId' });
        }

        const { sessionId } = context;
        const newListId = uuidv4();

        taskLists[newListId] = {
            id: newListId,
            sessionId,
            tasks: {},
            createdAt: new Date().toISOString()
        };

        console.log(`Created task list ${newListId} for session ${sessionId}`);
        res.json({ id: newListId });
    } catch (error: any) {
        console.error('Error in /create_task_list:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- ADD TASK ---
interface AddTaskArgs {
    taskListId: string;
    label: string;
}

app.post('/add_task', (req, res) => {
    try {
        const { context, args } = req.body as PluginRequest<AddTaskArgs>;
        const { taskListId, label } = args || {};

        if (!context?.sessionId) return res.status(400).json({ error: 'Missing context.sessionId' });
        if (!taskListId) return res.status(400).json({ error: 'Missing taskListId' });
        if (!label) return res.status(400).json({ error: 'Missing label' });

        const taskList = taskLists[taskListId];
        if (!taskList) return res.status(404).json({ error: `Task list not found: ${taskListId}` });

        // Verify session isolation (optional but good practice)
        if (taskList.sessionId !== context.sessionId) {
            // Ideally we might treat this as 403 or 404. Let's say 404 to hide it.
            // return res.status(404).json({ error: `Task list not found` });
            // For debug simplicity, let's just log a warning but allow it if the ID is known?
            // No, strictly enforcing session ownership is safer.
            return res.status(403).json({ error: 'Task list belongs to another session' });
        }

        if (taskList.tasks[label]) {
            return res.status(409).json({ error: `Task with label "${label}" already exists` });
        }

        const newTask: Task = {
            label,
            status: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        taskList.tasks[label] = newTask;
        console.log(`Added task "${label}" to list ${taskListId}`);
        res.json(newTask);
    } catch (error: any) {
        console.error('Error in /add_task:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- COMPLETE TASK ---
interface CompleteTaskArgs {
    taskListId: string;
    label: string;
}

app.post('/complete_task', (req, res) => {
    try {
        const { context, args } = req.body as PluginRequest<CompleteTaskArgs>;
        const { taskListId, label } = args || {};

        if (!context?.sessionId) return res.status(400).json({ error: 'Missing context.sessionId' });
        if (!taskListId) return res.status(400).json({ error: 'Missing taskListId' });
        if (!label) return res.status(400).json({ error: 'Missing label' });

        const taskList = taskLists[taskListId];
        if (!taskList) return res.status(404).json({ error: `Task list not found: ${taskListId}` });
        if (taskList.sessionId !== context.sessionId) return res.status(403).json({ error: 'Access denied' });

        const task = taskList.tasks[label];
        if (!task) return res.status(404).json({ error: `Task not found: "${label}"` });

        task.status = 'completed';
        task.updatedAt = new Date().toISOString();

        console.log(`Completed task "${label}" in list ${taskListId}`);
        res.json(task);
    } catch (error: any) {
        console.error('Error in /complete_task:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- DELETE TASK ---
interface DeleteTaskArgs {
    taskListId: string;
    label: string;
}

app.post('/delete_task', (req, res) => {
    try {
        const { context, args } = req.body as PluginRequest<DeleteTaskArgs>;
        const { taskListId, label } = args || {};

        if (!context?.sessionId) return res.status(400).json({ error: 'Missing context.sessionId' });
        if (!taskListId) return res.status(400).json({ error: 'Missing taskListId' });
        if (!label) return res.status(400).json({ error: 'Missing label' });

        const taskList = taskLists[taskListId];
        if (!taskList) return res.status(404).json({ error: `Task list not found: ${taskListId}` });
        if (taskList.sessionId !== context.sessionId) return res.status(403).json({ error: 'Access denied' });

        if (!taskList.tasks[label]) {
            return res.status(404).json({ error: `Task not found: "${label}"` });
        }

        delete taskList.tasks[label];
        console.log(`Deleted task "${label}" from list ${taskListId}`);
        res.json({ success: true, deletedLabel: label });
    } catch (error: any) {
        console.error('Error in /delete_task:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- LIST TASKS ---
interface ListTasksArgs {
    taskListId: string;
}

app.post('/list_tasks', (req, res) => {
    try {
        const { context, args } = req.body as PluginRequest<ListTasksArgs>;
        const { taskListId } = args || {};

        if (!context?.sessionId) return res.status(400).json({ error: 'Missing context.sessionId' });
        if (!taskListId) return res.status(400).json({ error: 'Missing taskListId' });

        const taskList = taskLists[taskListId];
        if (!taskList) return res.status(404).json({ error: `Task list not found: ${taskListId}` });
        if (taskList.sessionId !== context.sessionId) return res.status(403).json({ error: 'Access denied' });

        const tasksArray = Object.values(taskList.tasks);
        console.log(`Listed ${tasksArray.length} tasks for list ${taskListId}`);
        res.json(tasksArray);
    } catch (error: any) {
        console.error('Error in /list_tasks:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- CHECK ALL TASKS COMPLETE ---
interface CheckAllArgs {
    taskListId: string;
}

app.post('/check_all_tasks_complete', (req, res) => {
    try {
        const { context, args } = req.body as PluginRequest<CheckAllArgs>;
        const { taskListId } = args || {};

        if (!context?.sessionId) return res.status(400).json({ error: 'Missing context.sessionId' });
        if (!taskListId) return res.status(400).json({ error: 'Missing taskListId' });

        const taskList = taskLists[taskListId];
        if (!taskList) return res.status(404).json({ error: `Task list not found: ${taskListId}` });
        if (taskList.sessionId !== context.sessionId) return res.status(403).json({ error: 'Access denied' });

        const tasksArray = Object.values(taskList.tasks);
        // If no tasks, technically "all are complete" or "none to be incomplete".
        // Let's rely on standard logic: every task must be 'completed'.
        // If list is empty: true.
        const allComplete = tasksArray.every(t => t.status === 'completed');

        console.log(`Checked all tasks complete for list ${taskListId}: ${allComplete}`);
        res.json(allComplete); // Returns boolean directly? Or helper? JSON primitives are valid body.
    } catch (error: any) {
        console.error('Error in /check_all_tasks_complete:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Tasks Plugin listening on port ${port}`);
});
