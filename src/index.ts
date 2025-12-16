import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const port = process.env.PORT || 8080;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

interface Task {
    id: string;
    description: string;
    status: string;
    createdAt: string;
    updatedAt: string;
}

// In-memory store: sessionId -> Task[]
const taskStore: Record<string, Task[]> = {};

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

interface Context {
    sessionId: string;
}

interface AddTaskRequest {
    context: Context;
    args: {
        description: string;
        status?: string;
    };
}

app.post('/add_task', (req, res) => {
    try {
        const { context, args } = req.body as AddTaskRequest;

        if (!context?.sessionId) {
            return res.status(400).json({ error: 'Missing context.sessionId' });
        }
        if (!args?.description) {
            return res.status(400).json({ error: 'Missing args.description' });
        }

        const sessionId = context.sessionId;
        const tasks = taskStore[sessionId] || [];

        const newTask: Task = {
            id: uuidv4(),
            description: args.description,
            status: args.status || 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        tasks.push(newTask);
        taskStore[sessionId] = tasks;

        console.log(`Added task for session ${sessionId}: ${newTask.id}`);
        res.json(newTask);
    } catch (error: any) {
        console.error('Error in /add_task:', error);
        res.status(500).json({ error: error.message });
    }
});

interface UpdateTaskRequest {
    context: Context;
    args: {
        taskId: string;
        description?: string;
        status?: string;
    };
}

app.post('/update_task', (req, res) => {
    try {
        const { context, args } = req.body as UpdateTaskRequest;

        if (!context?.sessionId) {
            return res.status(400).json({ error: 'Missing context.sessionId' });
        }
        if (!args?.taskId) {
            return res.status(400).json({ error: 'Missing args.taskId' });
        }

        const sessionId = context.sessionId;
        const tasks = taskStore[sessionId];

        if (!tasks) {
            return res.status(404).json({ error: 'No tasks found for this session.' });
        }

        const taskIndex = tasks.findIndex(t => t.id === args.taskId);
        if (taskIndex === -1) {
            return res.status(404).json({ error: `Task not found: ${args.taskId}` });
        }

        const task = tasks[taskIndex];
        if (args.description) task.description = args.description;
        if (args.status) task.status = args.status;
        task.updatedAt = new Date().toISOString();

        console.log(`Updated task ${task.id} for session ${sessionId}`);
        res.json(task);
    } catch (error: any) {
        console.error('Error in /update_task:', error);
        res.status(500).json({ error: error.message });
    }
});

interface ListTasksRequest {
    context: Context;
}

app.post('/list_tasks', (req, res) => {
    try {
        const { context } = req.body as ListTasksRequest;

        if (!context?.sessionId) {
            return res.status(400).json({ error: 'Missing context.sessionId' });
        }

        const sessionId = context.sessionId;
        const tasks = taskStore[sessionId] || [];

        console.log(`Listed ${tasks.length} tasks for session ${sessionId}`);
        res.json(tasks);
    } catch (error: any) {
        console.error('Error in /list_tasks:', error);
        res.status(500).json({ error: error.message });
    }
});

interface DeleteTaskRequest {
    context: Context;
    args: {
        taskId: string;
    };
}

app.post('/delete_task', (req, res) => {
    try {
        const { context, args } = req.body as DeleteTaskRequest;

        if (!context?.sessionId) {
            return res.status(400).json({ error: 'Missing context.sessionId' });
        }
        if (!args?.taskId) {
            return res.status(400).json({ error: 'Missing args.taskId' });
        }

        const sessionId = context.sessionId;
        let tasks = taskStore[sessionId];

        if (!tasks) {
            return res.status(404).json({ error: 'No tasks found for this session.' });
        }

        const initLength = tasks.length;
        tasks = tasks.filter(t => t.id !== args.taskId);
        taskStore[sessionId] = tasks;

        if (tasks.length === initLength) {
            return res.status(404).json({ error: `Task not found: ${args.taskId}` });
        }

        console.log(`Deleted task ${args.taskId} for session ${sessionId}`);
        res.json({ success: true, deletedId: args.taskId });
    } catch (error: any) {
        console.error('Error in /delete_task:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Tasks Plugin listening on port ${port}`);
});
