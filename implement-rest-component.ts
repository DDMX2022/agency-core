```typescript
// src/index.ts
import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { Todo } from './models/todo';

const app = express();
const port = 3000;

app.use(cors());
app.use(bodyParser.json());

let todos: Todo[] = [];
let currentId = 1;

// Create a new todo
app.post('/todos', (req, res) => {
  const { title } = req.body;
  const newTodo: Todo = { id: currentId++, title, completed: false };
  todos.push(newTodo);
  res.status(201).json(newTodo);
});

// Get all todos
app.get('/todos', (req, res) => {
  res.json(todos);
});

// Get a single todo by ID
app.get('/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const todo = todos.find(t => t.id === id);
  if (todo) {
    res.json(todo);
  } else {
    res.status(404).send('Todo not found');
  }
});

// Update a todo by ID
app.put('/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { title, completed } = req.body;
  const todo = todos.find(t => t.id === id);
  if (todo) {
    todo.title = title !== undefined ? title : todo.title;
    todo.completed = completed !== undefined ? completed : todo.completed;
    res.json(todo);
  } else {
    res.status(404).send('Todo not found');
  }
});

// Delete a todo by ID
app.delete('/todos/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = todos.findIndex(t => t.id === id);
  if (index !== -1) {
    todos.splice(index, 1);
    res.status(204).send();
  } else {
    res.status(404).send('Todo not found');
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
```

```typescript
// src/models/todo.ts
export interface Todo {
  id: number;
  title: string;
  completed: boolean;
}
```