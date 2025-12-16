import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
// uuid no longer needed for list IDs as we use sessionId, tasks use labels.
// But we might want internal IDs? User only asked for cleanup.

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
    sessionId: string;
    tasks: Record<string, Task>; // Keyed by label
    createdAt: string;
    updatedAt: string;
}

// In-memory store: sessionId -> TaskList
const taskLists: Record<string, TaskList> = {};

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

interface Context {
    sessionId: string;
}

interface PluginRequest<T> {
    context: Context;
    args: T;
}

// Helper to get or create list
function getOrCreateTaskList(sessionId: string): TaskList {
    if (!taskLists[sessionId]) {
        taskLists[sessionId] = {
            sessionId,
            tasks: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        console.log(`Created new task list for session ${sessionId}`);
    }
    return taskLists[sessionId];
}

// --- ADD TASK ---
interface AddTaskArgs {
    label: string;
}

app.post('/add_task', (req, res) => {
    try {
        const { context, args } = req.body as PluginRequest<AddTaskArgs>;
        const { label } = args || {};

        if (!context?.sessionId) return res.status(400).json({ error: 'Missing context.sessionId' });
        if (!label) return res.status(400).json({ error: 'Missing label' });

        const taskList = getOrCreateTaskList(context.sessionId);

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
        taskList.updatedAt = new Date().toISOString();

        console.log(`Added task "${label}" to session ${context.sessionId}`);
        res.json(newTask);
    } catch (error: any) {
        console.error('Error in /add_task:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- COMPLETE TASK ---
interface CompleteTaskArgs {
    label: string;
}

app.post('/complete_task', (req, res) => {
    try {
        const { context, args } = req.body as PluginRequest<CompleteTaskArgs>;
        const { label } = args || {};

        if (!context?.sessionId) return res.status(400).json({ error: 'Missing context.sessionId' });
        if (!label) return res.status(400).json({ error: 'Missing label' });

        const taskList = taskLists[context.sessionId];
        if (!taskList) return res.status(404).json({ error: 'No task list found for this session.' });

        const task = taskList.tasks[label];
        if (!task) return res.status(404).json({ error: `Task not found: "${label}"` });

        task.status = 'completed';
        task.updatedAt = new Date().toISOString();
        taskList.updatedAt = new Date().toISOString();

        console.log(`Completed task "${label}" for session ${context.sessionId}`);
        res.json(task);
    } catch (error: any) {
        console.error('Error in /complete_task:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- DELETE TASK ---
interface DeleteTaskArgs {
    label: string;
}

app.post('/delete_task', (req, res) => {
    try {
        const { context, args } = req.body as PluginRequest<DeleteTaskArgs>;
        const { label } = args || {};

        if (!context?.sessionId) return res.status(400).json({ error: 'Missing context.sessionId' });
        if (!label) return res.status(400).json({ error: 'Missing label' });

        const taskList = taskLists[context.sessionId];
        if (!taskList) return res.status(404).json({ error: 'No task list found for this session.' });

        if (!taskList.tasks[label]) {
            return res.status(404).json({ error: `Task not found: "${label}"` });
        }

        delete taskList.tasks[label];
        taskList.updatedAt = new Date().toISOString();

        console.log(`Deleted task "${label}" from session ${context.sessionId}`);
        res.json({ success: true, deletedLabel: label });
    } catch (error: any) {
        console.error('Error in /delete_task:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- LIST TASKS ---
interface ListTasksArgs { }

app.post('/list_tasks', (req, res) => {
    try {
        const { context } = req.body as PluginRequest<ListTasksArgs>;

        if (!context?.sessionId) return res.status(400).json({ error: 'Missing context.sessionId' });

        const taskList = taskLists[context.sessionId];
        if (!taskList) {
            // If explicit list not found, return empty array? Or 404? 
            // "getOrCreate" logic is only on ADD. 
            // Better to return empty array if no tasks created yet.
            return res.json([]);
        }

        const tasksArray = Object.values(taskList.tasks);
        console.log(`Listed ${tasksArray.length} tasks for session ${context.sessionId}`);
        res.json(tasksArray);
    } catch (error: any) {
        console.error('Error in /list_tasks:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- CHECK ALL TASKS COMPLETE ---
interface CheckAllArgs { }

app.post('/check_all_tasks_complete', (req, res) => {
    try {
        const { context } = req.body as PluginRequest<CheckAllArgs>;

        if (!context?.sessionId) return res.status(400).json({ error: 'Missing context.sessionId' });

        const taskList = taskLists[context.sessionId];
        if (!taskList) {
            // No list means no tasks pending. Technically "all complete" is true (vacuously true).
            return res.json({ allComplete: true, remaining: [] });
        }

        const tasksArray = Object.values(taskList.tasks);
        if (tasksArray.length === 0) return res.json({ allComplete: true, remaining: [] });

        const remaining = tasksArray.filter(t => t.status !== 'completed').map(t => t.label);
        const allComplete = remaining.length === 0;

        console.log(`Checked tasks for session ${context.sessionId}: ${allComplete}, remaining: ${remaining.length}`);
        res.json({ allComplete, remaining });
    } catch (error: any) {
        console.error('Error in /check_all_tasks_complete:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Tasks Plugin listening on port ${port}`);
});
